// PWA install (Cam 2026-11-24): the constants the browser side needs (PwaRegister, op-theme's theme-color), split
// from src/lib/pwa.ts, which reads process.env and builds the service worker. No imports, no env: the client-bundle
// guard (scripts/client-bundle-test.ts, audit M12) keeps it that way.

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
