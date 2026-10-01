// WX-1 weather cancel (Cam 2026-10-01: "it should just be like a mass
// cancelation"). The course calls off play for the whole day or a window of it
// (a storm after 1pm). Every confirmed group in the window is cancelled the way
// Close a day cancels it: fee waived (a hold already taken is refunded, best
// effort), the golfer emailed the reason, slot alerts kept quiet. Every tee time
// in the window is BLOCKED, so nobody books into the storm and the generator
// (which leaves blocked rows alone) cannot reopen it. A whole day also gets a
// Blackout row, exactly like Close a day, so it shows under Schedule.
//
// On today, times that have already gone out are left alone — those groups are
// on the course or already played, and their hold fee belongs to check-in.
import { prisma } from './prisma';
import { performCancellation } from './cancel-booking';
import { clockIn, todayIn } from './course-time';
import type { EventActor } from './booking-events';
import { isPlaceholderEmail } from './email';

/** noEmail: the golfer has no real address (walk-in, phone) — staff must call. */
export type WeatherGroup = { bookingId: string; name: string; players: number; time: string; noEmail: boolean };
export type WeatherPlan = {
  date: string; from: string; to: string; wholeDay: boolean;
  /** Set on today: tee times at or before this clock time are left alone. */
  startedBefore: string | null;
  groups: WeatherGroup[];
  teeTimeIds: string[];
};
export type WeatherResult = {
  cancelled: WeatherGroup[];
  failed: (WeatherGroup & { error: string })[];
  feeRefundsFailed: number;
  blocked: number;
};

const noEmail = (e: string) => !e || isPlaceholderEmail(e);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isWeatherTime = (t: string) => TIME.test(t);

/** Window is [from, to) — a 1pm-to-close storm is from 13:00 to 24:00. */
export async function planWeatherCancel(courseId: string, date: string, window: { from: string; to: string } | null, tz: string | null | undefined): Promise<WeatherPlan> {
  const from = window?.from ?? '00:00';
  const to = window?.to ?? '24:00';
  const startedBefore = date === todayIn(tz) ? clockIn(tz) : null;
  const slots = await prisma.teeTime.findMany({
    where: { courseId, date, time: { gte: from, lt: to } },
    orderBy: { time: 'asc' },
    select: { id: true, time: true,
      bookings: { where: { status: 'confirmed' }, orderBy: { createdAt: 'asc' }, select: { id: true, golferName: true, golferEmail: true, players: true } } },
  });
  const live = startedBefore ? slots.filter(s => s.time > startedBefore) : slots;
  return {
    date, from, to, wholeDay: !window, startedBefore,
    groups: live.flatMap(s => s.bookings.map(b => ({ bookingId: b.id, name: b.golferName, players: b.players, time: s.time, noEmail: noEmail(b.golferEmail) }))),
    teeTimeIds: live.map(s => s.id),
  };
}

export async function applyWeatherCancel(courseId: string, plan: WeatherPlan, actor: EventActor, why: string, note: string): Promise<WeatherResult> {
  const result: WeatherResult = { cancelled: [], failed: [], feeRefundsFailed: 0, blocked: 0 };
  const block = () => prisma.teeTime.updateMany({ where: { courseId, id: { in: plan.teeTimeIds } }, data: { status: 'blocked' } });

  // Block first so nobody books into the window while it is being cancelled.
  // A cancellation sets its slot back to 'available', so block again after.
  await block();
  const cancel = async (g: WeatherGroup) => {
    const r = await performCancellation(g.bookingId, actor, { notifySlotAlerts: false, reason: why, waiveFee: true })
      .catch(err => ({ error: err instanceof Error ? err.message : String(err), status: 500 } as const));
    if ('error' in r && r.error) result.failed.push({ ...g, error: r.error });
    else { result.cancelled.push(g); if ('feeRefundFailed' in r && r.feeRefundFailed) result.feeRefundsFailed++; }
  };
  for (const g of plan.groups) await cancel(g);
  result.blocked = (await block()).count;

  // A booking that landed between the plan and the first block is still
  // confirmed on a now-blocked time. Sweep once more.
  const seen = new Set(plan.groups.map(g => g.bookingId));
  const stragglers = await prisma.booking.findMany({
    where: { courseId, status: 'confirmed', teeTimeId: { in: plan.teeTimeIds } },
    select: { id: true, golferName: true, golferEmail: true, players: true, teeTime: { select: { time: true } } },
  });
  for (const b of stragglers.filter(b => !seen.has(b.id))) await cancel({ bookingId: b.id, name: b.golferName, players: b.players, time: b.teeTime.time, noEmail: noEmail(b.golferEmail) });
  if (stragglers.length) result.blocked = (await block()).count;

  if (plan.wholeDay && !(await prisma.blackout.findFirst({ where: { courseId, date: plan.date } }))) {
    await prisma.blackout.create({ data: { courseId, date: plan.date, reason: note || 'Weather' } });
  }
  return result;
}
