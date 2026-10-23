import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { operatorSearch } from '@/lib/operator-search';

// DASH-C: the course menu's search box (src/lib/operator-search.ts). Any login
// that sees the tee sheet finds bookings by name; email/phone matching needs
// sheet.golfer_contact; members need members.view.
export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.view'); if (denied) return denied; }
  const q = req.nextUrl.searchParams.get('q') || '';
  const results = await operatorSearch(session.courseId, q, { contact: can(session, 'sheet.golfer_contact'), members: can(session, 'members.view') });
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
