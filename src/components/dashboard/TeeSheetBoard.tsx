'use client';
// SHEET-2 (PLATFORM_ROADMAP_SPEC §9, Cam 2026-10-07: "like a draft board"; 2026-10-08:
// "these should all be squares that you can see all the people in it and how many …
// next up … green if its paid yellow if its booked"): the day as a board — a column
// per hour, that hour's tee times as equal squares, every group named with its
// player count. A square's left edge says where its money stands: green, every
// group has paid; amber, someone is booked but hasn't paid; red, a declined card
// or a no-show. Tapping a square opens it (the page's panel carries every action:
// check in, pay, cancel, move, walk-in, block). Dragging a group onto another square opens the SAME ACT-1 move
// dialog with that time priced — nothing moves until its confirm.
import { useState } from 'react';
import { formatTeeTime } from '@/lib/format';
import { StatusDot } from '@/components/ui/StatusDot';
import { CARD } from '@/components/ui/Card';

export type BoardGroup = {
  id: string; golferName: string; golferEmail: string; players: number; status: string;
  paymentStatus: string; noShowAt?: string | null; checkInFailReason?: string;
};
export type BoardSlot = { id: string; time: string; status: string; playersAvailable: number; playersBooked: number; bookings?: BoardGroup[] };
type Tone = 'ok' | 'warn' | 'bad';

const HATCH: React.CSSProperties = { backgroundImage: 'repeating-linear-gradient(135deg, #E3E4DE 0 1px, transparent 1px 7px)' };

/** Paid = checked in (online, card or at the counter) or collected ahead. */
export function groupTone(g: BoardGroup): Tone {
  if (g.status === 'completed' || g.paymentStatus === 'paid') return 'ok';
  if ((g.noShowAt && g.status === 'confirmed') || g.checkInFailReason) return 'bad';
  return 'warn';
}
const TONE_LABEL: Record<Tone, string> = { ok: 'Paid', warn: 'Booked, not paid yet', bad: 'Needs attention' };
const EDGE: Record<Tone, string> = { ok: 'border-l-[3px] border-ok', warn: 'border-l-[3px] border-warn', bad: 'border-l-[3px] border-bad' };

function slotTone(groups: BoardGroup[]): Tone | null {
  if (groups.length === 0) return null;
  const tones = groups.map(groupTone);
  return tones.includes('bad') ? 'bad' : tones.includes('warn') ? 'warn' : 'ok';
}

/** The same groups the list's Move link offers: confirmed and not a no-show, or checked in. */
const movable = (g: BoardGroup) => (g.status === 'confirmed' && !g.noShowAt) || g.status === 'completed';

function hourLabel(h: number) { return `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`; }

function seats(s: BoardSlot) {
  if (s.status === 'blocked') return <span className="italic text-ink-muted">Blocked</span>;
  const left = s.playersAvailable - s.playersBooked;
  if (left <= 0) return <span className="font-medium text-bad">Full</span>;
  return <span className="text-ink-muted">{left} open</span>;
}

export default function TeeSheetBoard({ slots, isPast, nextUpId, selectedId, canMove, canMoveCheckedIn, onMove, onSelect }: {
  slots: BoardSlot[];
  /** The time has already gone off (course clock). */
  isPast: (s: BoardSlot) => boolean;
  nextUpId: string | null;
  /** The square whose panel is open. */
  selectedId: string | null;
  /** sheet.move — without it nothing drags. */
  canMove: boolean;
  /** A checked-in group moves only on today or later (an earlier day's round was played). */
  canMoveCheckedIn: boolean;
  /** A group dropped on another time: open the move dialog with that time picked. */
  onMove: (group: BoardGroup, fromTeeTimeId: string, toTeeTimeId: string) => void;
  /** A square tapped: open its panel. */
  onSelect: (teeTimeId: string) => void;
}) {
  const [dragging, setDragging] = useState<{ group: BoardGroup; fromId: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);

  // A square that could take the dragged group. The route re-checks everything.
  const takes = (s: BoardSlot) => !!dragging && s.id !== dragging.fromId && s.status !== 'blocked' && !isPast(s)
    && s.playersAvailable - s.playersBooked >= dragging.group.players;

  const hours = new Map<number, BoardSlot[]>();
  for (const s of slots) {
    const h = Number(s.time.slice(0, 2));
    hours.set(h, [...(hours.get(h) ?? []), s]);
  }
  const perHour = Math.max(1, ...[...hours.values()].map(l => l.length));

  return (
    <div>
      {/* Fits the page (Cam 2026-10-08): one row per hour, that hour's times
          across it, so the day reads top to bottom and never scrolls sideways.
          Every row has the same number of columns (the busiest hour's), so a
          :10 time sits under the :10 time above it. Phones get two across. */}
      <div className="space-y-3 pb-3">
        {[...hours.entries()].map(([h, list]) => (
          <section key={h} className="sm:flex sm:gap-3" aria-label={hourLabel(h)}>
            <h3 className="text-[13px] font-semibold text-ink mb-1.5 sm:mb-0 sm:w-12 sm:shrink-0 sm:pt-2">{hourLabel(h)}</h3>
            <div className="flex-1 min-w-0 grid grid-cols-2 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))] gap-2"
              style={{ '--cols': perHour } as React.CSSProperties}>
              {list.map(s => {
                const past = isPast(s);
                const blocked = s.status === 'blocked';
                const target = takes(s);
                const groups = s.bookings ?? [];
                const tone = slotTone(groups);
                const next = s.id === nextUpId;
                return (
                  // The square takes a pointer tap anywhere; for keyboard and screen
                  // readers its time line is the button (groups stay siblings, never nested).
                  <div key={s.id}
                    onClick={() => onSelect(s.id)}
                    onDragOver={e => { if (target) { e.preventDefault(); if (over !== s.id) setOver(s.id); } }}
                    onDragLeave={() => setOver(o => (o === s.id ? null : o))}
                    onDrop={e => { e.preventDefault(); if (dragging && target) onMove(dragging.group, dragging.fromId, s.id); setDragging(null); setOver(null); }}
                    style={blocked ? HATCH : undefined}
                    className={'h-[112px] min-w-0 flex flex-col px-2.5 py-2 cursor-pointer motion-safe:transition-colors '
                      + (blocked ? 'bg-paper rounded-lg ' : CARD + ' ')
                      + (tone ? EDGE[tone] + ' ' : '')
                      + (over === s.id ? 'ring-2 ring-pine ' : selectedId === s.id ? 'ring-2 ring-pine/50 ' : next ? 'ring-1 ring-pine ' : target ? 'ring-1 ring-pine/30 ' : '')
                      + (dragging && !target && s.id !== dragging.fromId ? 'opacity-40 ' : past && !blocked ? 'opacity-50 ' : blocked ? 'opacity-60 ' : '')}>
                    <button type="button"
                      aria-label={`${formatTeeTime(s.time)}${next ? ', next up' : ''}${tone ? `, ${TONE_LABEL[tone].toLowerCase()}` : ''}. Open`}
                      onClick={e => { e.stopPropagation(); onSelect(s.id); }}
                      className="w-full flex flex-wrap items-baseline justify-between gap-x-2 text-left rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-pine/40">
                      <span className="text-[14px] font-semibold text-ink tabular-nums">{formatTeeTime(s.time)}</span>
                      {next && <span className="text-[11.5px] font-semibold text-pine">Next up</span>}
                    </button>
                    <div className="mt-1.5 space-y-0.5 min-h-0 flex-1">
                      {groups.slice(0, groups.length > 3 ? 2 : 3).map(g => {
                        // A past time's group can still move (checked in online, then late).
                        const can = canMove && movable(g) && (g.status !== 'completed' || canMoveCheckedIn);
                        const t = groupTone(g);
                        return (
                          <button key={g.id} type="button"
                            draggable={can}
                            title={`${g.golferName}, ${g.players} player${g.players === 1 ? '' : 's'} — ${TONE_LABEL[t].toLowerCase()}${can ? '. Drag to another time to move' : ''}`}
                            onClick={e => { e.stopPropagation(); onSelect(s.id); }}
                            onDragStart={e => { e.dataTransfer.setData('text/plain', g.id); e.dataTransfer.effectAllowed = 'move'; setDragging({ group: g, fromId: s.id }); }}
                            onDragEnd={() => { setDragging(null); setOver(null); }}
                            className={'w-full flex items-center gap-1.5 rounded px-1 py-[3px] text-left text-[12.5px] text-ink hover:bg-paper '
                              + (can ? 'cursor-grab active:cursor-grabbing' : '')}>
                            <StatusDot status={t} />
                            <span className="truncate flex-1">{g.golferName}</span>
                            {g.noShowAt && g.status === 'confirmed'
                              ? <span className="text-[11px] font-medium text-bad">No-show</span>
                              : <span className="tabular-nums text-ink-muted">{g.players}</span>}
                          </button>
                        );
                      })}
                      {groups.length > 3 && <div className="px-1 text-[12px] text-ink-muted">+{groups.length - 2} more</div>}
                    </div>
                    <div className="flex items-baseline justify-between text-[12px] tabular-nums pt-1">
                      <span className="text-ink-muted">{blocked ? '' : `${s.playersBooked} of ${s.playersAvailable}`}</span>
                      {seats(s)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[12.5px] text-ink-soft">
        {(['ok', 'warn', 'bad'] as const).map(t => <StatusDot key={t} status={t} label={TONE_LABEL[t]} />)}
        <span className="text-ink-muted">Tap a time to check in, take payment or move a group{canMove ? ', or drag a group onto another time' : ''}.</span>
      </div>
    </div>
  );
}
