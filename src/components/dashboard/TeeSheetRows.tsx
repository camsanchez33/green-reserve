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
import { useState } from 'react';
import { formatTeeTime } from '@/lib/format';

export type BoardGroup = {
  id: string; golferName: string; golferEmail: string; players: number; status: string;
  paymentStatus: string; noShowAt?: string | null; checkInFailReason?: string;
  /** RES-1 / tiers: a member or resident rate shades the group. */
  residentPlayers?: number; appliedRate?: string;
};
export type BoardSlot = {
  id: string; time: string; status: string; playersAvailable: number; playersBooked: number;
  bookings?: BoardGroup[]; event?: { id: string; name: string } | null;
  /** Price a player, dollars (shown in the row). */
  greenFee?: number;
};
type Tone = 'ok' | 'warn' | 'bad';

const HATCH: React.CSSProperties = { backgroundImage: 'repeating-linear-gradient(135deg, #E3E4DE 0 1px, transparent 1px 7px)' };

/** Paid = checked in (online, card or at the counter) or collected ahead. */
export function groupTone(g: BoardGroup): Tone {
  if (g.status === 'completed' || g.paymentStatus === 'paid') return 'ok';
  if ((g.noShowAt && g.status === 'confirmed') || g.checkInFailReason) return 'bad';
  return 'warn';
}
const TONE_LABEL: Record<Tone, string> = { ok: 'paid', warn: 'booked, not paid yet', bad: 'needs attention' };
const EDGE: Record<Tone, string> = { ok: 'border-l-ok', warn: 'border-l-warn', bad: 'border-l-bad' };

const special = (g: BoardGroup) => (g.residentPlayers ?? 0) > 0 || (!!g.appliedRate && g.appliedRate !== 'standard');

/** The same groups the panel's Move offers: confirmed and not a no-show, or checked in. */
const movable = (g: BoardGroup) => (g.status === 'confirmed' && !g.noShowAt) || g.status === 'completed';

const hourLabel = (h: number) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;
const price = (v?: number) => v == null ? '' : `$${Number.isInteger(v) ? v : v.toFixed(2)}`;

export default function TeeSheetRows({ slots, isPast, nextUpId, selectedId, canMove, canMoveCheckedIn, onMove, onSelect }: {
  slots: BoardSlot[];
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

  // A row that could take the dragged group. The route re-checks everything.
  const takes = (s: BoardSlot) => !!dragging && s.id !== dragging.fromId && s.status !== 'blocked' && !isPast(s)
    && s.playersAvailable - s.playersBooked >= dragging.group.players;

  // Every row has the same seat columns (the biggest time's), so seats line up down the sheet.
  const cols = Math.max(4, ...slots.map(s => s.playersAvailable));
  const grid: React.CSSProperties = { gridTemplateColumns: `3.75rem 2.75rem repeat(${cols}, minmax(0, 1fr))` };
  const nowIndex = slots.findIndex(s => !isPast(s));
  const showNow = nowIndex > 0;

  let lastHour = -1;
  return (
    <div role="list" aria-label="Tee times" className="space-y-[3px]">
      {slots.map((s, i) => {
        const h = Number(s.time.slice(0, 2));
        const newHour = h !== lastHour; lastHour = h;
        const past = isPast(s);
        const blocked = s.status === 'blocked';
        const target = takes(s);
        const next = s.id === nextUpId;
        const groups = s.bookings ?? [];
        let used = 0;
        return (
          <div key={s.id} role="listitem">
            {newHour && <div className={'px-1 text-[12px] font-semibold text-ink-muted ' + (i ? 'pt-2.5 pb-1' : 'pb-1')}>{hourLabel(h)}</div>}
            {showNow && i === nowIndex && (
              <div className="flex items-center gap-2 py-0.5" aria-hidden="true">
                <span className="text-[11px] font-semibold text-warn">Now</span><span className="flex-1 border-t-2 border-warn" />
              </div>
            )}
            <div
              onClick={() => onSelect(s.id)}
              onDragOver={e => { if (target) { e.preventDefault(); if (over !== s.id) setOver(s.id); } }}
              onDragLeave={() => setOver(o => (o === s.id ? null : o))}
              onDrop={e => { e.preventDefault(); if (dragging && target) onMove(dragging.group, dragging.fromId, s.id); setDragging(null); setOver(null); }}
              style={grid}
              className={'grid items-center gap-[3px] rounded-md cursor-pointer '
                + (over === s.id ? 'ring-2 ring-pine ' : selectedId === s.id ? 'ring-2 ring-pine/50 ' : target ? 'ring-1 ring-pine/30 ' : '')
                + (dragging && !target && s.id !== dragging.fromId ? 'opacity-40 ' : past && !blocked ? 'opacity-55 ' : '')}>
              {/* The time is the row's button for keyboard and screen readers; groups stay siblings. */}
              <button type="button"
                aria-label={`${formatTeeTime(s.time)}${next ? ', next up' : ''}${blocked ? ', blocked' : `, ${s.playersBooked} of ${s.playersAvailable} booked`}. Open`}
                onClick={e => { e.stopPropagation(); onSelect(s.id); }}
                className={'h-8 px-1.5 text-left text-[13px] font-semibold tabular-nums rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-pine/40 '
                  + (next ? 'text-pine shadow-[inset_3px_0_0_var(--color-pine)] pl-2.5' : 'text-ink')}>
                {formatTeeTime(s.time).replace(/ (AM|PM)$/, '')}
              </button>
              <span className="text-[12px] text-ink-muted tabular-nums truncate">{blocked ? '' : price(s.greenFee)}</span>
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
                      className={'h-8 min-w-0 flex items-center gap-1.5 px-2 rounded-[4px] border-l-[3px] text-left text-[12.5px] shadow-[0_0_0_1px_rgba(20,24,20,0.08)] '
                        + EDGE[t] + ' '
                        + (g.status === 'completed' ? 'bg-ok/[0.12] ' : special(g) ? 'bg-[#F1EEE4] ' : 'bg-white ')
                        + (can ? 'cursor-grab active:cursor-grabbing' : '')}>
                      <span className={'truncate ' + (t === 'bad' ? 'text-bad font-medium' : 'text-ink')}>{g.golferName}</span>
                      {g.players > 1 && <span className="shrink-0 text-ink-muted tabular-nums">+{g.players - 1}</span>}
                      {noShow && <span className="shrink-0 ml-auto text-[11px] font-semibold text-bad">No-show</span>}
                    </button>
                  );
                })}
                {Array.from({ length: Math.max(0, s.playersAvailable - used) }, (_, k) => (
                  <span key={`open-${k}`} aria-hidden="true" className="h-8 rounded-[4px] bg-paper border border-dashed border-line" />
                ))}
              </>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
