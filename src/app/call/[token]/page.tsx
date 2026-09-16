'use client';
// CALL_SCHEDULING_SPEC SC-2 §2 — /call/[token]: pick a 30-minute call, then
// manage it (reschedule / cancel) from the same link. Public look, no session.
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Phone, Check, CalendarClock, AlertTriangle, Loader2 } from 'lucide-react';

type Day = { date: string; label: string; preferred: string[]; other: string[] };
type Booked = { scheduledAt: string; durationMin: number; direction: string; phone: string };
type Info = {
  courseName: string; contactFirst: string; phone: string; durationMin: number; agendaLines: string[];
  booked: Booked | null; calendarUnavailable: boolean; days: Day[];
};

const TZ = 'America/New_York';
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
const fmtFull = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ });

const inp = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const btnP = 'inline-flex items-center justify-center gap-2 bg-pine hover:bg-pine-hover disabled:opacity-50 text-white font-medium rounded-md px-5 py-3 text-sm transition-colors';
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
  const [picked, setPicked] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [theyCall, setTheyCall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [mode, setMode] = useState<'pick' | 'manage' | 'reschedule' | 'cancelled'>('pick');

  const load = useCallback(async () => {
    setLoadState('loading'); setLoadError('');
    try {
      const r = await fetch(`/api/call/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (r.status === 404) { setLoadState('invalid'); return; }
      if (r.status === 410) { setLoadState(d.error === 'closed' ? 'closed' : 'expired'); return; }
      if (!r.ok) { setLoadState('error'); setLoadError(d.error || `Could not load (${r.status}).`); return; }
      setInfo(d);
      setPhone(d.phone || '');
      setMode(d.booked ? 'manage' : 'pick');
      setLoadState('ok');
    } catch { setLoadState('error'); setLoadError('Network error — check your connection and try again.'); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true); setError(''); setNotice(null);
    try {
      const r = await fetch(`/api/call/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      return { r, d };
    } catch {
      setError('Network error — nothing was changed. Check your connection and try again.');
      return null;
    } finally { setBusy(false); }
  };

  const confirm = async (action: 'book' | 'reschedule') => {
    if (!picked) return;
    const res = await post({ action, startsAt: picked, phone, direction: theyCall ? 'they_call' : 'we_call' });
    if (!res) return;
    const { r, d } = res;
    if (r.status === 409 && d.error === 'slot_taken') {
      setPicked(null);
      setError('Sorry — that one just went. Here is what is still open.');
      await load();
      return;
    }
    if (r.status === 503) { setError('I can’t reach my calendar right now, so I could not confirm that time. Reply to the email with a couple of times that suit you and I’ll confirm by hand.'); return; }
    if (!r.ok) { setError(d.error && d.error !== 'invalid' ? String(d.error) : `Something went wrong (${r.status}). Nothing was booked — try again.`); return; }
    setInfo(i => i ? { ...i, booked: d.booked, phone: d.booked?.phone || i.phone } : i);
    setMode('manage');
    setPicked(null);
    setNotice({
      tone: d.courseEmailSent ? 'ok' : 'warn',
      text: d.courseEmailSent
        ? `${action === 'book' ? 'Booked' : 'Moved'}. A confirmation with a calendar file is on its way to your inbox.`
        : `${action === 'book' ? 'Booked' : 'Moved'}. The confirmation email did not send — the time is held either way, and this page is your record.`,
    });
  };

  const cancel = async () => {
    const res = await post({ action: 'cancel' });
    if (!res) return;
    const { r, d } = res;
    if (!r.ok) { setError(d.error && d.error !== 'invalid' ? String(d.error) : `Something went wrong (${r.status}). The call is still on.`); return; }
    setInfo(i => i ? { ...i, booked: null } : i);
    setMode('cancelled');
  };

  if (loadState === 'loading') return <Shell><p className="text-sm text-ink-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading your times…</p></Shell>;
  if (loadState === 'invalid') return <Shell><Notice tone="bad">This link is not valid. Reply to the email we sent you and we&apos;ll send a fresh one.</Notice></Shell>;
  if (loadState === 'expired') return <Shell><Notice tone="warn">This link has expired. Reply to the email we sent you, or write to hello@greenreserve.app, and we&apos;ll send a fresh one.</Notice></Shell>;
  if (loadState === 'closed') return <Shell><Notice tone="warn">This inquiry is no longer open. If that&apos;s a surprise, write to hello@greenreserve.app.</Notice></Shell>;
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
      <p className="text-sm text-ink-soft">{info.durationMin} minutes · we&apos;ll go through:</p>
      <ul className="mt-2 space-y-1 text-sm text-ink-soft list-disc pl-5">
        {info.agendaLines.map(l => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );

  // ── manage ──────────────────────────────────────────────────────────
  if (mode === 'manage' && info.booked) {
    const b = info.booked;
    return (
      <Shell>
        {heading}
        <div className="bg-white border border-line rounded-lg p-6 mb-4">
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-ok shrink-0 mt-0.5" />
            <div>
              <p className="text-lg font-serif font-medium text-ink">You&apos;re booked for {fmtFull(b.scheduledAt)} ET</p>
              <p className="text-sm text-ink-soft mt-1 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{b.direction === 'they_call' ? 'You call us — the number is in your email.' : `We’ll call you at ${b.phone}.`}</p>
            </div>
          </div>
        </div>
        {notice && <div className="mb-4"><Notice tone={notice.tone}>{notice.text}</Notice></div>}
        {error && <div className="mb-4"><Notice tone="bad">{error}</Notice></div>}
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => { setMode('reschedule'); setPicked(null); setError(''); setNotice(null); load(); }} disabled={busy} className={btnO}><CalendarClock className="w-4 h-4" />Reschedule</button>
          <button onClick={cancel} disabled={busy} className="text-sm text-ink-muted hover:text-bad px-3 py-3 transition-colors disabled:opacity-50">{busy ? 'Working…' : 'Cancel the call'}</button>
        </div>
      </Shell>
    );
  }

  if (mode === 'cancelled') {
    return (
      <Shell>
        {heading}
        <Notice tone="warn">Cancelled. Nothing is booked now. Whenever you&apos;re ready, pick a new time below.</Notice>
        <button onClick={() => { setMode('pick'); load(); }} className={btnP + ' mt-4'}>Pick a new time</button>
      </Shell>
    );
  }

  // ── pick / reschedule ───────────────────────────────────────────────
  if (info.calendarUnavailable) {
    return (
      <Shell>
        {heading}
        <Notice tone="warn">
          I can&apos;t show my calendar right now — reply to the email we sent you with a couple of times that suit you and I&apos;ll confirm.
          Or write to hello@greenreserve.app.
        </Notice>
        <button onClick={load} className={btnO + ' mt-4'}>Try again</button>
      </Shell>
    );
  }

  if (info.days.length === 0) {
    return (
      <Shell>
        {heading}
        <Notice tone="warn">Nothing is open in the next two weeks. Reply to the email with a couple of times that suit you and I&apos;ll make one work.</Notice>
      </Shell>
    );
  }

  const hasOther = info.days.some(d => d.other.length > 0);
  const hasPreferred = info.days.some(d => d.preferred.length > 0);
  const chip = (iso: string) => {
    const on = picked === iso;
    return (
      <button key={iso} type="button" aria-pressed={on} disabled={busy}
        onClick={() => { setPicked(on ? null : iso); setError(''); }}
        className={'px-3 py-2 rounded-md border text-sm transition-colors ' + (on ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line bg-white text-ink hover:border-pine/40')}>
        {fmtTime(iso)}
      </button>
    );
  };

  return (
    <Shell>
      {heading}
      {mode === 'reschedule' && info.booked && (
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-ink-soft">Currently {fmtFull(info.booked.scheduledAt)} ET. Pick a new time:</p>
          <button onClick={() => setMode('manage')} className="text-sm text-ink-muted hover:text-ink">Keep it</button>
        </div>
      )}
      {error && <div className="mb-4"><Notice tone="bad">{error}</Notice></div>}
      <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-3">All times Eastern</p>
      <div className="space-y-5">
        {info.days.filter(d => d.preferred.length).map(d => (
          <div key={d.date}>
            <p className="text-sm font-medium text-ink mb-2">{d.label}</p>
            <div className="flex flex-wrap gap-2">{d.preferred.map(chip)}</div>
          </div>
        ))}
        {hasPreferred && hasOther && <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium pt-2">Other times</p>}
        {info.days.filter(d => d.other.length).map(d => (
          <div key={d.date + '-o'}>
            <p className="text-sm font-medium text-ink mb-2">{d.label}</p>
            <div className="flex flex-wrap gap-2">{d.other.map(chip)}</div>
          </div>
        ))}
      </div>

      {picked && (
        <div className="mt-8 bg-white border border-line rounded-lg p-6">
          <p className="text-lg font-serif font-medium text-ink mb-4">{fmtFull(picked)} ET</p>
          {!theyCall && (
            <div className="mb-3">
              <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">We&apos;ll call you at</label>
              <input type="tel" className={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(201) 555-0100" autoComplete="tel" />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-soft cursor-pointer mb-5">
            <input type="checkbox" checked={theyCall} onChange={e => setTheyCall(e.target.checked)} />
            I&apos;d rather call you
          </label>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => confirm(mode === 'reschedule' ? 'reschedule' : 'book')} disabled={busy || (!theyCall && !phone.trim())} className={btnP}>
              <Check className="w-4 h-4" />{busy ? 'Confirming…' : 'Confirm'}
            </button>
            <button onClick={() => setPicked(null)} disabled={busy} className={btnO}>Pick another</button>
          </div>
        </div>
      )}
      <p className="text-xs text-ink-muted mt-8">If none of these work, reply to the email and we&apos;ll find a time.</p>
    </Shell>
  );
}
