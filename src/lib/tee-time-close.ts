// TT-CLOSE (Cam 2026-11-12, ADMIN_REDO_SPEC "Course dashboard Tee sheet + time card: APPROVED": "Close this time /
// Hide online / Delete time show only on a time with nobody booked, and the server refuses them on a booked time").
// Closing a time (status blocked) or hiding it online (staffOnly) while a group is on it would leave that group on a
// time golfers and staff no longer see as theirs, so the per-time route refuses it: move or cancel the group first.
// Each write is conditional on "no active booking" so a booking that lands between the check and the write can't
// slip under a closed time. SEATS-1's seat stepper (only open seats), day blackouts (block in place on purpose),
// events, weather and frost are separate paths and are not changed here.
import { prisma } from './prisma';

/** A group still on the time: booked or checked in (cancelled groups are history). */
export const ACTIVE_BOOKING = { status: { in: ['confirmed', 'completed'] } };

export type CloseResult = { ok: true } | { ok: false; status: number; error: string };

/** "Smith (4)", "Smith (4) and Lee (2)", "Smith (4), Lee (2) and 1 more" — what's on the time, for the 409. */
export function bookedOnTime(groups: { golferName: string; players: number }[]): string {
  const names = groups.slice(0, 2).map(g => `${g.golferName || 'A group'} (${g.players})`);
  const more = groups.length - names.length;
  if (more > 0) return `${names.join(', ')} and ${more} more`;
  return names.join(' and ');
}

export function refusal(action: 'close' | 'hide' | 'delete', groups: { golferName: string; players: number }[]): string {
  const what = action === 'close' ? 'close' : action === 'hide' ? 'hide' : 'delete';
  const n = groups.length;
  return `This time has ${n === 1 ? 'a group' : `${n} groups`} booked — ${bookedOnTime(groups)}. Move or cancel ${n === 1 ? 'it' : 'them'} before you ${what} the time.`;
}

async function why(courseId: string, teeTimeId: string, action: 'close' | 'hide' | 'delete'): Promise<CloseResult> {
  const t = await prisma.teeTime.findFirst({
    where: { id: teeTimeId, courseId },
    select: { bookings: { where: ACTIVE_BOOKING, orderBy: { createdAt: 'asc' }, select: { golferName: true, players: true } } },
  });
  if (!t) return { ok: false, status: 404, error: 'Not found' };
  if (t.bookings.length) return { ok: false, status: 409, error: refusal(action, t.bookings) };
  return { ok: false, status: 409, error: 'This time just changed — look again.' };
}

/** Close the time to new bookings, only while nobody is booked on it. */
export async function closeFreeTime(courseId: string, teeTimeId: string): Promise<CloseResult> {
  const r = await prisma.teeTime.updateMany({ where: { id: teeTimeId, courseId, bookings: { none: ACTIVE_BOOKING } }, data: { status: 'blocked' } });
  return r.count ? { ok: true } : why(courseId, teeTimeId, 'close');
}

/** Hide the time online (counter only), only while nobody is booked on it. Showing it again is always allowed. */
export async function setStaffOnly(courseId: string, teeTimeId: string, staffOnly: boolean): Promise<CloseResult> {
  const r = await prisma.teeTime.updateMany({
    where: { id: teeTimeId, courseId, ...(staffOnly ? { bookings: { none: ACTIVE_BOOKING } } : {}) },
    data: { staffOnly },
  });
  return r.count ? { ok: true } : staffOnly ? why(courseId, teeTimeId, 'hide') : { ok: false, status: 404, error: 'Not found' };
}

/** Why a time can't be deleted for the groups on it (the route keeps its other checks), or null. */
export async function deleteRefusal(courseId: string, teeTimeId: string): Promise<string | null> {
  const groups = await prisma.booking.findMany({ where: { teeTimeId, courseId, ...ACTIVE_BOOKING }, orderBy: { createdAt: 'asc' }, select: { golferName: true, players: true } });
  return groups.length ? refusal('delete', groups) : null;
}
