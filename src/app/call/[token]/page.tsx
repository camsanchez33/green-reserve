'use client';
// /call/[token] — the course books its discovery call. Public look, no session.
// CAL-2 (Cam 2026-09-29): Cal.com is the only scheduler. With nothing booked,
// the page sends the course straight to the prefilled Cal.com booking page (an
// in-page embed rendered blank live). The booking reaches GreenReserve through
// /api/calcom/webhook; opening this link again then shows "You're booked", with
// Cal.com's own reschedule / cancel pages.
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Phone, Check, CalendarClock, Loader2 } from 'lucide-react';

type Booked = { scheduledAt: string; durationMin: number; direction: string; phone: string };
type Info = {
  courseName: string; contactFirst: string; phone: string; durationMin: number; agendaLines: string[];
  booked: Booked | null;
  calcomUrl: string | null; calcomManage: { reschedule: string; cancel: string } | null;
};
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

  // Nothing booked and Cal.com is on: go straight to the Cal.com booking page.
  // replace(), not assign(), so Back returns to the email, not a bounce page.
  const goTo = info && !info.booked ? info.calcomUrl : null;
  useEffect(() => { if (goTo) window.location.replace(goTo); }, [goTo]);

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
  if (!info.calcomUrl) {
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
      <p className="text-sm text-ink-soft flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Taking you to the calendar…</p>
      <a href={info.calcomUrl} className={btnO + ' mt-4'}><CalendarClock className="w-4 h-4" />Open the calendar</a>
    </Shell>
  );
}
