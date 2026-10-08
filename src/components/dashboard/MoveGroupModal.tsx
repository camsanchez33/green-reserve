'use client';
// ACT-1 (PLATFORM_ROADMAP_SPEC §2): move a group to another tee time from the
// tee sheet. Pick a day and a time with room → the route's dry run says what
// the move will do (the price, kept or at the new time's rate, and whether the
// new time's free-cancellation window has already closed) → Confirm. The move
// itself is lib/move-booking.ts behind PATCH /api/operator/bookings
// { action: 'move' } (permission sheet.move). Nothing moves until Confirm.
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { formatTeeTime, formatTeeDay } from '@/lib/format';
import { INPUT } from '@/components/ui/field';

type Slot = { id: string; time: string; status: string; playersAvailable: number; playersBooked: number };
type Totals = { greenFeeTotal: number; cartFeeTotal: number; totalAmount: number };
type Preview = {
  to: { teeTimeId: string; date: string; time: string };
  players: number; checkedIn?: boolean; cutoffPassed: boolean; holdDue: boolean; holdDueCents?: number; priceChanged: boolean;
  totals?: Totals & { rangeBallsTotal: number; accessFeeTotal: number };
  newSlotTotals?: Totals;
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function MoveGroupModal({ booking, fromTeeTimeId, initialPickId, date, today, nowHM, onClose, onMoved }: {
  /** emailable: false = no email on file (a counter booking), so nobody is emailed. */
  /** checkedIn: already checked in (paid) — the price stays, no rate choice. */
  booking: { id: string; golferName: string; players: number; emailable: boolean; checkedIn?: boolean };
  fromTeeTimeId: string;
  /** SHEET-2: the time the group was dropped on — priced straight away. */
  initialPickId?: string;
  /** The day the sheet is showing — the default day to move within. */
  date: string;
  /** Course-local today and time, so today's past times aren't offered. */
  today: string; nowHM: string;
  onClose: () => void;
  onMoved: (toDate: string) => void;
}) {
  const [day, setDay] = useState(date);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [pick, setPick] = useState<Slot | null>(null);
  const [reprice, setReprice] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewErr, setPreviewErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (d: string) => {
    setSlots(null); setLoadErr(''); setPick(null); setPreview(null); setPreviewErr('');
    const r = await dfetch<Slot[]>(`/api/operator/tee-times?date=${d}`);
    if (r.ok) setSlots(r.data ?? []); else setLoadErr(r.error);
  }, []);
  useEffect(() => { load(day); }, [day, load]);
  // The preview sits under the time grid — bring it into view once it arrives.
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (preview) previewRef.current?.scrollIntoView({ block: 'nearest' }); }, [preview]);
  // The board's drop: run the same dry run as tapping that time here would.
  const [usedInitial, setUsedInitial] = useState(false);
  useEffect(() => {
    if (usedInitial || !initialPickId || !slots || day !== date) return;
    setUsedInitial(true);
    const s = slots.find(x => x.id === initialPickId);
    if (s) choose(s, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const choose = async (s: Slot, withNewRate: boolean) => {
    setPick(s); setPreview(null); setPreviewErr('');
    const r = await dfetch<Preview>('/api/operator/bookings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: booking.id, action: 'move', newTeeTimeId: s.id, reprice: withNewRate, dryRun: true }),
    });
    if (r.ok && r.data) setPreview(r.data); else setPreviewErr(r.error);
  };

  const confirm = async () => {
    if (!pick) return;
    setBusy(true);
    const r = await dfetch<Preview & { emailed: boolean | null }>('/api/operator/bookings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: booking.id, action: 'move', newTeeTimeId: pick.id, reprice }),
    });
    setBusy(false);
    if (!r.ok || !r.data) { setPreviewErr(r.error); return; }
    const when = `${r.data.to.date === date ? '' : formatTeeDay(r.data.to.date) + ' '}${formatTeeTime(r.data.to.time)}`;
    toast(`${booking.golferName} moved to ${when}.${r.data.emailed === false ? ' We couldn’t email them — let them know.' : ''}`, r.data.emailed === false ? 'warn' : 'ok');
    onMoved(r.data.to.date);
  };

  const open = (slots ?? []).filter(s =>
    s.id !== fromTeeTimeId && s.status !== 'blocked' &&
    s.playersAvailable - s.playersBooked >= booking.players &&
    !(day < today || (day === today && s.time <= nowHM)));
  // The dry run prices it both ways: `totals` as chosen, `newSlotTotals` at the new time's rate.
  const rateDiffers = !!preview?.newSlotTotals && !!preview.totals && preview.newSlotTotals.totalAmount !== preview.totals.totalAmount;
  const keptTotal = preview?.totals && !reprice ? preview.totals.totalAmount : null;

  return (
    <div className="fixed inset-0 bg-ink/20 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => e.stopPropagation()}>
      <div className="bg-white w-full sm:max-w-md rounded-t-lg sm:rounded-lg shadow-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-serif font-semibold text-ink text-[17px]">Move {booking.golferName}</h3>
          <button onClick={onClose} disabled={busy} className="text-ink-muted hover:text-ink disabled:opacity-40" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-[13px] text-ink-soft mb-4">{booking.players} player{booking.players === 1 ? '' : 's'}{booking.checkedIn ? ', already checked in' : ''}. Pick a time with room for the whole group.</p>

        <label className="block text-[13px] font-medium text-ink mb-1" htmlFor="move-day">Day</label>
        <input id="move-day" type="date" value={day} min={today} onChange={e => e.target.value && setDay(e.target.value)} className={INPUT + ' w-full mb-4'} />

        {loadErr && <div className="text-[13px] text-bad mb-3">{loadErr} <button onClick={() => load(day)} className="underline font-medium">Retry</button></div>}
        {!slots && !loadErr && <div className="py-6 text-center text-ink-muted"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
        {slots && open.length === 0 && <p className="text-[13px] text-ink-soft mb-3">No time on {formatTeeDay(day)} has room for {booking.players}. Try another day.</p>}
        {slots && open.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 mb-4" role="listbox" aria-label="Open times">
            {open.map(s => (
              <button key={s.id} role="option" aria-selected={pick?.id === s.id} onClick={() => { setReprice(false); choose(s, false); }}
                className={'py-2 rounded-md border text-[13px] font-semibold tabular-nums transition-colors ' + (pick?.id === s.id ? 'bg-pine border-pine text-white' : 'bg-white border-line text-ink hover:border-line-strong')}>
                {formatTeeTime(s.time)}
                <span className={'block text-[11px] font-normal ' + (pick?.id === s.id ? 'text-white/85' : 'text-ink-muted')}>{s.playersAvailable - s.playersBooked} open</span>
              </button>
            ))}
          </div>
        )}

        {pick && !preview && !previewErr && <div className="py-3 text-center text-ink-muted"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>}
        {previewErr && <p className="text-[13px] text-bad mb-3">{previewErr}</p>}
        {preview && (
          <div ref={previewRef} className="bg-paper/70 rounded-md px-3 py-3 mb-4 text-[13px] text-ink space-y-1.5">
            <p><b className="font-semibold">{formatTeeDay(preview.to.date)} · {formatTeeTime(preview.to.time)}</b> — {booking.emailable ? 'they’ll get an email with the new time.' : 'there’s no email on file, so let them know.'}</p>
            {preview.checkedIn && <p>They&apos;ve already checked in and paid, so nothing is charged or refunded{keptTotal != null ? ` — the price stays ${usd(keptTotal)}` : ''}.</p>}
            {!preview.checkedIn && keptTotal != null && <p>Price stays {usd(keptTotal)}.</p>}
            {reprice && preview.totals && <p>New price {usd(preview.totals.totalAmount)} at this time&apos;s rate.</p>}
            {!preview.checkedIn && preview.newSlotTotals && preview.totals && (rateDiffers || reprice) && (
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input type="checkbox" checked={reprice} className="accent-pine" onChange={e => { setReprice(e.target.checked); choose(pick!, e.target.checked); }} />
                Charge this time&apos;s rate instead
              </label>
            )}
            {preview.holdDue && <p className="text-warn">The free-cancellation window for this time has already closed, so {preview.holdDueCents ? `the ${usd(preview.holdDueCents)} hold` : 'their cancellation hold'} is charged to their card within the hour, as it would be for any booking past its window. It&apos;s refunded at check-in.</p>}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} disabled={busy} className="flex-1 py-2.5 rounded-md border border-line text-[13.5px] font-medium text-ink hover:bg-paper disabled:opacity-50">Cancel</button>
          <button onClick={confirm} disabled={!preview || busy} className="flex-1 py-2.5 rounded-md bg-pine hover:bg-pine-hover text-white text-[13.5px] font-semibold disabled:opacity-50">
            {busy ? 'Moving…' : 'Move group'}
          </button>
        </div>
      </div>
    </div>
  );
}
