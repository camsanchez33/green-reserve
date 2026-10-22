import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, MANAGER_PLUS, stepUpRequired, areaGate } from '@/lib/admin-session';
import { refundBooking } from '@/lib/refund-booking';
import { needReason, reasonOf, auditAdmin, courseOfBooking } from '@/lib/admin-audit';

// MP-6b: POST /api/admin/refund { bookingId, amountCents?, reason }
// Money leaves a course's account — manager+, and every refund names who did
// it and why, on the PaymentEvent row and in the golfer's email.
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const noArea = areaGate(session, 'golfers');
  if (noArea) return noArea;
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Refunds need manager access.' }, { status: 403 });
  const su = stepUpRequired(session); if (su) return su;

  const body = await req.json().catch(() => ({}));
  const nr = needReason('refund', body); if (nr) return nr;
  const bookingId = String(body.bookingId || '');
  if (!bookingId) return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });
  const amountCents = body.amountCents === undefined || body.amountCents === null || body.amountCents === '' ? undefined : Number(body.amountCents);
  if (amountCents !== undefined && !Number.isFinite(amountCents)) return NextResponse.json({ error: 'amountCents must be a number' }, { status: 400 });

  const reason = reasonOf(body);
  const result = await refundBooking(bookingId, { amountCents, reason, actor: 'admin', actorName: session.name });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await auditAdmin(session, { action: 'refund', targetType: 'booking', targetId: bookingId, courseId: await courseOfBooking(bookingId), after: { amountCents: amountCents ?? 'full' }, reason });
  return NextResponse.json(result);
}
