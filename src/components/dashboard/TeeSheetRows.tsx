'use client';
// DENSE-4 (DENSE_UI_SPEC D1, Cam 2026-10-27: "seat rows everywhere", after the
// Lightspeed / foreUP tee sheets — reverses SHEET-2's board): one row per tee time,
// time · price · a cell per seat. A group fills the seats it holds; its 3px left
// edge is where its money stands (ok paid, warn booked not paid, bad declined card
// or no-show); a light green fill means checked in, beige a member or resident
// rate. Past rows fade and a line marks now. Tapping anything in a row opens the
// time's card (the page's panel carries every action); dragging a group onto
// another row opens the SAME ACT-1 move dialog — nothing moves until its confirm.
// Same props as the board it replaced, so the page and panel are unchanged.
import { rowTag, runsOf, usualRound, usualRoundOnly } from '@/lib/tee-rounds';
import { useState } from 'react';
import { formatTeeTime } from '@/lib/format';

export type BoardGroup = {
  id: string; golferName: string; golferEmail: string; players: number; status: string;
  paymentStatus: string; noShowAt?: string | null; checkInFailReason?: string;
  /** RES-1 / tiers: a member or resident rate shades the group. */
  residentPlayers?: number; appliedRate?: string;
  /** VIEWS-1: the List view shows how it was booked and the round's price (cents). */
  source?: string; totalAmount?: number;
};
export type BoardSlot = {
  id: string; time: string; status: string; playersAvailable: number; playersBooked: number;
  bookings?: BoardGroup[]; event?: { id: string; name: string } | null;
  /** Price a player, dollars (shown in the row). */
  greenFee?: number;
  /** TEES-1: the tee the round starts from ("1st tee", "10th tee", or a nine's name). Two or more on a
   *  day put them side by side, times lined up across. */
  tee?: string | null;
  /** The tee's place in the course's nine order (the route), so columns follow the course. */
  teeRank?: number;
  /** ROUNDS-1: what the time sells — holes, its price period (schedule name, e.g. Twilight) and round. */
  holes?: number; tierName?: string | null; product?: { label: string } | null;
};
type Tone = 'ok' | 'warn' | 'bad';

const HATCH: React.CSSProperties = { backgroundImage: 'repeating-linear-gradient(135deg, var(--color-line) 0 1px, transparent 1px 7px)' };

/** Paid = checked in (online, card or at the counter) or collected ahead. */
export function groupTone(g: BoardGroup): Tone {
  if (g.status === 'completed' || g.paymentStatus === 'paid') return 'ok';
  if ((g.noShowAt && g.status === 'confirmed') || g.checkInFailReason) return 'bad';
  return 'warn';
}
export const TONE_LABEL: Record<Tone, string> = { ok: 'paid', warn: 'booked, not paid yet', bad: 'needs attention' };
/** FILL-1 (Cam 2026-11-06, "fully filled"): a group's whole cell is its money colour — the soft tints keep names readable. */
const FILL: Record<Tone, string> = { ok: 'bg-paid-fill', warn: 'bg-owes-fill', bad: 'bg-bad-fill' };
/** Who they are, as a tag: checked in, member rate, resident rate. */
export const groupTags = (g: BoardGroup) => [
  ...(g.status === 'completed' ? ['In'] : []),
  ...(g.appliedRate && g.appliedRate !== 'standard' ? ['M'] : []),
  ...((g.residentPlayers ?? 0) > 0 ? ['R'] : []),
];

export const special = (g: BoardGroup) => (g.residentPlayers ?? 0) > 0 || (!!g.appliedRate && g.appliedRate !== 'standard');

/** The same groups the panel's Move offers: confirmed and not a no-show, or checked in. */
const movable = (g: BoardGroup) => (g.status === 'confirmed' && !g.noShowAt) || g.status === 'completed';

const PAST = 'Past tee times';
const hourLabel = (h: number) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;
const price = (v?: number) => v == null ? '' : `$${Number.isInteger(v) ? v : v.toFixed(2)}`;

export default function TeeSheetRows({ slots: allSlots, isPast, isGone, nextUpId, selectedId, canMove, canMoveCheckedIn, onMove, onSelect }: {
  slots: BoardSlot[];
  /** Cam 2026-10-27: today's times this long gone (claim-tee-time LATE_ADD_MINUTES) drop to a
   *  "Past tee times" section at the top (SHEET-3, Cam 2026-11-06; was the bottom) — still openable for late check-ins, out of the way. */
  isGone?: (s: BoardSlot) => boolean;
  /** The time has already gone off (course clock). */
  isPast: (s: BoardSlot) => boolean;
  nextUpId: string | null;
  /** The row whose card is open. */
  selectedId: string | null;
  /** sheet.move — without it nothing drags. */
  canMove: boolean;
  /** A checked-in group moves only on today or later (an earlier day's round was played). */
  canMoveCheckedIn: boolean;
  /** A group dropped on another time: open the move dialog with that time picked. */
  onMove: (group: BoardGroup, fromTeeTimeId: string, toTeeTimeId: string) => void;
  /** A row tapped: open its card. */
  onSelect: (teeTimeId: string) => void;
}) {
  const [dragging, setDragging] = useState<{ group: BoardGroup; fromId: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [showGone, setShowGone] = useState(false);
  const gone = isGone ? allSlots.filter(isGone) : [];
  const slots = isGone ? allSlots.filter(s => !isGone(s)) : allSlots;
  // A late chip or search can pick a gone time — open the section so its row shows.
  const goneOpen = showGone || (!!selectedId && gone.some(s => s.id === selectedId));

  // A row that could take the dragged group. The route re-checks everything.
  const takes = (s: BoardSlot) => !!dragging && s.id !== dragging.fromId && s.status !== 'blocked' && !isPast(s)
    && s.playersAvailable - s.playersBooked >= dragging.group.players;

  // Every row has the same seat columns (the biggest time's), so seats line up down the sheet.
  const cols = Math.max(4, ...allSlots.map(s => s.playersAvailable));
  const gridOf = (w: string): React.CSSProperties => ({ gridTemplateColumns: `3.75rem ${w} repeat(${cols}, minmax(0, 1fr))` });
  const nowIndex = slots.findIndex(s => !isPast(s));
  // TEES-1 (Cam 2026-11-04, "side by side"): the day's tees, in the order the times first use them.
  const rankOf = new Map(allSlots.map(s => [s.tee ?? '', s.teeRank ?? 0]));
  const lanes = [...rankOf.keys()].sort((a, b) => (rankOf.get(a) ?? 0) - (rankOf.get(b) ?? 0) || a.localeCompare(b));
  const [lane, setLane] = useState('');
  const shownLane = lanes.includes(lane) ? lane : lanes[0];
  // ROUNDS-1 (Cam 2026-11-06, "easy to know which are 9 holes, which are twilight"): each tee's usual round is
  // named once (its header, or the sheet's first run); a time selling anything else carries its own label.
  const laneOf = (s: BoardSlot) => s.tee ?? '';
  const usualBy = new Map(lanes.map(l => [l, usualRound(allSlots.filter(x => laneOf(x) === l))]));
  const tagOf = (s: BoardSlot) => rowTag(s, usualBy.get(laneOf(s)) ?? '');
  // One pass per tee: the run each time sits in and when it began, so the header and its "from" always agree.
  const runAt = new Map(lanes.flatMap(l => [...runsOf(allSlots.filter(x => laneOf(x) === l), usualBy.get(l) ?? '')]));
  const tagsOn = allSlots.some(x => tagOf(x));
  const priceW = tagsOn ? '7.5rem' : '2.75rem';
  // Side by side the label shows from lg only: on an iPad two tees already share the width (review 2026-11-06).
  const laneVars = { '--pw': priceW, '--cols': cols } as React.CSSProperties;
  const laneGridCls = 'grid-cols-[2.75rem_repeat(var(--cols),minmax(0,1fr))] lg:grid-cols-[var(--pw)_repeat(var(--cols),minmax(0,1fr))] ';
  // A phone shows one tee (two columns); md and up show every tee.
  const laneRow = { '--lanes': lanes.length } as React.CSSProperties;
  const laneCols = 'grid-cols-[3.75rem_minmax(0,1fr)] md:grid-cols-[3.75rem_repeat(var(--lanes),minmax(0,1fr))] ';
  const showNow = nowIndex > 0;

  // One tee time's seats: the price, then a cell per seat (the time label sits beside it).
  const slotCells = (s: BoardSlot, withTime: boolean, extra = '') => {
    const past = isPast(s);
    const blocked = s.status === 'blocked';
    const target = takes(s);
    const next = s.id === nextUpId;
    const groups = s.bookings ?? [];
    let used = 0;
    const tag = tagOf(s);
    const openLabel = `${formatTeeTime(s.time)}${withTime ? '' : `, ${s.tee ?? ''}`}${tag ? `, ${tag}` : ''}${next ? ', next up' : ''}${blocked ? ', blocked' : `, ${s.playersBooked} of ${s.playersAvailable} booked`}. Open`;
    return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              onDragOver={e => { if (target) { e.preventDefault(); if (over !== s.id) setOver(s.id); } }}
              onDragLeave={() => setOver(o => (o === s.id ? null : o))}
              onDrop={e => { e.preventDefault(); if (dragging && target) onMove(dragging.group, dragging.fromId, s.id); setDragging(null); setOver(null); }}
              style={withTime ? gridOf(priceW) : laneVars}
              className={(extra || 'grid ') + (withTime ? '' : laneGridCls) + 'items-center gap-[3px] rounded-md cursor-pointer min-w-0 '
                + (over === s.id ? 'ring-2 ring-pine ' : selectedId === s.id ? 'ring-2 ring-pine/50 ' : target ? 'ring-1 ring-pine/30 ' : '')
                + (dragging && !target && s.id !== dragging.fromId ? 'opacity-40 ' : past ? 'opacity-55 ' : '')}>
              {/* The time (or, side by side, the price) is the row's button for keyboard and screen readers; groups stay siblings. */}
              {withTime ? (
              <button type="button"
                aria-label={openLabel}
                onClick={e => { e.stopPropagation(); onSelect(s.id); }}
                className={'h-8 px-1.5 text-left text-[13px] font-semibold tabular-nums rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-pine/40 '
                  + (next ? 'text-pine shadow-[inset_3px_0_0_var(--color-pine)] pl-2.5' : 'text-ink')}>
                {formatTeeTime(s.time).replace(/ (AM|PM)$/, '')}
              </button>
              ) : null}
              {withTime
                ? <span className="text-[12px] text-ink-muted tabular-nums min-w-0"><span className="flex flex-col leading-tight min-w-0"><span>{blocked ? '' : price(s.greenFee)}</span>{tag && !blocked && <span className={'text-[10.5px] font-medium text-ink-soft truncate ' + (withTime ? '' : 'hidden lg:block')} title={tag}>{tag}</span>}</span></span>
                : <button type="button" onClick={e => { e.stopPropagation(); onSelect(s.id); }}
                    aria-label={openLabel}
                    className="h-8 text-left text-[12px] text-ink-muted tabular-nums min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-pine/40"><span className="flex flex-col leading-tight min-w-0"><span>{blocked ? '' : price(s.greenFee)}</span>{tag && !blocked && <span className={'text-[10.5px] font-medium text-ink-soft truncate ' + (withTime ? '' : 'hidden lg:block')} title={tag}>{tag}</span>}</span></button>}
              {blocked ? (
                <span style={{ ...HATCH, gridColumn: `span ${cols}` }} className="h-8 rounded-[4px] bg-paper px-2 flex items-center text-[12.5px] italic text-ink-muted truncate">
                  {s.event ? s.event.name : 'Blocked'}
                </span>
              ) : (<>
                {groups.map(g => {
                  const span = Math.max(1, Math.min(g.players, cols - used)); used += span;
                  const t = groupTone(g);
                  const noShow = !!g.noShowAt && g.status === 'confirmed';
                  const can = canMove && movable(g) && (g.status !== 'completed' || canMoveCheckedIn);
                  return (
                    <button key={g.id} type="button" draggable={can}
                      title={`${g.golferName}, ${g.players} player${g.players === 1 ? '' : 's'} — ${g.status === 'completed' ? 'checked in, ' : ''}${TONE_LABEL[t]}${special(g) ? ', member or resident rate' : ''}${can ? '. Drag to another time to move' : ''}`}
                      onClick={e => { e.stopPropagation(); onSelect(s.id); }}
                      onDragStart={e => { e.dataTransfer.setData('text/plain', g.id); e.dataTransfer.effectAllowed = 'move'; setDragging({ group: g, fromId: s.id }); }}
                      onDragEnd={() => { setDragging(null); setOver(null); }}
                      style={{ gridColumn: `span ${span}` }}
                      className={'h-8 min-w-0 flex items-center gap-1.5 px-2 rounded-[5px] text-left text-[12.5px] shadow-[0_0_0_1px_var(--color-line)] '
                        + FILL[t] + ' '
                        + (can ? 'cursor-grab active:cursor-grabbing' : '')}>
                      <span className={'truncate ' + (t === 'bad' ? 'text-bad font-medium' : 'text-ink')}>{g.golferName}</span>
                      {g.players > 1 && <span className="shrink-0 text-ink-soft tabular-nums">+{g.players - 1}</span>}
                      {noShow ? <span className="shrink-0 ml-auto text-[11px] font-semibold text-bad">No-show</span>
                        : groupTags(g).length > 0 && <span className="shrink-0 ml-auto flex gap-1 text-[10.5px] font-semibold text-ink-soft">{groupTags(g).map(x => <span key={x}>{x}</span>)}</span>}
                    </button>
                  );
                })}
                {Array.from({ length: Math.max(0, s.playersAvailable - used) }, (_, k) => (
                  <span key={`open-${k}`} aria-hidden="true" className="h-8 rounded-[4px] bg-paper border border-dashed border-line" />
                ))}
              </>)}
            </div>
    );
  };

  const nowLine = <div className="flex items-center gap-2 py-0.5" aria-hidden="true">
    <span className="text-[11px] font-semibold text-warn">Now</span><span className="flex-1 border-t-2 border-warn" />
  </div>;

  const rows = (list: BoardSlot[], label: string, withNow: boolean) => {
  let lastHour = -1;
  let lastRun = '';
  if (lanes.length > 1) {
    // TEES-1: one line per time, a column per tee. A tee with no time then is an empty cell.
    const times = [...new Set(list.map(s => s.time))].sort();
    const nowAt = times.findIndex(t => list.some(s => s.time === t && !isPast(s)));
    return (
      <div role="list" aria-label={label} className="space-y-[3px]">
        {times.map((time, i) => {
          const h = Number(time.slice(0, 2));
          const newHour = h !== lastHour; lastHour = h;
          const at = list.filter(s => s.time === time);
          const next = at.some(s => s.id === nextUpId);
          return (
            <div key={time} role="listitem">
              {newHour && <div className={'px-1 text-[12px] font-semibold text-ink-muted ' + (i ? 'pt-2.5 pb-1' : 'pb-1')}>{hourLabel(h)}</div>}
              {withNow && nowAt > 0 && i === nowAt && nowLine}
              <div style={laneRow} className={laneCols + 'grid items-center gap-x-3'}>
                <span className={'h-8 px-1.5 flex items-center text-[13px] font-semibold tabular-nums ' + (next ? 'text-pine shadow-[inset_3px_0_0_var(--color-pine)] pl-2.5' : 'text-ink') + (at.every(isPast) ? ' opacity-55' : '')}>
                  {formatTeeTime(time).replace(/ (AM|PM)$/, '')}
                </span>
                {lanes.map(l => {
                  // Every time on this tee at this minute — two rows can share one (a hand-added time, an old row).
                  const ss = at.filter(x => (x.tee ?? '') === l);
                  return (
                    <div key={l} className={(l === shownLane ? 'block' : 'hidden md:block') + ' space-y-[3px] min-w-0'}>
                      {ss.length ? ss.map(s => slotCells(s, false)) : <span aria-hidden="true" className="block h-8 rounded-[4px]" />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div role="list" aria-label={label} className="space-y-[3px]">
      {list.map((s, i) => {
        const h = Number(s.time.slice(0, 2));
        const newHour = h !== lastHour; lastHour = h;
        const { run, from: runFrom } = runAt.get(s) ?? { run: '', from: s.time };
        const newRun = tagsOn && run !== lastRun; lastRun = run;
        return (
          <div key={s.id} role="listitem">
            {newRun && <div className={'flex items-center gap-2 px-1 text-[12.5px] font-semibold text-pine ' + (i ? 'pt-3 pb-0.5' : 'pb-0.5')}><span>{run}</span><span className="font-normal text-ink-muted">from {formatTeeTime(runFrom)}</span><span className="flex-1 border-t border-pine/20" /></div>}
            {newHour && <div className={'px-1 text-[12px] font-semibold text-ink-muted ' + (i && !newRun ? 'pt-2.5 pb-1' : 'pb-1')}>{hourLabel(h)}</div>}
            {withNow && showNow && i === nowIndex && nowLine}
            {slotCells(s, true)}
          </div>
        );
      })}
    </div>
  );
  };

  return (
    <div>
      {lanes.length > 1 && (
        <>
          {/* On a phone one tee at a time; from md up they sit side by side under these names. */}
          <div role="group" className="md:hidden mb-2 flex gap-1 p-1 rounded-[7px] bg-paper">
            {lanes.map(l => (
              <button key={l} type="button" aria-pressed={l === shownLane} onClick={() => setLane(l)}
                className={'flex-1 min-h-[36px] rounded-[5px] text-[13px] ' + (l === shownLane ? 'bg-white text-ink font-semibold shadow-card' : 'text-ink-muted')}>{l} · {usualRoundOnly(allSlots.filter(x => laneOf(x) === l))}</button>
            ))}
          </div>
          <div style={laneRow} className={laneCols + 'hidden md:grid gap-x-3 pb-1 text-[13px] font-semibold text-ink'}>
            <span />{lanes.map(l => <span key={l} className="px-1 truncate">{l}<span className="font-normal text-ink-muted"> · {usualRoundOnly(allSlots.filter(x => laneOf(x) === l))}</span></span>)}
          </div>
        </>
      )}
      {/* SHEET-3 (Cam 2026-11-06): past tee times sit at the top, collapsed — open them for a late check-in, the day carries on below. */}
      {gone.length > 0 && (
        <div className="mb-3 pb-2 border-b border-line">
          <button type="button" aria-expanded={goneOpen} onClick={() => setShowGone(!goneOpen)}
            className="w-full flex items-center justify-between px-1 py-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink">
            <span>{PAST} · {gone.length}</span><span aria-hidden="true">{goneOpen ? '▴' : '▾'}</span>
          </button>
          {goneOpen && <div className="mt-2">{rows(gone, PAST, false)}</div>}
        </div>
      )}
      {slots.length > 0 ? rows(slots, 'Tee times', true) : gone.length > 0 && <p className="py-6 text-center text-[13.5px] text-ink-muted">No more tee times today</p>}
    </div>
  );
}
