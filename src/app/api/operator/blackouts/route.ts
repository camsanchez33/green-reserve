import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { performCancellation } from '@/lib/cancel-booking';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await prisma.blackout.findMany({ where: { courseId: session.courseId } }));
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const { date, reason, closeDay } = await req.json();
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Pick a date.' }, { status: 400 });
  // Review (B-7): a booked tee time cannot be deleted (Booking.teeTime is a
  // required relation — the delete used to 500 on any day with a booking).
  // Open times go; booked ones are blocked in place and their bookings stay.
  await prisma.teeTime.deleteMany({ where: { courseId: session.courseId, date, bookings: { none: { status: { in: ['confirmed', 'completed'] } } } } });
  await prisma.teeTime.updateMany({ where: { courseId: session.courseId, date }, data: { status: 'blocked' } });
  const blackout = await prisma.blackout.create({ data: { courseId: session.courseId, date, reason: reason || '' } });

  // SD-5 close-a-day (weather): the course is closing — every confirmed booking
  // on the day is cancelled with an explanation, no fee kept (a fee already
  // taken is refunded, best effort), slot alerts stay quiet. Reported per
  // booking so nothing fails silently.
  let closed: { cancelled: number; feeRefundsFailed: number; failed: { bookingId: string; golferName: string; error: string }[] } | null = null;
  if (closeDay === true) {
    const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true } });
    const bookings = await prisma.booking.findMany({
      where: { courseId: session.courseId, status: 'confirmed', teeTime: { date } },
      select: { id: true, golferName: true },
    });
    closed = { cancelled: 0, feeRefundsFailed: 0, failed: [] };
    const why = `${course?.name ?? 'The course'} is closed on ${date}${reason ? ` (${reason})` : ''}, so your round has been cancelled. Nothing is owed — sorry for the day.`;
    for (const b of bookings) {
      const r = await performCancellation(b.id, { notifySlotAlerts: false, reason: why, waiveFee: true })
        .catch(err => ({ error: err instanceof Error ? err.message : String(err), status: 500 } as const));
      if ('error' in r && r.error) closed.failed.push({ bookingId: b.id, golferName: b.golferName, error: r.error });
      else { closed.cancelled++; if ('feeRefundFailed' in r && r.feeRefundFailed) closed.feeRefundsFailed++; }
    }
  }
  return NextResponse.json({ ...blackout, closed });
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const { id } = await req.json();
  // Verify ownership before deleting — never trust a bare ID from the client.
  const blackout = await prisma.blackout.findUnique({ where: { id } });
  if (!blackout || blackout.courseId !== session.courseId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await prisma.blackout.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
