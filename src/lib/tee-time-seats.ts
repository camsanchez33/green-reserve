// SEATS-1 (Cam 2026-11-08: "if they want to close the time they can close it by one individual spot or as many as
// there are"). Staff close open seats on a time one at a time, or all of them, and reopen them the same way.
// playersAvailable stays what every capacity check reads (online, counter, moves, party changes), so a closed seat
// is simply not for sale anywhere; seatsClosed remembers how many were closed, so playersAvailable + seatsClosed is
// the time's size and a seat can come back. Booked groups are never touched: only an open seat can close, and the
// write re-checks that nobody booked or closed one in between. A time held for an event is the event's.
import { prisma } from './prisma';

export type SeatsResult = { ok: true; seatsClosed: number; playersAvailable: number } | { ok: false; status: number; error: string };

export async function setSeatsClosed(courseId: string, teeTimeId: string, wantRaw: unknown): Promise<SeatsResult> {
  const want = Number(wantRaw);
  if (!Number.isInteger(want) || want < 0) return { ok: false, status: 400, error: 'Pick how many seats to close.' };
  const tt = await prisma.teeTime.findFirst({ where: { id: teeTimeId, courseId }, select: { playersAvailable: true, playersBooked: true, seatsClosed: true, status: true, eventId: true } });
  if (!tt) return { ok: false, status: 404, error: 'Not found' };
  if (tt.eventId) return { ok: false, status: 409, error: 'This time is held for an event — change it on the Events tab.' };
  const size = tt.playersAvailable + tt.seatsClosed;
  const free = size - tt.playersBooked;
  if (want > free) return { ok: false, status: 409, error: `Only ${free} seat${free === 1 ? ' is' : 's are'} open to close.` };
  const available = size - want;
  const r = await prisma.teeTime.updateMany({
    // The read above, unchanged: nobody booked or closed a seat in between.
    where: { id: teeTimeId, courseId, playersAvailable: tt.playersAvailable, seatsClosed: tt.seatsClosed, playersBooked: { lte: available } },
    data: { playersAvailable: available, seatsClosed: want, ...(tt.status === 'blocked' ? {} : { status: tt.playersBooked >= available ? 'full' : 'available' }) },
  });
  if (r.count === 0) return { ok: false, status: 409, error: 'This time just changed — look again.' };
  return { ok: true, seatsClosed: want, playersAvailable: available };
}
