// PWA install (Cam 2026-11-24): the course dashboard and the admin are installable web apps, not native downloads.
// This file is the one source for the service worker served at /sw.js (src/app/sw.js/route.ts), so the unit test
// (scripts/pwa-sw-test.ts) runs exactly the script browsers get.
//
// What the worker does, and nothing more:
//   - same-origin GET only; /_next/static/* is cache-first (those files are content-hashed, so a cached copy is
//     never stale);
//   - navigations are network-only, falling back to the precached static /gr-offline.html when the network fails;
//   - /api and everything else is not intercepted at all (no respondWith), so the browser handles it as if there
//     were no worker;
//   - it never caches a page or an API response: only /_next/static/* (status 200, same origin) and gr-offline.html.
//   - each deploy is a new version (the commit SHA): skipWaiting + clients.claim, and caches of other versions are
//     deleted on activate.
// Kill switch: PWA_KILL=1 in the environment (Vercel applies it on the next deploy), or PWA_KILL_SWITCH below set to
// true. Then /sw.js serves a worker that deletes every GreenReserve cache and unregisters itself, and the layouts
// unregister instead of registering. docs/RUNBOOK.md → "Installed app (service worker) kill switch".
// Client-safe: no server imports.
import { liveCommit } from './build-info';

/** In-code kill switch. Flip to true and deploy to remove the service worker from every installed browser. */
export const PWA_KILL_SWITCH = false;

/** Both registrations' scopes. The SW script lives at /sw.js; each layout registers it with its own scope. */
export const PWA_SCOPES = { dashboard: '/dashboard', admin: '/admin' } as const;
export type PwaScope = (typeof PWA_SCOPES)[keyof typeof PWA_SCOPES];

export const PWA_CACHE_PREFIX = 'gr-pwa-';
export const PWA_OFFLINE_URL = '/gr-offline.html';

/** Each app's manifest and home-screen title (the manifests' "name"). */
export const PWA_APPS = {
  dashboard: { manifest: '/dashboard.webmanifest', title: 'GreenReserve' },
  admin: { manifest: '/admin.webmanifest', title: 'GreenReserve Admin' },
} as const;

/** theme-color per dashboard look (the page colour of each look in globals.css) and for the admin glass. */
export const PWA_THEME_COLOR = { dark: '#1D1E1D', light: '#E9EAE6', admin: '#0C1C17' } as const;

/** Server only: is the worker switched off? */
export function pwaKilled(env: Record<string, string | undefined> = process.env): boolean {
  return PWA_KILL_SWITCH || env.PWA_KILL === '1';
}

/** The deploy's version: the seven-character commit SHA (liveCommit, as /api/health shows it), else 'dev'. */
export function pwaVersion(env: Record<string, string | undefined> = process.env): string {
  return liveCommit(env) ?? 'dev';
}

/** The service worker's source. `killed` returns the self-removing worker instead. */
export function buildServiceWorker({ version, killed }: { version: string; killed: boolean }): string {
  const v = JSON.stringify(version.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64) || 'dev');
  const prefix = JSON.stringify(PWA_CACHE_PREFIX);
  const offline = JSON.stringify(PWA_OFFLINE_URL);

  if (killed) {
    return `/* GreenReserve service worker: switched off (${v}). Clears its caches and unregisters. */
'use strict';
const PREFIX = ${prefix};
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX)).map((k) => caches.delete(k)));
    // No reload of open windows: this worker has no fetch handler, so they already go straight to the network, and
    // a reload could drop a half-filled form.
    await self.registration.unregister();
  })());
});
`;
  }

  return `/* GreenReserve service worker ${v}. Source: src/lib/pwa.ts. Caches only /_next/static/* and the offline page. */
'use strict';
const VERSION = ${v};
const PREFIX = ${prefix};
const CACHE = PREFIX + VERSION;
const OFFLINE_URL = ${offline};

// 'static' (cache-first), 'navigate' (network-only, offline page on failure) or 'pass' (not intercepted).
function routeRequest(method, url, mode, origin) {
  if (method !== 'GET') return 'pass';
  let u;
  try { u = new URL(url); } catch (e) { return 'pass'; }
  if (u.origin !== origin) return 'pass';
  if (u.pathname === '/api' || u.pathname.startsWith('/api/')) return 'pass';
  if (u.pathname.startsWith('/_next/static/')) return 'static';
  if (mode === 'navigate') return 'navigate';
  return 'pass';
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// The cache is optional: if storage is full or broken, the file still comes from the network (never a failed load).
// The write is not awaited by the page: it rides event.waitUntil, so a first load never waits on the cache.
async function cacheFirst(event, request) {
  let cache = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
  } catch (e) { cache = null; }
  const res = await fetch(request);
  // Only a whole, same-origin 200 is kept; anything else goes straight through.
  if (cache && res && res.status === 200 && res.type === 'basic') {
    event.waitUntil(cache.put(request, res.clone()).catch(() => undefined));
  }
  return res;
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (err) {
    let page;
    try { page = await (await caches.open(CACHE)).match(OFFLINE_URL); } catch (e) { page = undefined; }
    if (page) return page;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const r = event.request;
  const route = routeRequest(r.method, r.url, r.mode, self.location.origin);
  if (route === 'static') event.respondWith(cacheFirst(event, r));
  else if (route === 'navigate') event.respondWith(networkOnly(r));
  // 'pass': no respondWith, so the browser fetches it as if there were no worker.
});
`;
}
