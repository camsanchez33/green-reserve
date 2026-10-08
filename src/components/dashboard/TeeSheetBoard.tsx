'use client';
// SHEET-2 (PLATFORM_ROADMAP_SPEC §9, Cam 2026-10-07: "like a draft board"): the
// day as a board — a column per hour, that hour's tee times stacked down it as
// cards, each group a chip inside its card. Dragging a chip onto another card
// (or tapping the chip, then the card — touch and keyboard) opens the SAME
// ACT-1 move dialog with that time picked: same checks, same price and window
// notes, nothing moves until Confirm. The board only picks; the list stays the
// default view, and the move itself is lib/move-booking.ts behind the route.
import { useEffect, useState } from 'react';
import { formatTeeTime } from '@/lib/format';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card, CARD } from '@/components/ui/Card';

export type BoardGroup = { id: string; golferName: string; golferEmail: string; players: number; status: string; noShowAt?: string | null };
export type BoardSlot = { id: string; time: string; status: string; playersAvailable: number; playersBooked: number; bookings?: BoardGroup[] };
// viaDrag: picked by dragging — no banner, so nothing shifts under the cursor mid-drag.
type Picked = { group: BoardGroup; fromId: string; viaDrag?: boolean };

const HATCH: React.CSSProperties = { backgroundImage: 'repeating-linear-gradient(135deg, #E3E4DE 0 1px, transparent 1px 7px)' };

/** The same groups the list's Move link offers: confirmed and not a no-show, or checked in. */
const movable = (g: BoardGroup) => (g.status === 'confirmed' && !g.noShowAt) || g.status === 'completed';

function hourLabel(h: number) { return `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`; }

function slotLine(s: BoardSlot) {
  if (s.status === 'blocked') return <span className="italic text-ink-muted">Blocked</span>;
  const left = s.playersAvailable - s.playersBooked;
  if (left <= 0) return <span className="font-medium text-bad">Full</span>;
  if (s.playersBooked > 0) return <span className="font-medium text-warn">{left} left</span>;
  return <span className="text-ink-muted">{left} open</span>;
}

export default function TeeSheetBoard({ slots, isPast, nextUpId, canMove, canMoveCheckedIn, onMove, onOpen }: {
  slots: BoardSlot[];
  /** The time has already gone off (course clock). */
  isPast: (s: BoardSlot) => boolean;
  nextUpId: string | null;
  /** sheet.move — without it the board is read-only. */
  canMove: boolean;
  /** A checked-in group moves only on today or later (an earlier day's round was played). */
  canMoveCheckedIn: boolean;
  /** Open the move dialog for this group with the target time picked. */
  onMove: (group: BoardGroup, fromTeeTimeId: string, toTeeTimeId: string) => void;
  /** A card tapped with nothing picked: show that time in the list. */
  onOpen: (teeTimeId: string) => void;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => {
    if (!picked) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicked(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [picked]);

  // A card that could take the picked group. The route re-checks everything.
  const takes = (s: BoardSlot) => !!picked && s.id !== picked.fromId && s.status !== 'blocked' && !isPast(s)
    && s.playersAvailable - s.playersBooked >= picked.group.players;

  const drop = (s: BoardSlot) => {
    if (!picked || !takes(s)) return;
    onMove(picked.group, picked.fromId, s.id);
    setPicked(null); setOver(null);
  };

  const hours = new Map<number, BoardSlot[]>();
  for (const s of slots) {
    const h = Number(s.time.slice(0, 2));
    hours.set(h, [...(hours.get(h) ?? []), s]);
  }

  return (
    <div>
      {picked && !picked.viaDrag && (
        <Card className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 border-l-[3px] border-pine px-4 py-2.5 text-[13.5px] text-ink" role="status">
          <span>Moving <b className="font-semibold">{picked.group.golferName}</b> ({picked.group.players}). Drop or tap a time with room.</span>
          <button onClick={() => setPicked(null)} className="shrink-0 text-[13px] font-medium text-ink-soft hover:text-ink px-2 py-1">Cancel</button>
        </Card>
      )}
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
        {[...hours.entries()].map(([h, list]) => (
          <section key={h} className="w-[164px] shrink-0" aria-label={hourLabel(h)}>
            <h3 className="text-[13px] font-semibold text-ink mb-2 px-0.5">{hourLabel(h)}</h3>
            <div className="space-y-2">
              {list.map(s => {
                const past = isPast(s);
                const blocked = s.status === 'blocked';
                const target = takes(s);
                const groups = s.bookings ?? [];
                return (
                  <div key={s.id}
                    role="button" tabIndex={0}
                    aria-label={picked ? (target ? `Move ${picked.group.golferName} to ${formatTeeTime(s.time)}` : `${formatTeeTime(s.time)} can't take this group`) : `${formatTeeTime(s.time)} — show in the list`}
                    onClick={() => (picked ? drop(s) : onOpen(s.id))}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (picked) drop(s); else onOpen(s.id); } }}
                    onDragOver={e => { if (target) { e.preventDefault(); if (over !== s.id) setOver(s.id); } }}
                    onDragLeave={() => setOver(o => (o === s.id ? null : o))}
                    onDrop={e => { e.preventDefault(); drop(s); }}
                    style={blocked ? HATCH : undefined}
                    className={'px-2.5 py-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-pine/40 motion-safe:transition-colors '
                      + (blocked ? 'bg-paper rounded-lg ' : CARD + ' ')
                      + (s.id === nextUpId ? 'shadow-[inset_3px_0_0_var(--color-pine)] ' : '')
                      + (over === s.id ? 'ring-2 ring-pine ' : target ? 'ring-1 ring-pine/30 ' : '')
                      + (picked && !target && s.id !== picked.fromId ? 'opacity-40 ' : past && !blocked ? 'opacity-50 ' : blocked ? 'opacity-60 ' : '')}>
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="text-[13.5px] font-semibold text-ink tabular-nums">{formatTeeTime(s.time)}</span>
                      {slotLine(s)}
                    </div>
                    {groups.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {groups.map(g => {
                          // A past time's group can still move (checked in online, then late).
                          const can = canMove && movable(g) && (g.status !== 'completed' || canMoveCheckedIn);
                          const isPicked = picked?.group.id === g.id;
                          const checked = g.status === 'completed';
                          return (
                            <button key={g.id} type="button"
                              draggable={can}
                              disabled={!can}
                              aria-pressed={can ? isPicked : undefined}
                              title={can ? 'Drag to another time, or tap then tap a time' : undefined}
                              onClick={e => { e.stopPropagation(); if (can) setPicked(isPicked ? null : { group: g, fromId: s.id }); }}
                              onKeyDown={e => e.stopPropagation()}
                              onDragStart={e => { e.dataTransfer.setData('text/plain', g.id); e.dataTransfer.effectAllowed = 'move'; setPicked({ group: g, fromId: s.id, viaDrag: true }); }}
                              onDragEnd={() => { setOver(null); setPicked(p => (p?.viaDrag ? null : p)); }}
                              className={'w-full flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12.5px] disabled:cursor-default '
                                + (isPicked ? 'bg-pine text-white ' : 'bg-paper/70 text-ink ')
                                + (can ? 'cursor-grab active:cursor-grabbing hover:bg-paper ' : '')
                                + (isPicked ? 'hover:bg-pine ' : '')}>
                              {checked && !isPicked && <StatusDot status="ok" />}
                              <span className="truncate flex-1">{g.golferName}</span>
                              {g.noShowAt && g.status === 'confirmed'
                                ? <span className="text-[11px] font-medium text-bad">No-show</span>
                                : <span className={'tabular-nums ' + (isPicked ? 'text-white/85' : 'text-ink-muted')}>{g.players}</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {canMove && !picked && <p className="text-[12.5px] text-ink-muted mt-1">Drag a group to another time, or tap the group and then the time. Nothing moves until you confirm.</p>}
    </div>
  );
}
