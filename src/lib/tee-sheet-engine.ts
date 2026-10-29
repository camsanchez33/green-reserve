import { prisma } from './prisma';
import type { Prisma } from '@prisma/client';
import { heldBy, ninesByProduct } from './event-hold';
import { todayIn, addDaysStr } from './course-time';
import { generationHorizonDays } from './booking-window';
import { teeTimeInstant } from './booking-events';

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
export async function regenerateUpcoming(courseId: string, days?: number): Promise<void> {
  // SD-3: "today" is the course's today, not the server's UTC day.
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  const today = todayIn(course?.timezone);
  // Revamp 3 fix 5 (Cam 2026-10-29): every day a golfer can book, not just 8 —
  // a price saved today reached days 1–8 while days 9+ (bookable) kept the old one.
  const n = days ?? await regenerationDays(courseId);
  for (let i = 0; i < n; i++) {
    await generateTeeTimes(courseId, addDaysStr(today, i));
  }
}

/** How many days ahead a schedule change rebuilds: the course's widest booking window plus one, never below 8 (as the nightly run). */
export async function regenerationDays(courseId: string): Promise<number> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { publicAdvanceDays: true, memberAdvanceDays: true, membershipTiers: { select: { advanceBookingDays: true } } } });
  return c ? Math.max(8, generationHorizonDays(c, c.membershipTiers)) : 8;
}

export type ScheduleForSlots = {
  daysOfWeek: number[]; productId: string | null; startTime: string; endTime: string; intervalMinutes: number; holes: number;
  greenFeeWeekdayCents: number; greenFeeWeekendCents: number;
  memberRateWeekdayCents: number | null; memberRateWeekendCents: number | null;
  residentRateWeekdayCents: number | null; residentRateWeekendCents: number | null;
  cartFeeCents: number; walkingAllowed: boolean; tierName: string; active?: boolean;
  /** CART-1: weekend cart price and walking; null/absent = the weekday values. */
  cartFeeWeekendCents?: number | null; walkingWeekend?: boolean | null;
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
        cartFeeCents: isWeekend ? schedule.cartFeeWeekendCents ?? schedule.cartFeeCents : schedule.cartFeeCents,
        walkingAllowed: isWeekend ? schedule.walkingWeekend ?? schedule.walkingAllowed : schedule.walkingAllowed,
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
  // W2-9: a time inside a planned event's window is created already held for it.
  const events = await prisma.courseEvent.findMany({ where: { courseId, date: dateStr, status: 'planned' }, select: { id: true, format: true, holdFrom: true, holdTo: true, productId: true, status: true, shareCourse: true, holdNineIds: true, keepOpen: true } });
  const ninesOf = ninesByProduct(products);

  const existing = await prisma.teeTime.findMany({
    where: { courseId, date: dateStr },
    include: { _count: { select: { bookings: true } } },
  });
  const tz = (await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } }))?.timezone;
  const nowMs = Date.now();
  const existingByKey = new Map(existing.map(t => [slotKey(t.productId ?? null, t.time), t]));
  // Pre-L2 rows (productId null) that hold a booking or a block: when a
  // schedule is later scoped to a round, the round's slot at that time ADOPTS
  // the row instead of sitting beside it — one physical tee, one row.
  const legacyKeptByTime = new Map(
    existing.filter(t => !t.productId && (t.playersBooked > 0 || t.status === 'blocked')).map(t => [t.time, t]),
  );

  let created = 0;

  // Reviewer 2026-10-29 (fix 5 widened the rebuild to the whole booking horizon):
  // open slots are diffed, not deleted and re-created. An open slot still in the
  // schedule is updated in place only when something about it changed (grouped,
  // so a price change is a handful of writes per day); an open slot the schedule
  // no longer has is deleted; only missing times are created. A save that changes
  // nothing writes nothing.
  // Booked slots (playersBooked > 0) are never deleted, even if the schedule
  // dropped that time — the golfer already paid for it. A slot whose only
  // bookings are cancelled still has Booking rows pointing at it (RESTRICT), and
  // operator-blocked slots are a manual override: both are left alone.
  const isOpen = (t: typeof existing[number]) => t.playersBooked === 0 && t.status !== 'blocked' && t._count.bookings === 0;
  const toDelete = existing.filter(t => isOpen(t) && !desired.has(slotKey(t.productId ?? null, t.time))).map(t => t.id);
  if (toDelete.length > 0) {
    await prisma.teeTime.deleteMany({ where: { id: { in: toDelete } } });
  }
  const updates = new Map<string, { data: Prisma.TeeTimeUncheckedUpdateManyInput; ids: string[] }>();

  const adopted = new Set<string>();
  for (const [key, slot] of desired) {
    const existingSlot = existingByKey.get(key);
    if (existingSlot && !isOpen(existingSlot)) {
      // Booked, blocked, or carrying cancelled bookings: the row stays. Revamp 3 fix 5 (Cam
      // 2026-10-29): its OPEN spots take the new price — a booking keeps the price it was
      // made at (its own totals), so only new bookings see it. A time already gone keeps
      // its price: that's the posted-price history Analytics reads.
      const at = teeTimeInstant(tz, dateStr, existingSlot.time);
      const changed = existingSlot.greenFeeCents !== slot.greenFeeCents || existingSlot.memberRateCents !== slot.memberRateCents
        || existingSlot.residentRateCents !== slot.residentRateCents || existingSlot.cartFeeCents !== slot.cartFeeCents
        || existingSlot.walkingAllowed !== slot.walkingAllowed;
      if (changed && at && at.getTime() > nowMs) {
        await prisma.teeTime.update({ where: { id: existingSlot.id }, data: {
          greenFeeCents: slot.greenFeeCents, memberRateCents: slot.memberRateCents, residentRateCents: slot.residentRateCents,
          cartFeeCents: slot.cartFeeCents, walkingAllowed: slot.walkingAllowed,
        } });
      }
      continue;
    }
    const event = heldBy(events, slot.productId, slot.time, ninesOf(slot.productId));
    const fields = {
      holes: slot.holes, greenFeeCents: slot.greenFeeCents, memberRateCents: slot.memberRateCents, residentRateCents: slot.residentRateCents,
      cartFeeCents: slot.cartFeeCents, walkingAllowed: slot.walkingAllowed, tierName: slot.tierName,
      status: event ? 'blocked' : 'available', eventId: event?.id ?? null,
    };
    if (existingSlot) {
      // Open and still wanted: bring it up to date in place (its id, and any alert or link to it, survive).
      const same = (Object.keys(fields) as (keyof typeof fields)[]).every(k => existingSlot[k] === fields[k]);
      if (!same) {
        const k = JSON.stringify(fields);
        const u = updates.get(k) ?? { data: fields, ids: [] as string[] };
        u.ids.push(existingSlot.id); updates.set(k, u);
      }
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
    await prisma.teeTime.create({
      data: { courseId, date: dateStr, time: slot.time, productId: slot.productId, playersAvailable: 4, playersBooked: 0, ...fields },
    });
    created++;
  }
  // Only rows still open: a booking that landed since the read keeps its slot as it is.
  for (const { data, ids } of updates.values()) {
    await prisma.teeTime.updateMany({ where: { id: { in: ids }, playersBooked: 0, status: { not: 'blocked' } }, data });
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
