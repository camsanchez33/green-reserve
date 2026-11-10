'use client';
// VIEWS-1 (Cam 2026-11-03, the glass/views canvas: "I like the three options for the tee
// sheet"): the List view — one line per group on the day, in tee-time order, for scanning
// who still owes and for phones. Same slots, same card: tapping a line opens its time's
// card, where every action lives. Nothing here writes.
// LIST-2 (Cam 2026-11-06, "the same information as the grid, just a different layout"): each line
// carries what the grid shows — the group filled in its money colour with the In / M / R tags —
// plus what it is playing (tee and round), how it was booked and the exact rate. Money is spelled
// out only where it matters: what an unpaid group owes, a declined card, a no-show.
import { formatTeeTime } from '@/lib/format';
import { roundName } from '@/lib/tee-rounds';
import { roundChargeCents } from '@/lib/booking-fees';
import { FILL, groupTags, groupTone, rateWords, type BoardSlot } from './TeeSheetRows';

const SOURCE: Record<string, string> = { online: 'Online', walk_in: 'Walk-in', phone: 'Phone', member: 'Member link' };

export default function TeeSheetList({ slots, isPast, selectedId, showMoney, onSelect }: {
  slots: BoardSlot[];
  isPast: (s: BoardSlot) => boolean;
  selectedId: string | null;
  /** Whoever can take the payment sees what a group owes (STRESS-1110); paid groups show no amount here. */
  showMoney: boolean;
  onSelect: (teeTimeId: string) => void;
}) {
  const lines = slots.flatMap(s => (s.bookings ?? []).map(g => ({ s, g })));
  const open = slots.filter(s => s.status !== 'blocked' && !isPast(s)).reduce((n, s) => n + Math.max(0, s.playersAvailable - s.playersBooked), 0);
  if (!lines.length) return <p className="py-10 text-center text-[13.5px] text-ink-muted">No groups booked this day</p>;
  const manyTees = new Set(slots.map(s => s.tee ?? '')).size > 1;
  // A phone folds players, round, how and rate under the name, so a line never scrolls sideways.
  const cols = 'grid-cols-[3.75rem_minmax(0,1fr)_4.75rem] sm:grid-cols-[4.5rem_minmax(0,12rem)_minmax(0,1fr)_6rem_minmax(0,9rem)_3.5rem_7rem]';
  return (
    <div>
      <div aria-hidden="true" className={'grid gap-2 sm:gap-3 px-2 sm:px-3 pb-2 text-[12px] text-ink-muted ' + cols}>
        <span>Time</span><span className="hidden sm:block">Playing</span><span>Booked by</span>
        <span className="hidden sm:block">How</span><span className="hidden sm:block">Rate</span>
        <span className="hidden sm:block text-right">Players</span><span className="text-right">Owes</span>
      </div>
      {lines.map(({ s, g }) => {
        const t = groupTone(g);
        const noShow = !!g.noShowAt && g.status === 'confirmed';
        const playing = [manyTees ? s.tee : '', roundName(s)].filter(Boolean).join(' · ');
        const how = s.event ? s.event.name : SOURCE[g.source ?? ''] ?? 'Online';
        const rate = rateWords(g);
        const tags = groupTags(g);
        // Only what needs doing: a problem in words, else what's still owed — what the card would charge (POS-1a:
        // shop items ride the round), the same figure as the card; paid and checked in say nothing.
        const owes = noShow ? 'No-show' : t === 'bad' ? 'Card declined' : t === 'ok' ? '' : showMoney && g.totalAmount != null ? `$${(roundChargeCents({ ...g, totalAmount: g.totalAmount, shopTaxCents: g.shopTaxCents }) / 100).toFixed(2)}` : 'Not paid';
        const state = g.status === 'completed' ? 'checked in' : t === 'ok' ? 'paid' : owes ? `owes, ${owes}` : 'owes';
        return (
          <button key={g.id} type="button" onClick={() => onSelect(s.id)}
            aria-label={`${[formatTeeTime(s.time), playing, g.golferName].filter(Boolean).join(', ')}, ${g.players} player${g.players === 1 ? '' : 's'}, ${how}${rate ? `, ${rate}` : ''}, ${state}. Open`}
            className={'w-full grid gap-2 sm:gap-3 items-center px-2 sm:px-3 py-2 text-left text-[13.5px] border-t border-line-soft hover:bg-paper/70 transition-colors '
              + cols + (selectedId === s.id ? ' bg-paper/70' : '') + (isPast(s) && g.status !== 'confirmed' ? ' opacity-60' : '')}>
            <span className="tabular-nums font-semibold text-ink">{formatTeeTime(s.time)}</span>
            <span className="hidden sm:block min-w-0 truncate text-ink-soft">{playing}</span>
            <span className="min-w-0">
              <span className={'inline-flex max-w-full items-center gap-1.5 rounded-[5px] px-2 py-1 ' + FILL[t]}>
                <span className={'truncate ' + (t === 'bad' ? 'text-bad font-medium' : 'text-ink')}>{g.golferName}</span>
                {tags.map(x => <span key={x} className="shrink-0 text-[11px] font-semibold text-ink">{x}</span>)}
              </span>
              <span className="sm:hidden block truncate pt-0.5 text-[12px] text-ink-soft">{[`${g.players} ${g.players === 1 ? 'player' : 'players'}`, playing, how, rate].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="hidden sm:block min-w-0 truncate text-ink-soft">{how}</span>
            <span className="hidden sm:block min-w-0 truncate text-ink-soft">{rate}</span>
            <span className="hidden sm:block text-right tabular-nums text-ink">{g.players}</span>
            <span className={'text-right tabular-nums ' + (t === 'bad' ? 'text-bad font-medium' : 'text-ink')}>{owes}</span>
          </button>
        );
      })}
      <div className="flex justify-end px-3 pt-2 text-[12.5px] text-ink-muted tabular-nums">{open} open spot{open === 1 ? '' : 's'} left</div>
    </div>
  );
}
