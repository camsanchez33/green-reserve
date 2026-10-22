import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, ownerGateError } from '@/lib/admin-session';
import { stripe } from '@/lib/stripe';

// ADMIN-C Money → Payouts: what each course's own Stripe account has paid out
// to its bank, and whether Stripe is holding its payouts — the answer to a
// course asking "where's my money". Read-only, owner only (other businesses'
// bank activity). One course failing to answer never hides the others.
const DAY = 86_400_000;

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const courses = await prisma.course.findMany({
    where: { archivedAt: null, stripeAccountId: { not: '' } },
    select: { id: true, name: true, stripeAccountId: true },
    orderBy: { name: 'asc' },
  });
  const since = Math.floor((Date.now() - 30 * DAY) / 1000);
  const rows = await Promise.all(courses.map(async c => {
    try {
      const opts = { stripeAccount: c.stripeAccountId };
      const [account, payouts] = await Promise.all([
        stripe.accounts.retrieve(c.stripeAccountId),
        // 90 days back covers "last paid" for a course on weekly payouts and every payout in the 30-day sum.
        stripe.payouts.list({ limit: 100, arrival_date: { gte: since - 60 * 86_400 } }, opts),
      ]);
      const day = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
      const paid = payouts.data.filter(p => p.status === 'paid').sort((a, b) => b.arrival_date - a.arrival_date);
      const next = payouts.data.filter(p => p.status === 'pending' || p.status === 'in_transit').sort((a, b) => a.arrival_date - b.arrival_date)[0];
      const due = account.requirements?.currently_due?.length ?? 0;
      return {
        courseId: c.id, name: c.name, error: null as string | null,
        payoutsEnabled: !!account.payouts_enabled,
        needsInfo: due > 0 || !!account.requirements?.disabled_reason,
        lastPaid: paid[0] ? { date: day(paid[0].arrival_date), amount: paid[0].amount / 100 } : null,
        next: next ? { date: day(next.arrival_date), amount: next.amount / 100, status: next.status } : null,
        paidOut30: paid.filter(p => p.arrival_date >= since).reduce((s, p) => s + p.amount, 0) / 100,
      };
    } catch (e) {
      console.error('[course-payouts] Stripe fetch failed for', c.id, e);
      return { courseId: c.id, name: c.name, error: 'Stripe didn’t answer for this course.', payoutsEnabled: false, needsInfo: false, lastPaid: null, next: null, paidOut30: 0 };
    }
  }));
  return NextResponse.json({ courses: rows, withoutStripe: await prisma.course.count({ where: { archivedAt: null, stripeAccountId: '' } }) });
}
