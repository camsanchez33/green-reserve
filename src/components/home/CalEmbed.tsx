'use client';
import { useEffect, useRef, useState } from 'react';
import s from '@/app/home.module.css';

// "Book a call" (homepage redo, Cam 2026-11-18): Cal.com's inline embed of the same event type the admin
// Inquiries calls use (CALCOM_BOOKING_URL, read on the server by lib/calcom). The booking is tagged
// metadata[source]=homepage, as the /demo redirect does, so the Cal.com webhook opens an inquiry for it.
// DECISIONS (CAL-2): an earlier in-page embed rendered blank live. This one is Cal.com's own embed script,
// tested against real cal.com, and it never leaves the box blank: until the calendar says it is ready the
// box offers the calendar on Cal.com's own page, and if it fails that link is all that shows.

type CalFn = ((...a: unknown[]) => void) & { q?: unknown[][]; ns?: Record<string, (...a: unknown[]) => void>; loaded?: boolean };
declare global { interface Window { Cal?: CalFn } }

const NS = 'grhome';
const EMBED_JS = 'https://app.cal.com/embed/embed.js';

/** Cal.com's documented loader: queues calls on window.Cal until embed.js has loaded. */
function loadCal(): CalFn {
  if (window.Cal) return window.Cal;
  const cal = function (...args: unknown[]) {
    const c = cal as CalFn;
    if (!c.loaded) {
      c.ns = {}; c.q = c.q || [];
      const sc = document.createElement('script'); sc.src = EMBED_JS; sc.async = true; document.head.appendChild(sc);
      c.loaded = true;
    }
    if (args[0] === 'init') {
      const api = function (...a: unknown[]) { (api as CalFn).q!.push(a); } as CalFn;
      api.q = [];
      const ns = args[1];
      if (typeof ns === 'string') { c.ns![ns] = c.ns![ns] || api; c.ns![ns] && (c.ns![ns] as CalFn).q!.push(args); c.q!.push(['initNamespace', ns]); }
      else c.q!.push(args);
      return;
    }
    c.q!.push(args);
  } as CalFn;
  window.Cal = cal;
  return cal;
}

export default function CalEmbed({ bookingUrl }: { bookingUrl: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const u = new URL(bookingUrl);
  const calLink = u.pathname.replace(/^\/+|\/+$/g, '');
  const fallback = '/demo';

  useEffect(() => {
    if (!box.current) return;
    const Cal = loadCal();
    Cal('init', NS, { origin: u.origin });
    const api = () => Cal.ns![NS];
    api()('inline', {
      elementOrSelector: '#gr-cal-inline',
      calLink,
      config: { layout: 'month_view', theme: 'light', 'metadata[source]': 'homepage' },
    });
    api()('ui', { theme: 'light', cssVarsPerTheme: { light: { 'cal-brand': '#173B2A' }, dark: { 'cal-brand': '#173B2A' } }, hideEventTypeDetails: false, layout: 'month_view' });
    api()('on', { action: 'linkReady', callback: () => setState('ready') });
    api()('on', { action: 'linkFailed', callback: () => setState('failed') });
    // No word from the embed (script blocked, network) — say so instead of leaving a blank box.
    const t = window.setTimeout(() => setState(st => (st === 'loading' ? 'failed' : st)), 15000);
    return () => window.clearTimeout(t);
    // The booking link is fixed for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={s.calBox}>
      <div id="gr-cal-inline" ref={box} className={state === 'failed' ? s.calHidden : s.calInline} aria-busy={state === 'loading'} />
      {state !== 'ready' && (
        <p className={s.calNote} aria-live="polite">
          {state === 'loading' ? 'Loading the calendar. ' : 'The calendar didn’t load here. '}
          <a href={fallback}>Open the calendar</a>
        </p>
      )}
    </div>
  );
}
