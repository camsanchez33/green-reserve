import { NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { operatorHome } from '@/lib/operator-home';

// DASH-C: the course Home page (src/lib/operator-home.ts). Any login that can
// see the tee sheet sees today's players and the next tee times; money needs
// money.payments, the unread count needs messages.use.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.view'); if (denied) return denied; }
  const home = await operatorHome(session.courseId, { money: can(session, 'money.payments'), messages: can(session, 'messages.use') });
  return NextResponse.json(home, { headers: { 'Cache-Control': 'no-store' } });
}
