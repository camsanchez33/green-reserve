// ALERTS-2: a logged-in member stops one of their own alerts (gr_member; checked against the
// session's course and email).
import { NextRequest, NextResponse } from 'next/server';
import { getMemberSession } from '@/lib/member-session';
import { stopMemberAlert } from '@/lib/tee-time-alerts';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getMemberSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const ok = await stopMemberAlert(id, session.courseId, session.email);
  if (!ok) return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
