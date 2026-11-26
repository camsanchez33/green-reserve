import { NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, SUPPORT_PLUS, areaGate } from '@/lib/admin-session';
import { listProblems } from '@/lib/problems';
import { hasArea } from '@/lib/admin-areas';

// BRAIN-2a: the problems list. GET: open, snoozed, cleared (support+ with the
// Problems area — they name golfers and money). Read-only: the list lives in
// Overview's Needs attention, with no take, assign, note or snooze (Cam
// 2026-11-12), so the old PATCH is gone. Nothing clears a problem by hand:
// only the hourly check does, when it stops seeing it.

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  const noArea = areaGate(session, 'problems');
  if (noArea) return noArea;
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Problems are for support and above.' }, { status: 403 });
  // M10 / MONEY-VIEW-1: a declined card is Money's; without it those problems are left out.
  return NextResponse.json(await listProblems(new Date(), { money: hasArea(session, 'money') }));
}
