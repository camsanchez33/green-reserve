import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { operatorHome } from '@/lib/operator-home';
import { openShiftNotes, courseConditions, weekAhead, monthGoal } from '@/lib/home-board';

// DASH-C: the course Home page (src/lib/operator-home.ts). Any login that can
// see the tee sheet sees today's players and the next tee times; money needs
// money.payments, the unread count needs messages.use.
// DASH-D (Cam 2026-11-01): plus the board (lib/home-board) — the shift notes, the
// course conditions and the week ahead for every login; the month goal is money.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.view'); if (denied) return denied; }
  const money = can(session, 'money.payments');
  const tz = (await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true } }))?.timezone;
  const [home, notes, conditions, week, goal] = await Promise.all([
    operatorHome(session.courseId, { money, messages: can(session, 'messages.use'), setup: can(session, 'settings.edit'), owner: !session.isStaff }),
    openShiftNotes(session.courseId),
    courseConditions(session.courseId),
    weekAhead(session.courseId, tz),
    money ? monthGoal(session.courseId, tz) : Promise.resolve(null),
  ]);
  return NextResponse.json({ ...home, board: { notes, conditions, week, goal } }, { headers: { 'Cache-Control': 'no-store' } });
}
