'use client';
// SCHEDULE-3 Closed days (Cam 2026-11-16): a month calendar. Green means golfers can book that day now, red means
// closed, and a closed day shows its reason. Tapping a day opens a pop-up to close it — with a warning if golfers are
// booked (they stay booked) — or to open it again. No side list.
// "Can book now": today through the course's public booking window (Settings), on a day of the week the schedule
// sells, and not closed. Data: /api/operator/blackouts (lib/blackouts: closing never cancels anyone).
import Link from 'next/link';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import { dfetch } from '@/lib/dashboard-fetch';
import { CardHead, Popup, PopupFoot, Block, FIELD, PRIMARY, DANGER } from './ui';

export type Blackout = { id: string; date: string; reason: string };
const HEAD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const long = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function ClosedDays({ blackouts, error, reload, canEdit, publicAdvanceDays, openDows }: {
  blackouts: Blackout[]; error: string; reload: () => Promise<void>; canEdit: boolean;
  /** Null while Settings hasn't loaded: then no day is called bookable. */
  publicAdvanceDays: number | null; openDows: number[];
}) {
  const today = new Date().toLocaleDateString('en-CA');
  const [month, setMonth] = useState(() => today.slice(0, 8) + '01');
  const [pick, setPick] = useState<{ date: string; closed: Blackout | null } | null>(null);
  const [reason, setReason] = useState('');
  const [booked, setBooked] = useState<{ groups: number; players: number } | 'error' | null>(null);
  const [busy, setBusy] = useState(false);

  const m = new Date(month + 'T12:00:00Z');
  const daysIn = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
  const lead = m.getUTCDay();
  const shift = (n: number) => setMonth(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + n, 1)).toISOString().slice(0, 10));
  const byDate = new Map(blackouts.map(b => [b.date, b]));
  const lastBookable = publicAdvanceDays == null ? null : addDays(today, publicAdvanceDays);

  async function checkBooked(date: string) {
    setBooked(null);
    const r = await dfetch<{ groups: number; players: number }>(`/api/operator/blackouts?date=${date}`);
    setBooked(r.ok ? r.data : 'error');
  }
  function open(date: string) {
    const closed = byDate.get(date) ?? null;
    setPick({ date, closed }); setReason('');
    if (!closed) checkBooked(date);
  }
  async function close() {
    if (!pick) return;
    setBusy(true);
    const r = await dfetch<{ booked: { groups: number } }>('/api/operator/blackouts', { method: 'POST', body: JSON.stringify({ date: pick.date, reason }) });
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    setPick(null); await reload();
    toast(r.data.booked.groups ? `Closed. ${r.data.booked.groups} booked group${r.data.booked.groups === 1 ? '' : 's'} kept.` : 'Closed.', 'ok');
  }
  async function reopen() {
    if (!pick?.closed) return;
    setBusy(true);
    const r = await dfetch('/api/operator/blackouts', { method: 'DELETE', body: JSON.stringify({ id: pick.closed.id }) });
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    setPick(null); await reload();
    toast('Open again.', 'ok');
  }

  return (
    <Card className="px-1.5 pt-1.5 pb-2.5">
      <CardHead title="Closed days" line={canEdit ? 'Tap a day to close it, or a closed day to open it again.' : undefined}>
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="w-8 h-8 rounded-md hover:bg-paper text-ink-soft text-[18px] leading-none">‹</button>
          <b className="text-[14px] font-semibold text-ink w-36 text-center">{m.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="w-8 h-8 rounded-md hover:bg-paper text-ink-soft text-[18px] leading-none">›</button>
        </span>
      </CardHead>
      {error && <div className="px-3 pb-2"><LoadError message={error} onRetry={reload} /></div>}
      <div className="flex gap-4 px-3 pb-2.5 text-[12.5px] text-ink-muted">
        <span className="inline-flex gap-1.5 items-center"><i className="w-2.5 h-2.5 rounded-[3px] bg-ok" />Golfers can book now</span>
        <span className="inline-flex gap-1.5 items-center"><i className="w-2.5 h-2.5 rounded-[3px] bg-bad" />Closed</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 px-3 pb-2">
        {HEAD.map(h => <b key={h} className="text-[12px] font-medium text-ink-muted text-center">{h}</b>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: daysIn }, (_, i) => {
          const date = month.slice(0, 8) + String(i + 1).padStart(2, '0');
          const closed = byDate.get(date);
          const past = date < today;
          const dow = (lead + i) % 7;
          const bookable = !closed && !past && lastBookable != null && date <= lastBookable && openDows.includes(dow);
          return (
            <button key={date} type="button" disabled={past || !canEdit} onClick={() => open(date)}
              aria-label={`${long(date)}${closed ? `, closed${closed.reason ? `: ${closed.reason}` : ''}` : bookable ? ', golfers can book' : ''}`}
              className={'min-h-[52px] md:min-h-[68px] p-2 text-left flex flex-col gap-1 rounded-[10px] border disabled:cursor-default '
                + (closed ? 'bg-bad/15 border-bad/55 ' : bookable ? 'bg-ok/15 border-ok/45 ' : 'bg-paper border-transparent ')
                + (past ? 'opacity-35 ' : canEdit ? 'hover:border-ink-soft ' : '')}>
              <b className="text-[13px] font-semibold text-ink tabular-nums">{i + 1}</b>
              {closed ? <small className="hidden md:block text-[11.5px] leading-tight text-bad font-semibold line-clamp-2">{closed.reason || 'Closed'}</small>
                : bookable ? <small className="hidden md:block text-[11.5px] leading-tight text-ok">Bookable</small> : null}
            </button>
          );
        })}
      </div>

      {pick && pick.closed && (
        <Popup title={`Open ${long(pick.date)} again?`} onClose={() => !busy && setPick(null)}>
          <p className="text-[13px] text-ink-soft -mt-2">{pick.closed.reason ? `Closed for ${pick.closed.reason}. ` : ''}Golfers can book it again once it’s open.</p>
          <PopupFoot onCancel={() => setPick(null)}>
            <button type="button" onClick={reopen} disabled={busy} className={PRIMARY}>{busy ? 'Opening…' : 'Open it'}</button>
          </PopupFoot>
        </Popup>
      )}
      {pick && !pick.closed && (
        <Popup title={`Close ${long(pick.date)}?`} onClose={() => !busy && setPick(null)}>
          <Block label="What’s happening"><input aria-label="What’s happening" value={reason} onChange={e => setReason(e.target.value)} className={FIELD} /></Block>
          {booked && booked !== 'error' && booked.groups > 0 && (
            <div className="rounded-[12px] border border-warn/45 bg-warn/10 px-3 py-2.5 text-[13px] text-ink">
              <b className="font-semibold">{booked.groups} group{booked.groups === 1 ? '' : 's'} · {booked.players} player{booked.players === 1 ? '' : 's'}</b> {booked.groups === 1 ? 'is' : 'are'} booked that day. They stay booked. <Link href={`/dashboard?date=${pick.date}`} className="underline font-semibold">Cancel and tell them</Link> from the tee sheet.
            </div>
          )}
          {booked === null && <p className="text-[12.5px] text-ink-muted">Checking who’s booked…</p>}
          {booked === 'error' && <p className="text-[13px] text-bad">Couldn’t check who’s booked. <button type="button" onClick={() => checkBooked(pick.date)} className="underline font-semibold">Retry</button></p>}
          <PopupFoot onCancel={() => setPick(null)}>
            <button type="button" onClick={close} disabled={busy} className={DANGER}>{busy ? 'Closing…' : 'Close this day'}</button>
          </PopupFoot>
        </Popup>
      )}
    </Card>
  );
}
