'use client';
// /call/[token] — the course books its discovery call. Public look, no session.
// CAL-2 (Cam 2026-09-29): Cal.com is the only scheduler. The page embeds the
// Cal.com booker; the booking reaches GreenReserve through /api/calcom/webhook,
// so the page checks back quietly and flips to "You're booked" once it lands.
// Moving or cancelling happens on Cal.com's own pages.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Phone, Check, CalendarClock, Loader2 } from 'lucide-react';

type Booked = { scheduledAt: string; durationMin: number; direction: string; phone: string };
type Info = {
  courseName: string; contactFirst: string; phone: string; durationMin: number; agendaLines: string[];
  booked: Booked | null;
  calcom: CalEmbed | null; calcomManage: { reschedule: string; cancel: string } | null;
};
type CalEmbed = { origin: string; calLink: string; config: Record<string, string> };

// Cal.com's official inline embed. A bare <iframe> of the booking page renders
// blank — the embedded page stays hidden until embed.js on THIS page completes
// its handshake — so load their snippet (verbatim shape of
// packages/embeds/embed-snippet) and mount with Cal('inline').
type CalFn = ((...args: unknown[]) => void) & { loaded?: boolean; ns?: Record<string, CalFn>; q?: unknown[] };
declare global { interface Window { Cal?: CalFn } }
const EMBED_JS = 'https://app.cal.com/embed/embed.js';
const NS = 'grcall';

function loadCal(): CalFn {
  const w = window;
  if (!w.Cal) {
    const push = (api: CalFn, args: IArguments | unknown[]) => { (api.q = api.q || []).push(args); };
    const cal: CalFn = function (...args: unknown[]) {
      const c = w.Cal!;
      if (!c.loaded) {
        c.ns = {}; c.q = c.q || [];
        const el = document.createElement('script'); el.src = EMBED_JS; document.head.appendChild(el);
        c.loaded = true;
      }
      if (args[0] === 'init') {
        const api: CalFn = function (...a: unknown[]) { push(api, a); };
        const ns = args[1];
        if (typeof ns === 'string') {
          c.ns![ns] = c.ns![ns] || api;
          push(c.ns![ns], args);
          push(c, ['initNamespace', ns]);
        } else push(c, args);
        return;
      }
      push(c, args);
    };
    w.Cal = cal;
  }
  return w.Cal;
}

function CalInline({ embed, onBooked }: { embed: CalEmbed; onBooked: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const booked = useRef(onBooked);
  booked.current = onBooked;
  const mounted = useRef(false);
  useEffect(() => {
    // Once per mount: Cal('inline') calls are queued until embed.js loads, so a
    // second run (React dev double-invoke) would draw a second calendar.
    if (!box.current || mounted.current) return;
    mounted.current = true;
    const Cal = loadCal();
    Cal('init', NS, { origin: embed.origin });
    const api = () => window.Cal!.ns![NS];
    api()('inline', { elementOrSelector: box.current, calLink: embed.calLink, config: embed.config });
    api()('ui', { theme: 'light', hideEventTypeDetails: false, layout: 'month_view' });
    api()('on', { action: 'bookingSuccessful', callback: () => booked.current() });
  }, [embed.origin, embed.calLink, embed.config]);
  return <div ref={box} className="w-full min-h-[640px] bg-white border border-line rounded-lg overflow-auto" />;
}

const CONTACT = 'thegreenreserve@outlook.com';
const TZ = 'America/New_York';
const fmtFull = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ });

const btnO = 'inline-flex items-center justify-center gap-2 border border-line hover:border-line-strong text-ink-soft hover:text-ink rounded-md px-5 py-3 text-sm transition-colors disabled:opacity-50';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <div className="relative bg-pine px-6 py-8 text-center">
        <Link href="/" className="absolute left-6 top-6 inline-flex items-center gap-1.5 text-white/60 hover:text-white transition-colors text-sm">
          <ArrowLeft size={14} /> Back
        </Link>
        <Link href="/" className="inline-block">
          <Image src="/brand/logo-lockup-cream-900.png" alt="GreenReserve" width={80} height={40} priority className="h-10 w-auto mx-auto" />
        </Link>
      </div>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">{children}</div>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'bad' | 'ok'; children: React.ReactNode }) {
  const cls = tone === 'bad' ? 'bg-bad/5 border-bad/20 text-bad' : tone === 'warn' ? 'bg-warn/5 border-warn/20 text-warn' : 'bg-ok/5 border-ok/20 text-ok';
  return <div className={`border rounded-md px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export default function CallPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'invalid' | 'expired' | 'closed' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadState('loading'); setLoadError('');
    try {
      const r = await fetch(`/api/call/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (r.status === 404) { setLoadState('invalid'); return; }
      if (r.status === 410) { setLoadState(d.error === 'closed' ? 'closed' : 'expired'); return; }
      if (!r.ok) { setLoadState('error'); setLoadError(d.error || `Could not load (${r.status}).`); return; }
      setInfo(d);
      setLoadState('ok');
    } catch { setLoadState('error'); setLoadError('Network error — check your connection and try again.'); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  // Quiet re-check: only swaps in the booked view, never flashes "Loading…"
  // or remounts the calendar while someone is mid-booking.
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/call/${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (d.booked) setInfo(d);
    } catch { /* the next check tries again */ }
  }, [token]);

  // The booking lands through Cal.com's webhook, not through this page, so
  // check quietly for it while the booker is showing. Capped well inside the
  // GET rate limit (60/hour per IP).
  const picking = !!info?.calcom && !info?.booked;
  useEffect(() => {
    if (!picking) return;
    let n = 0;
    const id = setInterval(() => { if (++n > 20) clearInterval(id); else refresh(); }, 30_000);
    return () => clearInterval(id);
  }, [picking, refresh]);

  if (loadState === 'loading') return <Shell><p className="text-sm text-ink-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p></Shell>;
  if (loadState === 'invalid') return <Shell><Notice tone="bad">This link is not valid. Reply to the email we sent you and we&apos;ll send a fresh one.</Notice></Shell>;
  if (loadState === 'expired') return <Shell><Notice tone="warn">This link has expired. Reply to the email we sent you, or write to {CONTACT}, and we&apos;ll send a fresh one.</Notice></Shell>;
  if (loadState === 'closed') return <Shell><Notice tone="warn">This inquiry is no longer open. If that&apos;s a surprise, write to {CONTACT}.</Notice></Shell>;
  if (loadState === 'error' || !info) return (
    <Shell>
      <Notice tone="bad">{loadError || 'Could not load.'}</Notice>
      <button onClick={load} className={btnO + ' mt-4'}>Try again</button>
    </Shell>
  );

  const heading = (
    <div className="mb-8">
      <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-2">{info.courseName}</p>
      <h1 className="text-2xl sm:text-3xl font-serif font-medium tracking-tight text-ink mb-2">Book a call with GreenReserve</h1>
      {!info.booked && (
        <p className="text-sm text-ink-soft">{info.durationMin} minutes · we&apos;ll call you{info.phone ? <> at {info.phone}</> : null}</p>
      )}
      <p className="text-sm text-ink-soft mt-2">We&apos;ll go through:</p>
      <ul className="mt-1 space-y-1 text-sm text-ink-soft list-disc pl-5">
        {info.agendaLines.map(l => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );

  // ── booked ──────────────────────────────────────────────────────────
  if (info.booked) {
    const b = info.booked;
    return (
      <Shell>
        {heading}
        <div className="bg-white border border-line rounded-lg p-6 mb-4">
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-ok shrink-0 mt-0.5" />
            <div>
              <p className="text-lg font-serif font-medium text-ink">You&apos;re booked for {fmtFull(b.scheduledAt)} ET</p>
              <p className="text-sm text-ink-soft mt-1 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{b.direction === 'they_call' ? 'You call us — the number is in your email.' : (b.phone || info.phone) ? `We’ll call you at ${b.phone || info.phone}.` : 'We’ll call you — reply with the best number if you have not sent one.'}</p>
            </div>
          </div>
        </div>
        {info.calcomManage ? (
          <div className="flex gap-3 flex-wrap">
            <a href={info.calcomManage.reschedule} target="_blank" rel="noopener noreferrer" className={btnO}><CalendarClock className="w-4 h-4" />Reschedule</a>
            <a href={info.calcomManage.cancel} target="_blank" rel="noopener noreferrer" className="text-sm text-ink-muted hover:text-bad px-3 py-3 transition-colors">Cancel the call</a>
          </div>
        ) : (
          // Set up by hand by GreenReserve — nothing to move on Cal.com.
          <p className="text-sm text-ink-soft">Need to move it? Reply to your confirmation email, or write to {CONTACT}.</p>
        )}
      </Shell>
    );
  }

  // ── pick a time ─────────────────────────────────────────────────────
  if (!info.calcom) {
    return (
      <Shell>
        {heading}
        <Notice tone="warn">
          Online booking isn&apos;t available right now — reply to the email we sent you with a couple of times that suit you and we&apos;ll confirm.
          Or write to {CONTACT}.
        </Notice>
        <button onClick={load} className={btnO + ' mt-4'}>Try again</button>
      </Shell>
    );
  }

  return (
    <Shell>
      {heading}
      {/* Cal.com fires bookingSuccessful before its webhook has reached us, so
          check a few times over the next minute rather than once. */}
      <CalInline embed={info.calcom} onBooked={() => { [3000, 10000, 25000, 50000].forEach(ms => setTimeout(refresh, ms)); }} />
      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-ink-muted">Booked? This page updates on its own within a minute.</p>
        <button onClick={refresh} className="text-sm text-pine hover:text-pine-hover">Check now</button>
      </div>
    </Shell>
  );
}
