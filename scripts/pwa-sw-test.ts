// PWA install (Cam 2026-11-24): the service worker's routing and caching, run on the exact script /sw.js serves
// (buildServiceWorker in src/lib/pwa.ts) inside a sandbox with a fake CacheStorage and fetch. Also pins the
// manifests, the icons, the kill switch, where the worker is registered, and the Safari instruction picker.
// Run: npx tsx scripts/pwa-sw-test.ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import vm from 'vm';
import { buildServiceWorker, PWA_APPS, pwaKilled, pwaVersion, PWA_KILL_SWITCH, PWA_CACHE_PREFIX, PWA_OFFLINE_URL } from '../src/lib/pwa';
import { safariKind, SAFARI_INSTALL_TEXT } from '../src/components/pwa/install-store';
import { GET as swRoute } from '../src/app/sw.js/route';

let failed = 0;
const check = (name: string, ok: boolean, got?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || got === undefined ? '' : `  got: ${JSON.stringify(got)}`}`); if (!ok) failed++; };

const ORIGIN = 'https://greenreserve.app';
const abs = (u: string) => new URL(u, ORIGIN).toString();

// ---- A small SW world: caches, fetch, self ----
type Res = Response & { type: ResponseType };
function res(body: string, status = 200, type: ResponseType = 'basic'): Res {
  const r = new Response(body, { status }) as Res;
  Object.defineProperty(r, 'type', { value: type });
  return r;
}
class SwRequest extends Request {
  constructor(input: string | Request, init?: RequestInit) { super(typeof input === 'string' ? abs(input) : input, init); }
}
function makeWorld(network: (url: string) => Res | Promise<Res>) {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (r: string | Request) => abs(typeof r === 'string' ? r : r.url);
  const fetched: string[] = [];
  const fetchFn = async (r: string | Request) => { const u = keyOf(r); fetched.push(u); return network(u); };
  const openCache = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (r: string | Request) => m.get(keyOf(r))?.clone(),
      put: async (r: string | Request, v: Response) => { m.set(keyOf(r), v); },
      add: async (r: string | Request) => { const v = await fetchFn(r); if (!v.ok) throw new Error('add failed'); m.set(keyOf(r), v); },
    };
  };
  const caches = {
    open: async (name: string) => openCache(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const log = { skipWaiting: 0, claim: 0, unregister: 0, navigated: [] as string[] };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (t: string, fn: (e: unknown) => void) => { (listeners[t] ||= []).push(fn); },
    skipWaiting: async () => { log.skipWaiting++; },
    clients: {
      claim: async () => { log.claim++; },
      matchAll: async () => [{ url: abs('/dashboard'), navigate: async (u: string) => { log.navigated.push(u); } }],
    },
    registration: { unregister: async () => { log.unregister++; return true; } },
  };
  return { stores, fetched, caches, self, listeners, log, fetchFn };
}
function load(source: string, world: ReturnType<typeof makeWorld>) {
  const ctx = vm.createContext({ self: world.self, caches: world.caches, fetch: world.fetchFn, Request: SwRequest, URL, Promise, console });
  vm.runInContext(source, ctx);
  return ctx;
}
async function lifecycle(world: ReturnType<typeof makeWorld>, type: 'install' | 'activate') {
  const waits: Promise<unknown>[] = [];
  for (const fn of world.listeners[type] || []) fn({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);
}
/** Dispatches a fetch; returns null when the worker did not call respondWith (the browser handles it). */
async function dispatch(world: ReturnType<typeof makeWorld>, url: string, opts: { method?: string; mode?: string } = {}) {
  let answer: Promise<Response> | null = null;
  const request = { url: abs(url), method: opts.method || 'GET', mode: opts.mode || 'cors' };
  for (const fn of world.listeners.fetch || []) fn({ request, respondWith: (p: Promise<Response>) => { answer = p; } });
  return answer === null ? null : await (answer as Promise<Response>);
}

const SHA = 'abc123def';
const CACHE = PWA_CACHE_PREFIX + SHA;
const OFFLINE_HTML = readFileSync('public/gr-offline.html', 'utf8');

async function main() {
  // ---- The served script ----
  const src = buildServiceWorker({ version: SHA, killed: false });
  new vm.Script(src); // parses
  check('script names its version (the commit SHA)', src.includes(`"${SHA}"`));
  check('version is sanitised into the script', !buildServiceWorker({ version: `x";alert(1);//`, killed: false }).includes('alert(1);//"'));
  check('pwaVersion: Vercel SHA, else dev', pwaVersion({ VERCEL_GIT_COMMIT_SHA: 'f00d' }) === 'f00d' && pwaVersion({}) === 'dev');
  check('kill switch: in-code switch is off, env PWA_KILL=1 turns it on', PWA_KILL_SWITCH === false && pwaKilled({ PWA_KILL: '1' }) && !pwaKilled({}) && !pwaKilled({ PWA_KILL: '0' }));

  // ---- Routing ----
  const world = makeWorld((url) => {
    const p = new URL(url).pathname;
    if (p === PWA_OFFLINE_URL) return res(OFFLINE_HTML);
    if (p === '/_next/static/chunks/missing.js') return res('nope', 404);
    if (p.startsWith('/_next/static/')) return res('chunk:' + p);
    return res('<html>signed in page ' + p + '</html>');
  });
  const ctx = load(src, world) as unknown as { routeRequest: (m: string, u: string, mode: string, o: string) => string };
  const route = (url: string, method = 'GET', mode = 'cors') => ctx.routeRequest(method, abs(url), mode, ORIGIN);
  check('route: /_next/static GET is static', route('/_next/static/chunks/app.js') === 'static');
  check('route: same-origin navigation is navigate', route('/dashboard/settings', 'GET', 'navigate') === 'navigate');
  check('route: /api GET is not intercepted', route('/api/operator/me') === 'pass' && route('/api') === 'pass');
  check('route: /api navigation is not intercepted', route('/api/admin/export.csv', 'GET', 'navigate') === 'pass');
  check('route: POST is not intercepted (even to static)', route('/_next/static/x.js', 'POST') === 'pass' && route('/dashboard', 'POST', 'navigate') === 'pass');
  check('route: other origins are not intercepted', ctx.routeRequest('GET', 'https://js.stripe.com/_next/static/a.js', 'cors', ORIGIN) === 'pass'
    && ctx.routeRequest('GET', 'https://evil.example/dashboard', 'navigate', ORIGIN) === 'pass');
  check('route: everything else is not intercepted', ['/pwa/icon-192.png', '/dashboard?_rsc=1', '/_next/image?url=x', '/sw.js', '/brand/mark.svg'].every(u => route(u) === 'pass'));
  check('route: /apiary is not /api', route('/apiary', 'GET', 'navigate') === 'navigate');

  // ---- Install: precaches the offline page only; skipWaiting ----
  await lifecycle(world, 'install');
  check('install: one cache, named for the version', [...world.stores.keys()].join() === CACHE);
  check('install: precaches only gr-offline.html', [...world.stores.get(CACHE)!.keys()].join() === abs(PWA_OFFLINE_URL));
  check('install: skipWaiting', world.log.skipWaiting === 1);

  // ---- Activate: deletes our old versions only; clients.claim ----
  world.stores.set(PWA_CACHE_PREFIX + 'old', new Map());
  world.stores.set('someone-else', new Map());
  await lifecycle(world, 'activate');
  check('activate: old versions deleted, current and foreign caches kept', [...world.stores.keys()].sort().join() === [CACHE, 'someone-else'].sort().join(), [...world.stores.keys()]);
  check('activate: clients.claim', world.log.claim === 1);

  // ---- Fetch ----
  const n0 = world.fetched.length;
  const a = await dispatch(world, '/_next/static/chunks/app.js');
  const b = await dispatch(world, '/_next/static/chunks/app.js');
  check('static: first from network, then from cache', (await a!.text()) === 'chunk:/_next/static/chunks/app.js' && (await b!.text()) === 'chunk:/_next/static/chunks/app.js'
    && world.fetched.length === n0 + 1);
  await dispatch(world, '/_next/static/chunks/missing.js');
  check('static: a 404 is not cached', !world.stores.get(CACHE)!.has(abs('/_next/static/chunks/missing.js')));

  const nav = await dispatch(world, '/dashboard/money', { mode: 'navigate' });
  check('navigate: from the network', (await nav!.text()).includes('signed in page /dashboard/money'));
  check('api: not intercepted', (await dispatch(world, '/api/operator/bookings')) === null && (await dispatch(world, '/api/admin/session', { mode: 'navigate' })) === null);
  check('other GET: not intercepted', (await dispatch(world, '/pwa/icon-512.png')) === null && (await dispatch(world, '/dashboard?_rsc=abc')) === null);
  check('cross-origin: not intercepted', (await dispatch(world, 'https://api.stripe.com/v1/x')) === null);
  check('POST: not intercepted', (await dispatch(world, '/dashboard', { method: 'POST', mode: 'navigate' })) === null);
  const keys = [...world.stores.get(CACHE)!.keys()].map(k => new URL(k).pathname).sort();
  check('cache holds only /_next/static/* and gr-offline.html (no page, no API)', keys.every(p => p.startsWith('/_next/static/') || p === PWA_OFFLINE_URL), keys);

  // Offline: navigation falls back to the precached page; static still served from cache.
  const offline = makeWorld(() => { throw new TypeError('Failed to fetch'); });
  const seed = new Map<string, Response>([[abs(PWA_OFFLINE_URL), res(OFFLINE_HTML)], [abs('/_next/static/a.js'), res('chunk-a')]]);
  offline.stores.set(CACHE, seed);
  load(src, offline);
  const off = await dispatch(offline, '/dashboard', { mode: 'navigate' });
  check('offline navigation: the offline page', (await off!.text()).includes("You're offline"));
  check('offline static: from cache', (await (await dispatch(offline, '/_next/static/a.js'))!.text()) === 'chunk-a');
  check('offline API: still not intercepted', (await dispatch(offline, '/api/operator/me')) === null);
  // With no offline page cached the navigation fails like the network did (never some other page).
  offline.stores.get(CACHE)!.delete(abs(PWA_OFFLINE_URL));
  let threw = false;
  try { await dispatch(offline, '/dashboard', { mode: 'navigate' }); } catch { threw = true; }
  check('offline navigation without the page: the network error', threw);

  // ---- Killed worker: no fetch handler; clears our caches, unregisters, reloads open windows ----
  const killedSrc = buildServiceWorker({ version: SHA, killed: true });
  new vm.Script(killedSrc);
  const k = makeWorld(() => res('x'));
  k.stores.set(CACHE, new Map()); k.stores.set(PWA_CACHE_PREFIX + 'old', new Map()); k.stores.set('someone-else', new Map());
  load(killedSrc, k);
  check('killed: no fetch handler', !(k.listeners.fetch || []).length);
  await lifecycle(k, 'install');
  await lifecycle(k, 'activate');
  check('killed: every gr-pwa cache deleted, foreign kept', [...k.stores.keys()].join() === 'someone-else', [...k.stores.keys()]);
  check('killed: unregisters and reloads open windows', k.log.unregister === 1 && k.log.navigated.length === 1);

  // ---- The /sw.js route ----
  const prev = { kill: process.env.PWA_KILL, sha: process.env.VERCEL_GIT_COMMIT_SHA };
  process.env.VERCEL_GIT_COMMIT_SHA = 'deadbeef';
  delete process.env.PWA_KILL;
  const r1 = await swRoute();
  const body1 = await r1.text();
  check('/sw.js: JavaScript, never cached', /javascript/.test(r1.headers.get('content-type') || '') && /no-cache/.test(r1.headers.get('cache-control') || '') && /no-store/.test(r1.headers.get('cache-control') || ''));
  check('/sw.js: carries the commit SHA and the fetch handler', body1.includes('"deadbeef"') && body1.includes("addEventListener('fetch'"));
  process.env.PWA_KILL = '1';
  const body2 = await (await swRoute()).text();
  check('/sw.js with PWA_KILL=1: the self-removing worker', body2.includes('unregister()') && !body2.includes("addEventListener('fetch'"));
  if (prev.kill === undefined) delete process.env.PWA_KILL; else process.env.PWA_KILL = prev.kill;
  if (prev.sha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA; else process.env.VERCEL_GIT_COMMIT_SHA = prev.sha;

  // ---- Manifests and icons ----
  for (const [file, scope, name, bg] of [['public/dashboard.webmanifest', '/dashboard', 'GreenReserve', '#1D1E1D'], ['public/admin.webmanifest', '/admin', 'GreenReserve Admin', '#0C1C17']] as const) {
    const m = JSON.parse(readFileSync(file, 'utf8'));
    check(`${file}: scope, start_url, name, standalone`, m.scope === scope && m.start_url === scope && m.name === name && m.display === 'standalone');
    check(`${file}: colours`, m.theme_color === bg && m.background_color === bg);
    check(`${file}: name matches PWA_APPS`, Object.values(PWA_APPS).some(a => a.manifest === '/' + file.split('/')[1] && a.title === m.name));
    const icons = m.icons as { src: string; sizes: string; purpose: string }[];
    check(`${file}: 192, 512 and a maskable 512`, icons.some(i => i.sizes === '192x192' && i.purpose === 'any') && icons.some(i => i.sizes === '512x512' && i.purpose === 'any') && icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
    for (const i of icons) {
      const buf = readFileSync(join('public', i.src));
      const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
      check(`${i.src}: a ${i.sizes} PNG`, buf.toString('latin1', 1, 4) === 'PNG' && `${w}x${h}` === i.sizes, `${w}x${h}`);
    }
  }
  check('offline page: static, no scripts', OFFLINE_HTML.includes("You're offline") && !/<script/i.test(OFFLINE_HTML));

  // ---- Only the dashboard and admin layouts link a manifest or register the worker ----
  const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = walk('src').filter(f => /\.(tsx?|jsx?)$/.test(f));
  const linking = files.filter(f => /\.webmanifest|PWA_APPS\.\w+\.manifest/.test(readFileSync(f, 'utf8'))).sort();
  check('manifests linked only from the two layouts (named in lib/pwa)', linking.join() === ['src/app/admin/layout.tsx', 'src/app/dashboard/layout.tsx', 'src/lib/pwa.ts'].join(), linking);
  check('each layout links its own manifest', readFileSync('src/app/dashboard/layout.tsx', 'utf8').includes('manifest={PWA_APPS.dashboard.manifest}') && readFileSync('src/app/admin/layout.tsx', 'utf8').includes('manifest={PWA_APPS.admin.manifest}'));
  const registering = files.filter(f => /import PwaRegister/.test(readFileSync(f, 'utf8'))).sort();
  check('worker registered only from the two layouts', registering.join() === ['src/app/admin/layout.tsx', 'src/app/dashboard/layout.tsx'].join(), registering);
  check('dashboard registers /dashboard, admin registers /admin',
    readFileSync('src/app/dashboard/layout.tsx', 'utf8').includes('scope={PWA_SCOPES.dashboard}') && readFileSync('src/app/admin/layout.tsx', 'utf8').includes('scope={PWA_SCOPES.admin}'));
  check('/cam is left alone', walk('src/app/cam').every(f => !/pwa|webmanifest/i.test(readFileSync(f, 'utf8'))));

  // ---- Safari's instruction ----
  const UA = {
    ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
  };
  check('iPad: Share, then Add to Home Screen', safariKind(UA.ipad, 5) === 'ios' && safariKind(UA.ipadDesktop, 5) === 'ios');
  check('Mac Safari: File, then Add to Dock', safariKind(UA.ipadDesktop, 0) === 'mac-safari');
  check('Chrome and Firefox: no Safari text', safariKind(UA.macChrome, 0) === null && safariKind(UA.winChrome, 0) === null && safariKind(UA.macFirefox, 0) === null);
  check('Safari text wording', SAFARI_INSTALL_TEXT.ios.includes('Share, then Add to Home Screen') && SAFARI_INSTALL_TEXT['mac-safari'].includes('File, then Add to Dock'));

  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
