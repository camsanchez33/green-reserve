import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';

// Money rework (Cam 2026-10-19: "a little table … that shows the payouts they
// have taken so we don't need to send them to Stripe for everything"). Read-only:
// the course's own connected account, its balance and its latest payouts.
// Amounts are Stripe's, in cents. Gated by the Payouts permission.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'money.payouts'); if (denied) return denied; }

  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { stripeAccountId: true, stripeAccountActive: true } });
  if (!course?.stripeAccountId || !course.stripeAccountActive) return NextResponse.json({ connected: false, payouts: [], balance: null });

  const opts = { stripeAccount: course.stripeAccountId };
  try {
    const [list, balance] = await Promise.all([
      stripe.payouts.list({ limit: 24 }, opts),
      stripe.balance.retrieve({}, opts),
    ]);
    const sum = (rows: { amount: number; currency: string }[]) => rows.filter(r => r.currency === 'usd').reduce((s, r) => s + r.amount, 0);
    const payouts = list.data.map(p => ({
      id: p.id, amountCents: p.amount, currency: p.currency, status: p.status,
      createdAt: new Date(p.created * 1000).toISOString(), arrivalDate: new Date(p.arrival_date * 1000).toISOString(),
      failureMessage: p.failure_message ?? null,
    }));
    // The next one to land: the soonest payout still on its way.
    const next = payouts.filter(p => p.status === 'pending' || p.status === 'in_transit').sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate))[0] ?? null;
    return NextResponse.json({
      connected: true, payouts, next,
      balance: { availableCents: sum(balance.available), pendingCents: sum(balance.pending) },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('Stripe payouts list failed:', err);
    return NextResponse.json({ error: 'Could not load your payouts from Stripe. Try again in a minute.' }, { status: 502 });
  }
}
