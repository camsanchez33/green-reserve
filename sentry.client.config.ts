// PERF-1: the browser SDK is loaded AFTER the page is interactive, not in the
// first-load bundle. In the bundle it cost every page on the site 105 kB of
// shared JS (103 kB -> 208 kB with Session Replay, 170 kB without), and
// Lighthouse's slow-4G model charges those bytes to LCP: Home measured 2.0s
// without Sentry, 3.5-4.3s with it — the numbers production reported.
//
// Nothing is lost for errors: until the SDK arrives, uncaught errors and
// unhandled rejections are buffered and replayed into Sentry once it inits.
// Session Replay starts from that point too (errors before the visitor's first
// click, key or scroll — or the first 10s — carry no replay). Browser
// performance tracing is off — Lighthouse covers page speed; server tracing
// (money paths at 100%) is untouched in sentry.server.config.ts.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && typeof window !== 'undefined') {
  const early: unknown[] = [];
  // Capped: an error loop before init must not grow this without bound.
  const keep = (x: unknown) => { if (early.length < 50) early.push(x); };
  const onError = (e: ErrorEvent) => keep(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => keep(e.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  const load = () => {
    import('@sentry/nextjs').then(Sentry => {
      Sentry.init({
        dsn,
        replaysOnErrorSampleRate: 1.0,
        replaysSessionSampleRate: 0.05,
        integrations: [Sentry.replayIntegration()],
      });
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      for (const err of early.splice(0)) Sentry.captureException(err);
    }).catch(() => {
      // Blocked (ad blockers) or offline: nothing to report to — stop buffering.
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      early.length = 0;
    });
  };
  // Init (and Replay's first DOM snapshot) is real main-thread work — ~200ms
  // of blocking on a mid phone. So it waits for the visitor's first input, or
  // 10s, whichever is first: never inside the page's first seconds.
  let started = false;
  const INPUTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
  const start = () => {
    if (started) return;
    started = true;
    INPUTS.forEach(t => window.removeEventListener(t, start));
    load();
  };
  INPUTS.forEach(t => window.addEventListener(t, start, { once: true, passive: true }));
  setTimeout(start, 10_000);
}

export {};
