import { prisma } from './prisma';

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
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    await generateTeeTimes(courseId, d.toISOString().split('T')[0]);
  }
}

export async function generateTeeTimes(courseId: string, dateStr: string): Promise<number> {
  const d = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = d.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const blackout = await prisma.blackout.findFirst({ where: { courseId, date: dateStr } });
  if (blackout) return 0;

  const schedules = await prisma.teeTimeSchedule.findMany({ where: { courseId, active: true } });
  const applicable = schedules.filter(
    s => s.daysOfWeek.length === 0 || s.daysOfWeek.includes(dayOfWeek)
  );

  // Build the desired slot map (time -> data) from schedules. If two active
  // schedules overlap on the same time, the later one in the list wins —
  // same single-row-per-time guarantee the old code lacked.
  // MP-3 B2c+B2d: cents throughout. Because TeeTimeSchedule and TeeTime were
  // converted in the SAME migration, this copy stays a straight pass-through —
  // no x100 anywhere in the generation path.
  const desired = new Map<string, {
    holes: number; greenFeeCents: number; memberRateCents: number | null; residentRateCents: number | null;
    cartFeeCents: number; walkingAllowed: boolean; tierName: string;
  }>();
  for (const schedule of applicable) {
    const greenFeeCents     = isWeekend ? schedule.greenFeeWeekendCents     : schedule.greenFeeWeekdayCents;
    const memberRateCents   = isWeekend ? schedule.memberRateWeekendCents   : schedule.memberRateWeekdayCents;
    const residentRateCents = isWeekend ? schedule.residentRateWeekendCents : schedule.residentRateWeekdayCents;

    let current = timeToMinutes(schedule.startTime);
    const end = timeToMinutes(schedule.endTime);
    while (current < end) {
      desired.set(minutesToTime(current), {
        holes: schedule.holes,
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
  const existingByTime = new Map(existing.map(t => [t.time, t]));

  let created = 0;

  // Remove empty slots that either changed or are no longer in the schedule.
  // Booked slots (playersBooked > 0) are never deleted, even if the schedule
  // dropped that time — the golfer already paid for it.
  const toDelete = existing.filter(t => t.playersBooked === 0 && t.status !== 'blocked').map(t => t.id);
  // Operator-blocked slots are also left alone — that's a manual override, not generated data.
  if (toDelete.length > 0) {
    await prisma.teeTime.deleteMany({ where: { id: { in: toDelete } } });
  }

  for (const [time, slot] of desired) {
    const existingSlot = existingByTime.get(time);
    if (existingSlot && (existingSlot.playersBooked > 0 || existingSlot.status === 'blocked')) {
      // Already booked or manually blocked — leave it exactly as is.
      continue;
    }
    await prisma.teeTime.create({
      data: {
        courseId,
        date: dateStr,
        time,
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

export async function generateForAllCourses(daysAhead = 8): Promise<{ courseId: string; date: string; error: string }[]> {
  const schedules = await prisma.teeTimeSchedule.findMany({
    where: { active: true },
    select: { courseId: true },
    distinct: ['courseId'],
  });
  const today = new Date();
  const errors: { courseId: string; date: string; error: string }[] = [];

  for (const { courseId } of schedules) {
    for (let i = 0; i < daysAhead; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
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
