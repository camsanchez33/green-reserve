import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS } from '@/lib/admin-session';
import { FAILED_CHARGE_WHERE, openDisputes } from '@/lib/money-problems';
import { ON_REAL_COURSE } from '@/lib/real-courses';
import { openProblemCount } from '@/lib/problems';
import { unansweredChatCount } from '@/lib/support-chats';
import { todayHealth } from '@/lib/admin-today';
import { hasArea, type AdminArea } from '@/lib/admin-areas';

// MP-8a: the sidebar's three badges in ONE fetch per page shell. Before this
// the rail fetched unread messages and money problems separately and never
// fetched pending inquiries at all — that badge only rendered when the
// Overview passed it as a prop, so leaving the Overview made pending
// inquiries vanish from the nav.
//
// Each count is the SAME predicate its page uses: inquiries = status
// 'pending' (stats route), course support = chats not answered (the course
// wrote last; Course support's red dot, lib/support-chats), money = failed
// charges (revenue route via lib/money-problems), problems = every problem not
// yet cleared (Overview's Needs attention).
//
// A role below support+ gets zeros rather than a 403: the rail hides those
// doors anyway, and a red badge on a page you cannot open is a taunt.
export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, SUPPORT_PLUS)) {
    return NextResponse.json({ pendingInquiries: 0, unansweredChats: 0, moneyProblems: 0, openProblems: 0, systemsOk: null });
  }

  const now = new Date();
  const [pendingInquiries, unansweredChats, failed, disputes, problems, health] = await Promise.all([
    prisma.courseInquiry.count({ where: { status: 'pending' } }),
    // A chat is a conversation to answer, not a platform number: the test course's too (same as Course support).
    unansweredChatCount(),
    prisma.booking.count({ where: { ...FAILED_CHARGE_WHERE, ...ON_REAL_COURSE } }),
    openDisputes(),
    // ADMIN-C: the Problems count and the top bar's one line (same rules as Home's health line).
    openProblemCount(),
    todayHealth(now).catch(() => null),
  ]);
  const systemsOk = health ? health.jobs.bad.length === 0 && !health.stripeWebhook.lastError && (health.stripeWebhook.lastAt === null || health.stripeWebhook.ok) && health.payments.blocked === 0 : null;

  // MP-6b: an open chargeback is the reddest money problem there is.
  // AW-11: a count for an area this person can't open is 0, as for a role below support.
  const area = (a: AdminArea, n: number) => hasArea(session, a) ? n : 0;
  return NextResponse.json({
    pendingInquiries: area('pipeline', pendingInquiries), unansweredChats: area('messages', unansweredChats),
    moneyProblems: area('money', failed + disputes.length), openProblems: area('problems', problems.open),
    // The top bar's systems line links to Systems (Company) — without it, no line.
    systemsOk: hasArea(session, 'company') ? systemsOk : null,
  });
}
