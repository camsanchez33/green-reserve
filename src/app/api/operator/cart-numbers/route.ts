import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { tidyCartNumbers, cartNumberMode, cartTicketMode, starterColumns } from '@/lib/starter-sheet';

// CART-4 (Cam 2026-11-09): the cart numbers a group took — typed at check-in, on the group card, or by the starter.
// Not a price, so it can change after the round is paid; refused on a cancelled booking. The course is the session's.
// How this course runs carts (Settings → Booking rules): the group card, the cart ticket and the starter's sheet read it.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.view'); if (denied) return denied; }
  const c = await prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true, cartNumbers: true, cartTicket: true, starterColumns: true } });
  if (!c) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  return NextResponse.json({ courseName: c.name, mode: cartNumberMode(c.cartNumbers), ticket: cartTicketMode(c.cartTicket), columns: starterColumns(c.starterColumns) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.checkin'); if (denied) return denied; }
  const body = await req.json().catch(() => ({})) as { id?: unknown; cartNumbers?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Missing booking.' }, { status: 400 });
  const cartNumbers = tidyCartNumbers(body.cartNumbers);
  const done = await prisma.booking.updateMany({ where: { id, courseId: session.courseId, status: { not: 'cancelled' } }, data: { cartNumbers } });
  if (done.count === 0) return NextResponse.json({ error: 'Booking not found, or it was cancelled.' }, { status: 404 });
  return NextResponse.json({ ok: true, cartNumbers });
}
