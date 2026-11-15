import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { paymentDetail } from '@/lib/payment-detail';

// Revenue → Payments (Cam 2026-11-15): one payment's side card (lib/payment-detail), by its ledger row id
// from ledger ?rows=1. Read-only, the session's course only, money.payments like the ledger.
export const maxDuration = 20;

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'money.payments'); if (denied) return denied; }
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return NextResponse.json({ error: 'Pick a payment.' }, { status: 400 });
  const d = await paymentDetail(session.courseId, id);
  if (!d) return NextResponse.json({ error: 'That payment isn’t on your course.' }, { status: 404 });
  return NextResponse.json(d, { headers: { 'Cache-Control': 'no-store' } });
}
