// PWA install (Cam 2026-11-24): the service worker for the installed dashboard and admin. The script and its rules
// live in src/lib/pwa.ts. Public on purpose (a browser fetches it with no session) and it reveals nothing: the same
// bytes for everyone, carrying only the deploy's commit SHA. Never cached by the browser or the CDN, so a new deploy
// (or the kill switch, PWA_KILL=1) reaches every installed app on its next page load.
import { buildServiceWorker, pwaKilled, pwaVersion } from '@/lib/pwa';

export const dynamic = 'force-dynamic';

export async function GET() {
  const body = buildServiceWorker({ version: pwaVersion(), killed: pwaKilled() });
  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  });
}
