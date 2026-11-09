import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { prisma } from '@/lib/prisma';

// MONEY-1 (Cam 2026-11-09, Money notes: "option to delete an item from the list"): take a declined card off Action
// needed (Money and Home). Nothing about the money changes — the group still owes and stays under Payments → Not paid
// yet; a new decline at check-in puts it back (lib/checkin-booking clears declineDismissedAt). The tee sheet's own
// pay-link permission, on this course's bookings only.
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.checkin'); if (denied) return denied; }
  const body = await req.json().catch(() => ({})) as { id?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Missing booking.' }, { status: 400 });
  const done = await prisma.booking.updateMany({ where: { id, courseId: session.courseId, checkInFailReason: { not: '' }, declineDismissedAt: null }, data: { declineDismissedAt: new Date() } });
  if (done.count === 0) return NextResponse.json({ error: 'That card isn’t on the list any more — refresh.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
