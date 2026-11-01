'use client';
// The golfer record (Revamp 3, Cam 2026-10-29): one course's view of one golfer —
// their rounds, no-shows and late cancels, spend, membership, resident card,
// staff notes, and whether they can book online. Data: /api/operator/golfers/[key].
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import OperatorSidebar from '@/components/OperatorSidebar';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { formatTeeDate, formatTeeTime } from '@/lib/format';

type Note = { id: string; body: string; bookingId: string | null; createdBy: string; createdAt: string };
type Rec = {
  key: string; name: string; email?: string; phone?: string; since: string | null;
  counts: { rounds: number; playersRounds: number; upcoming: number; noShows: number; lateCancels: number; cancels: number; lastPlayed: string | null };
  spend?: { roundsCents: number; shopCents: number; shopSales: number };
  membership: { tier: string; status: string; expiresAt: string | null; live: boolean; duesPaid: boolean } | null;
  resident: { cardNumber: string; expiresOn: string } | null;
  notes: Note[];
  onlineBlock: { by: 'owner' | 'rule'; reason: string; blockedBy: string; blockedAt: string | null } | null;
  bookings: { id: string; date: string; time: string; players: number; state: string; courseShareCents?: number }[];
  canBlock: boolean;
};

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const STATE: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  played: { label: 'Played', tone: 'ok' }, upcoming: { label: 'Booked', tone: 'neutral' }, no_show: { label: 'No-show', tone: 'bad' },
  late_cancel: { label: 'Late cancel', tone: 'warn' }, cancelled: { label: 'Cancelled', tone: 'neutral' }, called_off: { label: 'Called off by you', tone: 'neutral' },
  not_checked_in: { label: 'Not checked in', tone: 'warn' },
};

export default function GolferRecordPage() {
  const { key } = useParams<{ key: string }>();
  // A literal % (not an escape) would make decodeURIComponent throw.
  const decodedKey = (() => { try { return decodeURIComponent(key); } catch { return key; } })();
  const [rec, setRec] = useState<Rec | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const url = `/api/operator/golfers/${encodeURIComponent(decodedKey)}`;

  const load = useCallback(async () => {
    const r = await dfetch<Rec>(url);
    if (!r.ok) { setError(r.error); return; }
    setRec(r.data); setError('');
  }, [url]);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, tag: string) {
    setBusy(tag); setActionError('');
    const r = await dfetch(url, { method: 'POST', body: JSON.stringify(body) });
    setBusy('');
    if (!r.ok) { setActionError(r.error); return false; }
    await load();
    return true;
  }

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="teesheet" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="px-4 sm:px-10 py-7 flex flex-col gap-6 max-w-4xl">
          {error && <LoadError message={error} onRetry={load} />}
          {!rec && !error && <p className="text-sm text-ink-muted">Loading…</p>}
          {rec && <>
            <div>
              <h1 className="font-serif text-[32px] leading-none text-ink">{rec.name || 'Golfer'}</h1>
              <p className="mt-2.5 text-[14px] text-ink-soft">
                {[rec.email, rec.phone].filter(Boolean).join(' · ')}{rec.since ? `${rec.email || rec.phone ? ' · ' : ''}since ${formatTeeDate(rec.since)}` : ''}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[13.5px]">
                {rec.membership && <StatusDot status={rec.membership.live ? 'ok' : 'warn'} label={`${rec.membership.tier || 'Member'}${rec.membership.live ? '' : ' · ended'}${rec.membership.live && !rec.membership.duesPaid ? ' · dues unpaid' : ''}`} />}
                {rec.resident && <StatusDot status="ok" label={`Resident${rec.resident.cardNumber ? ` · ${rec.resident.cardNumber}` : ''}`} />}
                {rec.onlineBlock && <StatusDot status="bad" label="Can’t book online" />}
              </div>
            </div>

            {/* Audit 2026-10-31 (FLOW-2): a soft card with hairline-divided cells, not a ruled box. */}
            <Card className="flex flex-wrap overflow-hidden w-fit max-w-full divide-x divide-line-soft">
              {([['Rounds', rec.counts.rounds], ['Booked', rec.counts.upcoming], ['No-shows', rec.counts.noShows], ['Late cancels', rec.counts.lateCancels], ...(rec.spend ? [['Spent', usd(rec.spend.roundsCents + rec.spend.shopCents)]] : [])] as [string, number | string][]).map(([l, v]) => (
                <div key={l} className="px-4 py-2.5 min-w-[7.5rem]"><div className="text-[12.5px] text-ink-soft">{l}</div><div className="text-[20px] font-semibold tabular-nums text-ink">{v}</div></div>
              ))}
            </Card>

            {(rec.onlineBlock || rec.canBlock) && (
              <Card className={'px-5 py-4 ' + (rec.onlineBlock ? 'border-l-[3px] border-l-bad' : '')}>
                <h2 className="text-[15px] font-semibold text-ink">Online booking</h2>
                {rec.onlineBlock
                  ? <p className="text-[13.5px] text-ink mt-1">Can’t book online — {rec.onlineBlock.reason}{rec.onlineBlock.by === 'owner' ? ` (${rec.onlineBlock.blockedBy})` : ' (your rule in Settings)'}. Your counter can still book them.</p>
                  : <p className="text-[13.5px] text-ink-soft mt-1">Can book online.</p>}
                {rec.canBlock && (rec.onlineBlock?.by === 'owner'
                  ? <button onClick={() => act({ action: 'unblock' }, 'unblock')} disabled={!!busy} className="mt-2 text-[13px] font-medium text-pine hover:underline disabled:opacity-50">Let them book online again</button>
                  : blockReason === null
                    ? <button onClick={() => setBlockReason('')} className="mt-2 text-[13px] font-medium text-bad hover:underline">Stop online booking</button>
                    : <div className="mt-2 flex flex-wrap gap-2">
                        <input value={blockReason} onChange={e => setBlockReason(e.target.value)} maxLength={300} placeholder="Reason" aria-label="Reason" className={INPUT + ' flex-1 min-w-[12rem]'} />
                        <button onClick={async () => { if (await act({ action: 'block', reason: blockReason }, 'block')) setBlockReason(null); }} disabled={!!busy || !blockReason.trim()} className="px-3 py-1.5 rounded-md bg-bad text-white text-[13px] font-medium disabled:opacity-50">Stop</button>
                        <button onClick={() => setBlockReason(null)} className="text-[13px] text-ink-soft hover:text-ink">Cancel</button>
                      </div>)}
              </Card>
            )}

            <Card className="px-5 py-4">
              <h2 className="text-[15px] font-semibold text-ink mb-2">Notes</h2>
              <div className="flex gap-2">
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="Add a note for your staff" aria-label="Add a note" className={INPUT + ' flex-1'} />
                <button onClick={async () => { if (await act({ action: 'note', body: note }, 'note')) setNote(''); }} disabled={!!busy || !note.trim()} className="px-3 py-1.5 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50">{busy === 'note' ? 'Saving…' : 'Add'}</button>
              </div>
              {rec.notes.length > 0 && (
                <ul className="mt-3 divide-y divide-line-soft">
                  {rec.notes.map(n => (
                    <li key={n.id} className="py-2 text-[13.5px] flex items-start justify-between gap-3">
                      <span className="text-ink">{n.body}<span className="block text-[12px] text-ink-muted">{n.createdBy} · {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{n.bookingId ? ' · on a booking' : ''}</span></span>
                      <button onClick={() => act({ action: 'delete_note', noteId: n.id }, 'del' + n.id)} disabled={!!busy} className="text-[12.5px] text-ink-soft hover:text-bad shrink-0">Delete</button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {actionError && <p role="alert" className="text-[13px] text-bad">{actionError}</p>}

            <Card>
              <h2 className="text-[15px] font-semibold text-ink px-5 pt-4 pb-2">Bookings</h2>
              {rec.bookings.length === 0 ? <p className="px-5 pb-4 text-sm text-ink-soft">No bookings here yet.</p> : (
                <ul className="divide-y divide-line-soft">
                  {rec.bookings.map(b => (
                    <li key={b.id} className="px-5 py-2.5 grid grid-cols-[1fr_auto] sm:grid-cols-[10rem_1fr_6rem_auto] gap-x-4 items-baseline text-[13.5px]">
                      <Link href={`/dashboard?date=${b.date}&q=${encodeURIComponent(rec.name)}`} className="text-ink hover:underline tabular-nums">{formatTeeDate(b.date)} {formatTeeTime(b.time)}</Link>
                      <span className="text-ink-soft hidden sm:block">{b.players} player{b.players === 1 ? '' : 's'}</span>
                      <span className="tabular-nums text-ink hidden sm:block">{b.courseShareCents != null ? usd(b.courseShareCents) : ''}</span>
                      <StatusDot status={STATE[b.state]?.tone ?? 'neutral'} label={STATE[b.state]?.label ?? b.state} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>}
        </div>
      </main>
    </div>
  );
}
