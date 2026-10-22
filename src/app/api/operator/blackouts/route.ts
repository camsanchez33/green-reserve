import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { generateTeeTimes } from '@/lib/tee-sheet-engine';
import { todayIn } from '@/lib/course-time';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'schedule.view'); if (denied) return denied; } // SP-A
  return NextResponse.json(await prisma.blackout.findMany({ where: { courseId: session.courseId } }));
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'schedule.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const { date, reason } = await req.json();
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Pick a date.' }, { status: 400 });
  // Review (B-7): a booked tee time cannot be deleted (Booking.teeTime is a
  // required relation — the delete used to 500 on any day with a booking).
  // Open times go; booked ones are blocked in place and their bookings stay.
  // Only rows with NO bookings at all can go — Booking.teeTime is required, so a
  // row whose only bookings are cancelled must stay (it is blocked below).
  await prisma.teeTime.deleteMany({ where: { courseId: session.courseId, date, bookings: { none: {} } } });
  await prisma.teeTime.updateMany({ where: { courseId: session.courseId, date }, data: { status: 'blocked' } });
  const blackout = await prisma.blackout.create({ data: { courseId: session.courseId, date, reason: reason || '' } });

  // WX-1: the SD-5 close-a-day option (cancel every booking) moved to the Tee
  // Sheet's Weather button (/api/operator/weather-cancel), which also takes a
  // window. Blocking a day here never cancels anyone.
  return NextResponse.json(blackout);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'schedule.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const { id } = await req.json();
  // Verify ownership before deleting — never trust a bare ID from the client.
  const blackout = await prisma.blackout.findUnique({ where: { id } });
  if (!blackout || blackout.courseId !== session.courseId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await prisma.blackout.delete({ where: { id } });
  // Schedule rework (Cam 2026-10-19: changes reach the tee sheet without an
  // Apply button). Reopening a day undoes what closing it did: the times it
  // blocked in place (they hold bookings) go back on sale, then the day is
  // rebuilt from the schedule. Booked times are never removed by the rebuild.
  // A past day is history: reopening it only removes the block record.
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true } });
  if (blackout.date < todayIn(course?.timezone)) return NextResponse.json({ success: true, reopened: 0, created: 0 });
  const held = await prisma.teeTime.updateMany({ where: { courseId: session.courseId, date: blackout.date, status: 'blocked', eventId: null }, data: { status: 'available' } }); // W2-9: an event's held times stay held
  const created = await generateTeeTimes(session.courseId, blackout.date);
  return NextResponse.json({ success: true, reopened: held.count, created });
}
