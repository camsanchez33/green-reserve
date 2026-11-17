import { NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { projections, projectionsWithoutMoney } from '@/lib/analytics-page';

// Analytics → Tee sheet → Projections (Cam 2026-11-17): the next 30 days against the last 30, and the next
// 7 days' pace (lib/analytics-page projections). Always from the course's today, not a chosen range. The
// revenue figure is an estimate from the ledger's last 30 days. Gated like the rest of Analytics; this course only.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'analytics.view'); if (denied) return denied; }
  const r = await projections(session.courseId);
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // The revenue estimate only with money.payments (the Revenue page's gate); players and fill for everyone.
  return NextResponse.json(can(session, 'money.payments') ? r : projectionsWithoutMoney(r), { headers: { 'Cache-Control': 'no-store' } });
}
