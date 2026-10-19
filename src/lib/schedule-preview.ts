// Schedule rework (Cam 2026-10-19: saving hours or prices applies to the tee
// sheet straight away, "and the save shows exactly what will change first").
// Before a create, edit, pause or delete is saved, this works out what the
// rebuild of the next days will do to the tee sheet — without writing anything.
// It uses the same desiredSlots() as generateTeeTimes, so the preview and the
// save cannot disagree. Server only.
import { prisma } from './prisma';
import { todayIn, addDaysStr } from './course-time';
import { desiredSlots, slotKey, type ScheduleForSlots } from './tee-sheet-engine';
import { scheduleMoneyForCreate, scheduleMoneyFromWire } from './schedule-wire';

/** How many days regenerateUpcoming() rebuilds — the preview covers the same days. */
export const PREVIEW_DAYS = 8;

export type ScheduleChange =
  | { op: 'create'; body: Record<string, unknown> }
  | { op: 'update'; id: string; data: Record<string, unknown> }
  | { op: 'delete'; id: string };

export type SchedulePreview = {
  days: number;
  added: number;        // new tee times golfers can book
  removed: number;      // empty tee times that go away
  repriced: number;     // empty tee times that stay but change price
  bookedKept: number;   // booked or blocked times the change would have touched, left exactly as they are
};

type Existing = { productId: string | null; time: string; playersBooked: number; status: string; greenFeeCents: number; memberRateCents: number | null; residentRateCents: number | null; cartFeeCents: number; bookings: number };

/** Pure: compare one day's existing rows with what the schedules would make. */
export function diffDay(existing: Existing[], desired: ReturnType<typeof desiredSlots>): Omit<SchedulePreview, 'days'> {
  const out = { added: 0, removed: 0, repriced: 0, bookedKept: 0 };
  const byKey = new Map(existing.map(t => [slotKey(t.productId, t.time), t]));
  for (const [key, slot] of desired) {
    const t = byKey.get(key);
    if (!t) { out.added++; continue; }
    const kept = t.playersBooked > 0 || t.status === 'blocked' || t.bookings > 0;
    const samePrice = t.greenFeeCents === slot.greenFeeCents && t.memberRateCents === slot.memberRateCents
      && t.residentRateCents === slot.residentRateCents && t.cartFeeCents === slot.cartFeeCents;
    if (samePrice) continue;
    if (kept) out.bookedKept++; else out.repriced++;
  }
  for (const [key, t] of byKey) {
    if (desired.has(key)) continue;
    const kept = t.playersBooked > 0 || t.status === 'blocked' || t.bookings > 0;
    if (kept) out.bookedKept++; else out.removed++;
  }
  return out;
}

function asSchedule(row: Record<string, unknown>): ScheduleForSlots {
  return row as unknown as ScheduleForSlots;
}

/** The course's schedules as they would be after `change`, in creation order. */
async function proposedSchedules(courseId: string, change: ScheduleChange): Promise<ScheduleForSlots[] | null> {
  const rows = await prisma.teeTimeSchedule.findMany({ where: { courseId }, orderBy: { createdAt: 'asc' } });
  if (change.op === 'create') {
    const b = change.body;
    return [...rows.map(asSchedule), asSchedule({
      daysOfWeek: (b.daysOfWeek as number[]) ?? [], productId: (b.productId as string) || null,
      startTime: String(b.startTime ?? ''), endTime: String(b.endTime ?? ''), intervalMinutes: Number(b.intervalMinutes) || 8,
      holes: Number(b.holes) || 18, tierName: (b.tierName as string) || 'standard', walkingAllowed: b.walkingAllowed !== false, active: true,
      ...scheduleMoneyForCreate(b),
    })];
  }
  const target = rows.find(r => r.id === change.id);
  if (!target) return null;
  if (change.op === 'delete') return rows.filter(r => r.id !== change.id).map(asSchedule);
  const d = change.data;
  return rows.map(r => r.id !== change.id ? asSchedule(r) : asSchedule({
    ...r,
    ...(d.active !== undefined ? { active: Boolean(d.active) } : {}),
    ...(d.daysOfWeek !== undefined ? { daysOfWeek: d.daysOfWeek } : {}),
    ...(d.startTime !== undefined ? { startTime: String(d.startTime) } : {}),
    ...(d.endTime !== undefined ? { endTime: String(d.endTime) } : {}),
    ...(d.intervalMinutes !== undefined ? { intervalMinutes: Number(d.intervalMinutes) } : {}),
    ...(d.tierName !== undefined ? { tierName: String(d.tierName) } : {}),
    ...(d.walkingAllowed !== undefined ? { walkingAllowed: Boolean(d.walkingAllowed) } : {}),
    ...(d.productId !== undefined ? { productId: (d.productId as string) || null } : {}),
    ...scheduleMoneyFromWire(d),
  }));
}

/** What saving `change` would do to the next PREVIEW_DAYS days. Null when the schedule isn't this course's. */
export async function previewScheduleChange(courseId: string, change: ScheduleChange): Promise<SchedulePreview | null> {
  const schedules = await proposedSchedules(courseId, change);
  if (!schedules) return null;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  const today = todayIn(course?.timezone);
  const dates = Array.from({ length: PREVIEW_DAYS }, (_, i) => addDaysStr(today, i));
  const [products, blackouts, teeTimes] = await Promise.all([
    prisma.courseProduct.findMany({ where: { courseId }, select: { id: true, holes: true, active: true } }),
    prisma.blackout.findMany({ where: { courseId, date: { in: dates } }, select: { date: true } }),
    prisma.teeTime.findMany({
      where: { courseId, date: { in: dates } },
      select: { date: true, productId: true, time: true, playersBooked: true, status: true, greenFeeCents: true, memberRateCents: true, residentRateCents: true, cartFeeCents: true, _count: { select: { bookings: true } } },
    }),
  ]);
  const closed = new Set(blackouts.map(b => b.date));
  const total: SchedulePreview = { days: PREVIEW_DAYS, added: 0, removed: 0, repriced: 0, bookedKept: 0 };
  for (const date of dates) {
    if (closed.has(date)) continue; // a closed day is never rebuilt
    const existing = teeTimes.filter(t => t.date === date).map(t => ({ ...t, productId: t.productId ?? null, bookings: t._count.bookings }));
    const d = diffDay(existing, desiredSlots(date, schedules, products));
    total.added += d.added; total.removed += d.removed; total.repriced += d.repriced; total.bookedKept += d.bookedKept;
  }
  return total;
}
