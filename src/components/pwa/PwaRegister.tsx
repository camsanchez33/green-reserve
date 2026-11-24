'use client';
// PWA install (Cam 2026-11-24): registers /sw.js for one scope (/dashboard or /admin), from that area's layout only,
// so golfer pages and the homepage never get a worker. With the kill switch on (the layout passes killed), it
// unregisters this scope's worker and clears its caches instead. Production builds only: in `next dev` the chunk
// URLs are not content-hashed, and a cache-first copy would go stale between edits.
//
// It also catches beforeinstallprompt as early as the page allows (an inline listener, so an event that fires
// before React hydrates is not lost) for the "Install app" button (useInstallApp).
import { useEffect } from 'react';
import { PWA_CACHE_PREFIX, type PwaScope } from '@/lib/pwa';
import { captureInstallPrompt } from './install-store';

// Runs during HTML parsing, before hydration. Keeps the event for the button instead of Chrome's own mini-bar.
const EARLY_LISTENER = `window.__grInstall=window.__grInstall||null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__grInstall=e;window.dispatchEvent(new Event('gr-install-change'))});window.addEventListener('appinstalled',function(){window.__grInstall=null;window.dispatchEvent(new Event('gr-install-change'))});`;

/**
 * manifest / appTitle: rendered here as tags, not through Next's `metadata`. Next 15 streams metadata into <body> for
 * ordinary browsers, and Chrome (and Safari's home-screen tags) only read them from <head>; React hoists these into
 * <head>. Found by the Lighthouse 11 install check (scripts/pwa-install-test.ts).
 */
export default function PwaRegister({ scope, killed, manifest, appTitle }: { scope: PwaScope; killed: boolean; manifest: string; appTitle: string }) {
  useEffect(() => {
    captureInstallPrompt();
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    if (killed) {
      (async () => {
        const regs = await sw.getRegistrations();
        await Promise.all(regs.filter(r => new URL(r.scope).pathname.startsWith(scope)).map(r => r.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter(k => k.startsWith(PWA_CACHE_PREFIX)).map(k => caches.delete(k)));
        }
      })().catch(err => console.error(JSON.stringify({ ev: 'pwa.unregister_failed', error: err instanceof Error ? err.message : String(err) })));
      return;
    }
    // updateViaCache 'none': the browser always asks the server for /sw.js, so a deploy is picked up on the next load.
    sw.register('/sw.js', { scope, updateViaCache: 'none' })
      .catch(err => console.error(JSON.stringify({ ev: 'pwa.register_failed', error: err instanceof Error ? err.message : String(err) })));
  }, [scope, killed]);

  return (
    <>
      <link rel="manifest" href={manifest} />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content={appTitle} />
      <meta name="apple-mobile-web-app-status-bar-style" content="black" />
      <script dangerouslySetInnerHTML={{ __html: EARLY_LISTENER }} />
    </>
  );
}
