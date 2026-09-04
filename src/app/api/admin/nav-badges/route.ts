import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, SUPPORT_PLUS } from '@/lib/admin-session';
import { FAILED_CHARGE_WHERE } from '@/lib/money-problems';

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
    return NextResponse.json({ pendingInquiries: 0, unreadMessages: 0, moneyProblems: 0 });
  }

  const [pendingInquiries, unreadMessages, moneyProblems] = await Promise.all([
    prisma.courseInquiry.count({ where: { status: 'pending' } }),
    prisma.message.count({ where: { senderType: 'operator', readAt: null, isBroadcast: false } }),
    prisma.booking.count({ where: FAILED_CHARGE_WHERE }),
  ]);

  return NextResponse.json({ pendingInquiries, unreadMessages, moneyProblems });
}
