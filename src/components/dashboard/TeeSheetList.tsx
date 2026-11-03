'use client';
// VIEWS-1 (Cam 2026-11-03, the glass/views canvas: "I like the three options for the tee
// sheet"): the List view — one line per group on the day, in tee-time order, for scanning
// who still owes and for phones. Same slots, same card: tapping a line opens its time's
// card, where every action lives. Nothing here writes.
import { formatTeeTime } from '@/lib/format';
import { StatusDot } from '@/components/ui/StatusDot';
import { groupTone, special, type BoardSlot } from './TeeSheetRows';

const SOURCE: Record<string, string> = { walk_in: 'Walk-in', phone: 'Phone' };
const DOT = { ok: 'ok', warn: 'warn', bad: 'bad' } as const;

export default function TeeSheetList({ slots, isPast, selectedId, showMoney, onSelect }: {
  slots: BoardSlot[];
  isPast: (s: BoardSlot) => boolean;
  selectedId: string | null;
  /** money.payments — without it the price column is left out. */
  showMoney: boolean;
  onSelect: (teeTimeId: string) => void;
}) {
  const lines = slots.flatMap(s => (s.bookings ?? []).map(g => ({ s, g })));
  const open = slots.filter(s => s.status !== 'blocked' && !isPast(s)).reduce((n, s) => n + Math.max(0, s.playersAvailable - s.playersBooked), 0);
  if (!lines.length) return <p className="py-10 text-center text-[13.5px] text-ink-muted">No groups booked this day</p>;
  // A phone drops the price column and narrows the rest, so a line never scrolls sideways.
  const cols = showMoney ? 'grid-cols-[4rem_minmax(0,1fr)_2.5rem_minmax(0,7.5rem)] sm:grid-cols-[4.5rem_minmax(0,1fr)_3.5rem_minmax(0,9rem)_5rem]' : 'grid-cols-[4rem_minmax(0,1fr)_2.5rem_minmax(0,7.5rem)] sm:grid-cols-[4.5rem_minmax(0,1fr)_3.5rem_minmax(0,9rem)]';
  return (
    <div>
      <div>
          <div aria-hidden="true" className={'grid gap-2 sm:gap-3 px-2 sm:px-3 pb-2 text-[12px] text-ink-muted ' + cols}>
            <span>Time</span><span>Booked by</span>
            <span className="text-right">Players</span><span>Money</span>
            {showMoney && <span className="hidden sm:block text-right">Round</span>}
          </div>
          {lines.map(({ s, g }) => {
            const t = groupTone(g);
            const noShow = !!g.noShowAt && g.status === 'confirmed';
            const state = g.status === 'completed' ? 'Checked in' : noShow ? 'No-show' : t === 'bad' ? 'Card declined' : g.paymentStatus === 'paid' ? 'Paid' : 'Not paid yet';
            return (
              <button key={g.id} type="button" onClick={() => onSelect(s.id)}
                aria-label={`${formatTeeTime(s.time)}, ${g.golferName}, ${g.players} player${g.players === 1 ? '' : 's'}, ${state}. Open`}
                className={'w-full grid gap-2 sm:gap-3 items-center px-2 sm:px-3 py-2.5 text-left text-[13.5px] border-t border-line-soft hover:bg-paper/70 transition-colors '
                  + cols + (selectedId === s.id ? ' bg-paper/70' : '') + (isPast(s) && g.status !== 'confirmed' ? ' opacity-60' : '')}>
                <span className="tabular-nums font-semibold text-ink">{formatTeeTime(s.time)}</span>
                <span className="min-w-0 truncate text-ink">
                  {g.golferName}
                  {special(g) && <span className="text-ink-muted"> · member or resident</span>}
                  {g.source && SOURCE[g.source] && <span className="text-ink-muted"> · {SOURCE[g.source]}</span>}
                </span>
                <span className="text-right tabular-nums text-ink">{g.players}</span>
                <span className="min-w-0"><StatusDot status={g.status === 'completed' ? 'ok' : DOT[t]} label={state} /></span>
                {/* A checked-in group's paid amount can differ (part played, cash without the booking fee) — the card shows it exactly. */}
                {showMoney && <span className="hidden sm:block text-right tabular-nums text-ink">{g.totalAmount == null || g.status === 'completed' ? '' : `$${(g.totalAmount / 100).toFixed(2)}`}</span>}
              </button>
            );
          })}
      </div>
      <div className="flex justify-end px-3 pt-2 text-[12.5px] text-ink-muted tabular-nums">{open} open spot{open === 1 ? '' : 's'} left</div>
    </div>
  );
}
