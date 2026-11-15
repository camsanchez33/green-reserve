import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { payoutDetail } from '@/lib/payout-detail';

// Revenue page (Cam 2026-11-15): one payout taken apart (lib/payout-detail) and the bank's last
// four. Read-only, the session's course's own Stripe account, the Payouts permission like the list.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'money.payouts'); if (denied) return denied; }
  const { id } = await params;
  try {
    const d = await payoutDetail(session.courseId, id);
    if (!d) return NextResponse.json({ error: 'That payout isn’t on your Stripe account.' }, { status: 404 });
    return NextResponse.json(d, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'payout_detail.read_failed', error: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: 'Could not load this payout from Stripe. Try again in a minute.' }, { status: 502 });
  }
}
