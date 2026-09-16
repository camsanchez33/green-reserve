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

export async function generateTeeTimes(courseId: string, dateStr: string): Promise<number> {
  const d = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = d.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const blackout = await prisma.blackout.findFirst({ where: { courseId, date: dateStr } });
  if (blackout) return 0;

  const schedules = await prisma.teeTimeSchedule.findMany({ where: { courseId, active: true } });
  // L2: a schedule scoped to a product generates that product's slots (with
  // the product's hole count); a schedule scoped to an INACTIVE product
  // generates nothing. Unscoped schedules are the simple course, as before.
  const products = await prisma.courseProduct.findMany({ where: { courseId }, select: { id: true, holes: true, active: true } });
  const productById = new Map(products.map(p => [p.id, p]));
  const applicable = schedules.filter(
    s => (s.daysOfWeek.length === 0 || s.daysOfWeek.includes(dayOfWeek))
      && (!s.productId || productById.get(s.productId)?.active === true)
  );

  // Build the desired slot map (product|time -> data) from schedules. Two
  // schedules for the SAME scope overlapping on a time: the later one wins —
  // one row per product per time. Two products may share a start time (their
  // nines do not overlap; the schedule editor refuses the case where they do).
  // MP-3 B2c+B2d: cents throughout. Because TeeTimeSchedule and TeeTime were
  // converted in the SAME migration, this copy stays a straight pass-through —
  // no x100 anywhere in the generation path.
  const slotKey = (productId: string | null, time: string) => `${productId ?? ''}|${time}`;
  const desired = new Map<string, {
    productId: string | null; time: string;
    holes: number; greenFeeCents: number; memberRateCents: number | null; residentRateCents: number | null;
    cartFeeCents: number; walkingAllowed: boolean; tierName: string;
  }>();
  for (const schedule of applicable) {
    const greenFeeCents     = isWeekend ? schedule.greenFeeWeekendCents     : schedule.greenFeeWeekdayCents;
    const memberRateCents   = isWeekend ? schedule.memberRateWeekendCents   : schedule.memberRateWeekdayCents;
    const residentRateCents = isWeekend ? schedule.residentRateWeekendCents : schedule.residentRateWeekdayCents;
    const productId = schedule.productId ?? null;
    const holes = productId ? (productById.get(productId)?.holes ?? schedule.holes) : schedule.holes;

    let current = timeToMinutes(schedule.startTime);
    const end = timeToMinutes(schedule.endTime);
    while (current < end) {
      const time = minutesToTime(current);
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

  const existing = await prisma.teeTime.findMany({ where: { courseId, date: dateStr } });
  const existingByKey = new Map(existing.map(t => [slotKey(t.productId ?? null, t.time), t]));

  let created = 0;

  // Remove empty slots that either changed or are no longer in the schedule.
  // Booked slots (playersBooked > 0) are never deleted, even if the schedule
  // dropped that time — the golfer already paid for it.
  const toDelete = existing.filter(t => t.playersBooked === 0 && t.status !== 'blocked').map(t => t.id);
  // Operator-blocked slots are also left alone — that's a manual override, not generated data.
  if (toDelete.length > 0) {
    await prisma.teeTime.deleteMany({ where: { id: { in: toDelete } } });
  }

  for (const [key, slot] of desired) {
    const existingSlot = existingByKey.get(key);
    if (existingSlot && (existingSlot.playersBooked > 0 || existingSlot.status === 'blocked')) {
      // Already booked or manually blocked — leave it exactly as is.
      continue;
    }
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
