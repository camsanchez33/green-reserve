import { prisma } from './prisma';
import { todayIn, addDaysStr } from './course-time';
import { generationHorizonDays } from './booking-window';

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

/**
 * Generates/refreshes TeeTime rows for one course on one date from its active
 * TeeTimeSchedule templates.
 *
 * IMPORTANT: this is called every night by a rolling cron (see generateForAllCourses)
 * for the same upcoming dates over and over as the window slides forward. A date
 * that's already had bookings made against it WILL be re-processed on later runs.
 * We must never delete a TeeTime row that has playersBooked > 0 — Booking rows
 * reference TeeTime by foreign key, so deleting a booked slot either throws a
 * constraint error (killing the whole batch) or, worse, cascades and destroys a
 * golfer's paid booking. Booked slots are left untouched; only empty slots are
 * deleted/recreated to pick up schedule or pricing changes.
 */
/**
 * Rebuild the rolling tee-sheet window after a schedule changes.
 *
 * MP-5a: creating a schedule regenerated; editing and deleting one did not.
 * A deleted schedule's slots therefore stayed on sale for up to eight days —
 * golfers could book a time the course no longer offered. generateTeeTimes is
 * idempotent and never touches booked or operator-blocked slots, so replaying
 * the window is the whole fix.
 */
export async function regenerateUpcoming(courseId: string, days = 8): Promise<void> {
  // SD-3: "today" is the course's today, not the server's UTC day.
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  const today = todayIn(course?.timezone);
  for (let i = 0; i < days; i++) {
    await generateTeeTimes(courseId, addDaysStr(today, i));
  }
}

export type ScheduleForSlots = {
  daysOfWeek: number[]; productId: string | null; startTime: string; endTime: string; intervalMinutes: number; holes: number;
  greenFeeWeekdayCents: number; greenFeeWeekendCents: number;
  memberRateWeekdayCents: number | null; memberRateWeekendCents: number | null;
  residentRateWeekdayCents: number | null; residentRateWeekendCents: number | null;
  cartFeeCents: number; walkingAllowed: boolean; tierName: string; active?: boolean;
};
export type DesiredSlot = {
  productId: string | null; time: string;
  holes: number; greenFeeCents: number; memberRateCents: number | null; residentRateCents: number | null;
  cartFeeCents: number; walkingAllowed: boolean; tierName: string;
};
export const slotKey = (productId: string | null, time: string) => `${productId ?? ''}|${time}`;

/**
 * The slots a day should have, from the course's ACTIVE schedules. Pure — shared
 * by generateTeeTimes and the Schedule page's save preview (lib/schedule-preview.ts),
 * so what the preview promises is exactly what a save does.
 */
export function desiredSlots(dateStr: string, schedules: ScheduleForSlots[], products: { id: string; holes: number; active: boolean; nineIds?: string[] }[]): Map<string, DesiredSlot> {
  const d = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = d.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  // L2: a schedule scoped to a product generates that product's slots (with
  // the product's hole count); a schedule scoped to an INACTIVE product
  // generates nothing. Unscoped schedules are the simple course, as before.
  const productById = new Map(products.map(p => [p.id, p]));
  const applicable = schedules.filter(
    s => s.active !== false && (s.daysOfWeek.length === 0 || s.daysOfWeek.includes(dayOfWeek))
      && (!s.productId || productById.get(s.productId)?.active === true)
  );

  // Build the desired slot map (product|time -> data) from schedules. Two
  // schedules for the SAME scope overlapping on a time: the later one wins —
  // one row per product per time. Two products may share a start time when
  // they start on different nines; the same first tee at the same minute is
  // refused when the schedule is saved (lib/schedule-conflict, W2-6).
  // MP-3 B2c+B2d: cents throughout. Because TeeTimeSchedule and TeeTime were
  // converted in the SAME migration, this copy stays a straight pass-through —
  // no x100 anywhere in the generation path.
  const desired = new Map<string, DesiredSlot>();
  // W2-3 (Cam 2026-10-19): the last tee time goes off AT the schedule's end
  // ("Last tee time"), when it lands on the interval. The save-time conflict
  // check (lib/schedule-conflict.ts) is half-open, so back-to-back schedules
  // that share ground (morning ends 12:00, twilight starts 12:00; or two rounds
  // on a shared nine) are allowed — the one that STARTS at the shared time owns
  // it, and the other's end slot is dropped. Same ground = the rule that check
  // uses: same scope, either side whole-course, or a nine in common.
  const ninesOf = (id: string | null) => (id ? productById.get(id)?.nineIds ?? [] : []);
  const sharesGround = (a: ScheduleForSlots, b: ScheduleForSlots) => {
    const pa = a.productId ?? null, pb = b.productId ?? null;
    if (pa === pb || !pa || !pb) return true;
    const nb = ninesOf(pb);
    return ninesOf(pa).some(n => nb.includes(n));
  };
  const handsOff = (s: ScheduleForSlots, end: number) =>
    applicable.some(o => o !== s && timeToMinutes(o.startTime) === end && o.intervalMinutes >= 1 && sharesGround(s, o));
  for (const schedule of applicable) {
    const greenFeeCents     = isWeekend ? schedule.greenFeeWeekendCents     : schedule.greenFeeWeekdayCents;
    const memberRateCents   = isWeekend ? schedule.memberRateWeekendCents   : schedule.memberRateWeekdayCents;
    const residentRateCents = isWeekend ? schedule.residentRateWeekendCents : schedule.residentRateWeekdayCents;
    const productId = schedule.productId ?? null;
    const holes = productId ? (productById.get(productId)?.holes ?? schedule.holes) : schedule.holes;

    // A zero or negative gap would never reach the last tee — skip it rather than loop forever.
    if (!(schedule.intervalMinutes >= 1)) continue;
    let current = timeToMinutes(schedule.startTime);
    const end = timeToMinutes(schedule.endTime);
    while (current <= end) {
      const time = minutesToTime(current);
      if (current === end && handsOff(schedule, end)) break;
      desired.set(slotKey(productId, time), {
        productId, time,
        holes,
        greenFeeCents,
        memberRateCents: memberRateCents ?? null,
        residentRateCents: residentRateCents ?? null,
        cartFeeCents: schedule.cartFeeCents,
        walkingAllowed: schedule.walkingAllowed,
        tierName: schedule.tierName,
      });
      current += schedule.intervalMinutes;
    }
  }

  return desired;
}

export async function generateTeeTimes(courseId: string, dateStr: string): Promise<number> {
  const blackout = await prisma.blackout.findFirst({ where: { courseId, date: dateStr } });
  if (blackout) return 0;

  const schedules = await prisma.teeTimeSchedule.findMany({ where: { courseId, active: true } });
  const products = await prisma.courseProduct.findMany({ where: { courseId }, select: { id: true, holes: true, active: true, nineIds: true } });
  const desired = desiredSlots(dateStr, schedules, products);

  const existing = await prisma.teeTime.findMany({
    where: { courseId, date: dateStr },
    include: { _count: { select: { bookings: true } } },
  });
  const existingByKey = new Map(existing.map(t => [slotKey(t.productId ?? null, t.time), t]));
  // Pre-L2 rows (productId null) that hold a booking or a block: when a
  // schedule is later scoped to a round, the round's slot at that time ADOPTS
  // the row instead of sitting beside it — one physical tee, one row.
  const legacyKeptByTime = new Map(
    existing.filter(t => !t.productId && (t.playersBooked > 0 || t.status === 'blocked')).map(t => [t.time, t]),
  );

  let created = 0;

  // Remove empty slots that either changed or are no longer in the schedule.
  // Booked slots (playersBooked > 0) are never deleted, even if the schedule
  // dropped that time — the golfer already paid for it.
  // A slot whose only bookings are cancelled still has Booking rows pointing
  // at it (RESTRICT): deleting it would abort the whole date. Keep it.
  const toDelete = existing.filter(t => t.playersBooked === 0 && t.status !== 'blocked' && t._count.bookings === 0).map(t => t.id);
  // Operator-blocked slots are also left alone — that's a manual override, not generated data.
  const deleted = new Set(toDelete);
  if (toDelete.length > 0) {
    await prisma.teeTime.deleteMany({ where: { id: { in: toDelete } } });
  }

  const adopted = new Set<string>();
  for (const [key, slot] of desired) {
    const existingSlot = existingByKey.get(key);
    if (existingSlot && (existingSlot.playersBooked > 0 || existingSlot.status === 'blocked' || existingSlot._count.bookings > 0)) {
      // Already booked, manually blocked, or carrying cancelled bookings — leave it exactly as is.
      continue;
    }
    if (slot.productId) {
      const legacy = legacyKeptByTime.get(slot.time);
      if (legacy && !adopted.has(legacy.id)) {
        adopted.add(legacy.id);
        await prisma.teeTime.update({ where: { id: legacy.id }, data: { productId: slot.productId, holes: slot.holes } });
        continue;
      }
    }
    // Hotfix 2026-10-19: `existing` was read BEFORE the delete above, so every
    // open row we just deleted still matched here and was skipped — a second
    // run on the same day wiped all its open tee times and recreated none
    // (they came back the next night, then vanished again). Only a row that
    // survived the delete (cancelled bookings only) is kept as is.
    if (existingSlot && !deleted.has(existingSlot.id)) continue;
    await prisma.teeTime.create({
      data: {
        courseId,
        date: dateStr,
        time: slot.time,
        productId: slot.productId,
        holes: slot.holes,
        playersAvailable: 4,
        playersBooked: 0,
        greenFeeCents: slot.greenFeeCents,
        memberRateCents: slot.memberRateCents,
        residentRateCents: slot.residentRateCents,
        cartFeeCents: slot.cartFeeCents,
        walkingAllowed: slot.walkingAllowed,
        tierName: slot.tierName,
        status: 'available',
      },
    });
    created++;
  }

  return created;
}

export async function generateForAllCourses(minDaysAhead = 8): Promise<{ courseId: string; date: string; error: string }[]> {
  const schedules = await prisma.teeTimeSchedule.findMany({
    where: { active: true },
    select: { courseId: true },
    distinct: ['courseId'],
  });
  // BOOKING WINDOWS: every course is generated at least as far ahead as its
  // widest window (public, member default, any tier) plus one day — derived,
  // never hardcoded, and never below the old 8.
  const windows = await prisma.course.findMany({
    where: { id: { in: schedules.map(s => s.courseId) } },
    select: { id: true, timezone: true, publicAdvanceDays: true, memberAdvanceDays: true, membershipTiers: { select: { advanceBookingDays: true } } },
  });
  const horizon = new Map(windows.map(c => [c.id, Math.max(minDaysAhead, generationHorizonDays(c, c.membershipTiers))]));
  const tzOf = new Map(windows.map(c => [c.id, c.timezone]));
  const errors: { courseId: string; date: string; error: string }[] = [];

  for (const { courseId } of schedules) {
    const daysAhead = horizon.get(courseId) ?? minDaysAhead;
    // SD-3: each course's window starts on ITS today.
    const today = todayIn(tzOf.get(courseId));
    for (let i = 0; i < daysAhead; i++) {
      const dateStr = addDaysStr(today, i);
      try {
        await generateTeeTimes(courseId, dateStr);
      } catch (err) {
        // One course/date failing should never block the rest of the batch.
        errors.push({ courseId, date: dateStr, error: err instanceof Error ? err.message : String(err) });
        console.error(`Tee time generation failed for course ${courseId} on ${dateStr}:`, err);
      }
    }
  }
  return errors;
}
