// B-9 frost delay (Cam 2026-10-01: "move into open slots"). The course delays
// its first tee time to `newStart`. Every confirmed group booked before it moves
// into the earliest open slot at or after `newStart` with room for the whole
// party, same round (product) and holes. Groups are placed in tee-time order, so
// earlier groups get the earlier times; a small later group may still fill a gap
// a bigger group couldn't, which beats sending it home. The early
// times are then BLOCKED, so nobody books them and the tee-sheet generator (which
// leaves blocked rows alone) cannot recreate them. A group with no slot that fits
// stays where it is and is listed for staff to call — nobody is cancelled.
//
// Prices are not changed: the group pays what it booked. Checked-in or cancelled
// bookings are never touched.
import { prisma } from './prisma';
import { sendFrostDelayEmail, PLACEHOLDER_EMAIL_DOMAIN } from './email';
import { formatTeeTime, formatTeeDate } from './format';

export type FrostMove = { bookingId: string; name: string; players: number; fromTime: string; toTime: string; toTeeTimeId: string };
export type FrostPlan = {
  date: string; newStart: string;
  moves: FrostMove[];
  unplaced: { bookingId: string; name: string; players: number; time: string }[];
  blockTeeTimeIds: string[];
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isFrostTime = (t: string) => TIME.test(t);

export async function planFrostDelay(courseId: string, date: string, newStart: string): Promise<FrostPlan> {
  const slots = await prisma.teeTime.findMany({
    where: { courseId, date },
    orderBy: { time: 'asc' },
    select: { id: true, time: true, status: true, productId: true, holes: true, playersAvailable: true, playersBooked: true,
      bookings: { where: { status: 'confirmed' }, orderBy: { createdAt: 'asc' }, select: { id: true, golferName: true, players: true } } },
  });
  const early = slots.filter(s => s.time < newStart);
  // Room left in each later slot, decremented as groups are placed.
  const room = new Map(slots.filter(s => s.time >= newStart && s.status !== 'blocked').map(s => [s.id, s.playersAvailable - s.playersBooked]));
  const later = slots.filter(s => room.has(s.id));

  const moves: FrostMove[] = [];
  const unplaced: FrostPlan['unplaced'] = [];
  for (const s of early) {
    for (const b of s.bookings) {
      const target = later.find(t => (room.get(t.id) ?? 0) >= b.players && t.productId === s.productId && t.holes === s.holes);
      if (!target) { unplaced.push({ bookingId: b.id, name: b.golferName, players: b.players, time: s.time }); continue; }
      room.set(target.id, (room.get(target.id) ?? 0) - b.players);
      moves.push({ bookingId: b.id, name: b.golferName, players: b.players, fromTime: s.time, toTime: target.time, toTeeTimeId: target.id });
    }
  }
  return { date, newStart, moves, unplaced, blockTeeTimeIds: early.filter(s => s.status !== 'blocked').map(s => s.id) };
}

/**
 * Apply a plan. Each move is its own Serializable transaction that re-checks the
 * target still has room (a golfer may have booked it since the preview), so a
 * race turns that group into "unplaced", never an overbooked slot.
 */
export async function applyFrostDelay(courseId: string, plan: FrostPlan, courseName: string) {
  const moved: (FrostMove & { emailed: boolean | null })[] = [];
  const unplaced = [...plan.unplaced];
  for (const m of plan.moves) {
    try {
      await prisma.$transaction(async (tx) => {
        const b = await tx.booking.findFirst({ where: { id: m.bookingId, courseId, status: 'confirmed' }, select: { teeTimeId: true, players: true } });
        const to = await tx.teeTime.findFirst({ where: { id: m.toTeeTimeId, courseId }, select: { playersAvailable: true, playersBooked: true, status: true } });
        if (!b || !to || to.status === 'blocked' || to.playersAvailable - to.playersBooked < b.players) throw new Error('no room');
        await tx.booking.update({ where: { id: m.bookingId }, data: { teeTimeId: m.toTeeTimeId } });
        await tx.teeTime.update({ where: { id: b.teeTimeId }, data: { playersBooked: { decrement: b.players } } });
        const booked = to.playersBooked + b.players;
        await tx.teeTime.update({ where: { id: m.toTeeTimeId }, data: { playersBooked: booked, status: booked >= to.playersAvailable ? 'full' : 'available' } });
      }, { isolationLevel: 'Serializable' });
    } catch {
      unplaced.push({ bookingId: m.bookingId, name: m.name, players: m.players, time: m.fromTime });
      continue;
    }
    moved.push({ ...m, emailed: null });
  }
  await prisma.teeTime.updateMany({ where: { id: { in: plan.blockTeeTimeIds }, courseId }, data: { status: 'blocked' } });

  // Tell each moved golfer. A failed email never undoes a move — the result
  // says who did not get one so staff can call.
  for (const m of moved) {
    const b = await prisma.booking.findUnique({ where: { id: m.bookingId }, select: { golferEmail: true, golferName: true, players: true, checkInToken: true } });
    if (!b || !b.golferEmail || b.golferEmail.endsWith(PLACEHOLDER_EMAIL_DOMAIN)) continue;
    try {
      await sendFrostDelayEmail({ golferName: b.golferName, golferEmail: b.golferEmail, courseName, date: formatTeeDate(plan.date), oldTime: formatTeeTime(m.fromTime), newTime: formatTeeTime(m.toTime), players: b.players, bookingId: m.bookingId, checkInToken: b.checkInToken });
      m.emailed = true;
    } catch (err) {
      m.emailed = false;
      console.error(JSON.stringify({ ev: 'frost_delay.email_failed', bookingId: m.bookingId, error: err instanceof Error ? err.message : String(err) }));
    }
  }
  return { moved, unplaced, blocked: plan.blockTeeTimeIds.length };
}
