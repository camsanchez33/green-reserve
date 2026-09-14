import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await prisma.blackout.findMany({ where: { courseId: session.courseId } }));
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const { date, reason } = await req.json();
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Pick a date.' }, { status: 400 });
  // Review (B-7): a booked tee time cannot be deleted (Booking.teeTime is a
  // required relation — the delete used to 500 on any day with a booking).
  // Open times go; booked ones are blocked in place and their bookings stay.
  await prisma.teeTime.deleteMany({ where: { courseId: session.courseId, date, bookings: { none: { status: { in: ['confirmed', 'completed'] } } } } });
  await prisma.teeTime.updateMany({ where: { courseId: session.courseId, date }, data: { status: 'blocked' } });
  const blackout = await prisma.blackout.create({ data: { courseId: session.courseId, date, reason: reason || '' } });
  return NextResponse.json(blackout);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const { id } = await req.json();
  // Verify ownership before deleting — never trust a bare ID from the client.
  const blackout = await prisma.blackout.findUnique({ where: { id } });
  if (!blackout || blackout.courseId !== session.courseId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await prisma.blackout.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
