import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, OWNER_ONLY } from '@/lib/admin-session';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

// Cache Stripe responses ~5min — this hits the platform Balance/Payouts/
// ApplicationFees APIs which carry their own rate limits, and this data
// doesn't need to be second-fresh for an owner glancing at the reconciliation.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { key: string; data: unknown; expires: number } | null = null;

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, OWNER_ONLY)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get('period') === '7d' ? '7d' : '30d';
  if (cache && cache.key === period && cache.expires > Date.now()) {
    return NextResponse.json(cache.data);
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - (period === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000);
  const windowStartUnix = Math.floor(windowStart.getTime() / 1000);
  const completedStatuses = ['confirmed', 'completed'];

  try {
    const [balance, payouts, feesPage, expectedAgg, bookingCount] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.payouts.list({ limit: 10 }),
      stripe.applicationFees.list({ created: { gte: windowStartUnix }, limit: 100 }),
      prisma.booking.aggregate({
        where: { status: { in: completedStatuses }, createdAt: { gte: windowStart } },
        _sum: { accessFeeTotal: true },
      }),
      prisma.booking.count({
        where: { status: { in: completedStatuses }, createdAt: { gte: windowStart } },
      }),
    ]);

    // Page through application fees beyond the first 100 (bounded — this window
    // is at most 30 days, guard is just a safety net against a runaway loop).
    let fees = feesPage.data;
    let hasMore = feesPage.has_more;
    let guard = 0;
    while (hasMore && guard < 10) {
      const startingAfter = fees[fees.length - 1]?.id;
      const next = await stripe.applicationFees.list({ created: { gte: windowStartUnix }, limit: 100, starting_after: startingAfter });
      fees = fees.concat(next.data);
      hasMore = next.has_more;
      guard++;
    }

    const netApplicationFeeCents = fees.reduce((sum, f) => sum + (f.amount - (f.amount_refunded ?? 0)), 0);
    const availableCents = balance.available.reduce((s, b) => s + b.amount, 0);
    const pendingCents = balance.pending.reduce((s, b) => s + b.amount, 0);
    const currency = balance.available[0]?.currency ?? 'usd';

    const upcomingPayout = payouts.data
      .filter(p => p.status === 'pending' || p.status === 'in_transit')
      .sort((a, b) => a.arrival_date - b.arrival_date)[0] ?? null;

    const expectedCents = expectedAgg._sum.accessFeeTotal ?? 0;
    const deltaCents = expectedCents - netApplicationFeeCents;
    const matches = Math.abs(deltaCents) < 100; // within $1 — rounding/timing at period edges

    const data = {
      balance: { available: availableCents / 100, pending: pendingCents / 100, currency },
      nextPayout: upcomingPayout ? {
        amount: upcomingPayout.amount / 100,
        arrivalDate: new Date(upcomingPayout.arrival_date * 1000).toISOString().split('T')[0],
        status: upcomingPayout.status,
      } : null,
      applicationFees: { amount: netApplicationFeeCents / 100, count: fees.length },
      reconciliation: {
        expected: expectedCents / 100,
        actual: netApplicationFeeCents / 100,
        delta: deltaCents / 100,
        matches,
        bookingCount,
        message: matches
          ? 'GreenReserve fees match what Stripe reports for this period.'
          : `Expected $${(expectedCents / 100).toFixed(2)}, Stripe shows $${(netApplicationFeeCents / 100).toFixed(2)} — investigate ${bookingCount} booking${bookingCount !== 1 ? 's' : ''} from this period.`,
      },
      period,
      fetchedAt: now.toISOString(),
    };

    cache = { key: period, data, expires: Date.now() + CACHE_TTL_MS };
    return NextResponse.json(data);
  } catch (err) {
    console.error('Platform Stripe fetch error:', err);
    return NextResponse.json({ error: 'Could not reach Stripe. Try again shortly.' }, { status: 502 });
  }
}
