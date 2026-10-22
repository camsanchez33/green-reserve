import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS } from '@/lib/admin-session';
import { FAILED_CHARGE_WHERE, openDisputes } from '@/lib/money-problems';
import { openProblemCount } from '@/lib/problems';
import { todayHealth } from '@/lib/admin-today';
import { hasArea, type AdminArea } from '@/lib/admin-areas';

// MP-8a: the sidebar's three badges in ONE fetch per page shell. Before this
// the rail fetched unread messages and money problems separately and never
// fetched pending inquiries at all — that badge only rendered when the
// Overview passed it as a prop, so leaving the Overview made pending
// inquiries vanish from the nav.
//
// Each count is the SAME predicate its page uses: inquiries = status
// 'pending' (stats route), messages = unread operator messages excluding
// announcements (messages route), money = failed charges (revenue route via
// lib/money-problems).
//
// A role below support+ gets zeros rather than a 403: the rail hides those
// doors anyway, and a red badge on a page you cannot open is a taunt.
export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, SUPPORT_PLUS)) {
    return NextResponse.json({ pendingInquiries: 0, unreadMessages: 0, moneyProblems: 0, openProblems: 0, systemsOk: null });
  }

  const now = new Date();
  const [pendingInquiries, unreadMessages, failed, disputes, problems, health] = await Promise.all([
    prisma.courseInquiry.count({ where: { status: 'pending' } }),
    prisma.message.count({ where: { senderType: 'operator', readAt: null, isBroadcast: false } }),
    prisma.booking.count({ where: FAILED_CHARGE_WHERE }),
    openDisputes(),
    // ADMIN-C: the Problems count and the top bar's one line (same rules as Home's health line).
    openProblemCount(now),
    todayHealth(now).catch(() => null),
  ]);
  const systemsOk = health ? health.jobs.bad.length === 0 && !health.stripeWebhook.lastError && (health.stripeWebhook.lastAt === null || health.stripeWebhook.ok) && health.payments.blocked === 0 : null;

  // MP-6b: an open chargeback is the reddest money problem there is.
  // AW-11: a count for an area this person can't open is 0, as for a role below support.
  const area = (a: AdminArea, n: number) => hasArea(session, a) ? n : 0;
  return NextResponse.json({
    pendingInquiries: area('pipeline', pendingInquiries), unreadMessages: area('messages', unreadMessages),
    moneyProblems: area('money', failed + disputes.length), openProblems: area('problems', problems.open), systemsOk,
  });
}
