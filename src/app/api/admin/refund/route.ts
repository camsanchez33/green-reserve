import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { refundBooking } from '@/lib/refund-booking';

// MP-6b: POST /api/admin/refund { bookingId, amountCents?, reason }
// Money leaves a course's account — manager+, and every refund names who did
// it and why, on the PaymentEvent row and in the golfer's email.
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Refunds need manager access.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const bookingId = String(body.bookingId || '');
  if (!bookingId) return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });
  const amountCents = body.amountCents === undefined || body.amountCents === null || body.amountCents === '' ? undefined : Number(body.amountCents);
  if (amountCents !== undefined && !Number.isFinite(amountCents)) return NextResponse.json({ error: 'amountCents must be a number' }, { status: 400 });

  const result = await refundBooking(bookingId, { amountCents, reason: String(body.reason || ''), actor: 'admin', actorName: session.name });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
