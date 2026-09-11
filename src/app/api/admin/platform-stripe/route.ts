import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireOwner, ownerGateError } from '@/lib/admin-session';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { fetchStripeFeeWindow } from '@/lib/platform-stripe';

// Cache Stripe responses ~5min — this hits the platform Balance/Payouts/
// ApplicationFees APIs which carry their own rate limits, and this data
// doesn't need to be second-fresh for an owner glancing at the reconciliation.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { key: string; data: unknown; expires: number } | null = null;

// MP-6c: this card fetched the payout list and threw it away, and computed
// "expected" on the accrual basis MP-6a retired (confirmed bookings by
// createdAt), so it disagreed with the Revenue page above it. Now: payout
// history ("money that reached the bank"), unit economics (what one collected
// fee actually nets after Stripe's fixed component), and reconciliation on
// the same collected basis as the P&L.
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) {
    return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get('period') === '7d' ? '7d' : '30d';
  if (cache && cache.key === period && cache.expires > Date.now()) {
    return NextResponse.json(cache.data);
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - (period === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000);
  const windowStartUnix = Math.floor(windowStart.getTime() / 1000);
  const nowUnix = Math.floor(now.getTime() / 1000);

  try {
    const [balance, payouts, feeWin, collectedAgg] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.payouts.list({ limit: 12 }),
      fetchStripeFeeWindow(windowStartUnix, nowUnix),
      // Collected basis, same as /api/admin/revenue: paid rounds placed by check-in.
      prisma.booking.aggregate({
        where: { paymentStatus: { in: ['paid', 'refunded'] }, roundPaymentIntentId: { not: '' }, checkedInAt: { gte: windowStart } },
        _sum: { accessFeeTotal: true, players: true }, _count: { id: true },
      }),
    ]);

    const availableCents = balance.available.reduce((s, b) => s + b.amount, 0);
    const pendingCents = balance.pending.reduce((s, b) => s + b.amount, 0);
    const currency = balance.available[0]?.currency ?? 'usd';

    const payoutRows = payouts.data
      .slice()
      .sort((a, b) => b.arrival_date - a.arrival_date)
      .map(p => ({
        id: p.id, amount: p.amount / 100, status: p.status,
        arrivalDate: new Date(p.arrival_date * 1000).toISOString().split('T')[0],
        created: new Date(p.created * 1000).toISOString(),
        automatic: p.automatic,
      }));
    const upcomingPayout = payoutRows.filter(p => p.status === 'pending' || p.status === 'in_transit').sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate))[0] ?? null;
    const paidOut = payoutRows.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);

    // Unit economics: what one collected round nets GreenReserve. The $1.50 is
    // per PLAYER; Stripe's cut of an application fee has a fixed component, so
    // a 1-player and a 4-player round have very different margins. Numbers
    // come from Stripe's own balance transactions, not from our expectation.
    const charges = feeWin.count;
    const grossPerCharge = charges ? feeWin.grossCents / charges : 0;
    const costPerCharge = charges ? feeWin.processingCostCents / charges : 0;
    const takeRate = feeWin.grossCents ? feeWin.netCents / feeWin.grossCents : null;
    const playersCollected = collectedAgg._sum.players ?? 0;
    const roundsCollected = collectedAgg._count.id;

    const expectedCents = collectedAgg._sum.accessFeeTotal ?? 0;
    const deltaCents = expectedCents - feeWin.grossCents;
    const matches = Math.abs(deltaCents) < 100; // within $1 — timing at period edges

    const data = {
      balance: { available: availableCents / 100, pending: pendingCents / 100, currency },
      nextPayout: upcomingPayout ? { amount: upcomingPayout.amount, arrivalDate: upcomingPayout.arrivalDate, status: upcomingPayout.status } : null,
      payouts: payoutRows,
      paidOutRecent: paidOut,
      applicationFees: { amount: feeWin.grossCents / 100, count: charges },
      unitEconomics: {
        charges, roundsCollected, playersCollected,
        avgPlayersPerRound: roundsCollected ? playersCollected / roundsCollected : null,
        grossFeePerCharge: grossPerCharge / 100,
        stripeCostPerCharge: costPerCharge / 100,
        netFeePerCharge: (grossPerCharge - costPerCharge) / 100,
        takeRate, // net ÷ gross of GreenReserve's own fee, after Stripe
        stripeCostTotal: feeWin.processingCostCents / 100,
        netTotal: feeWin.netCents / 100,
      },
      reconciliation: {
        basis: 'collected',
        expected: expectedCents / 100,
        actual: feeWin.grossCents / 100,
        delta: deltaCents / 100,
        matches,
        bookingCount: roundsCollected,
        message: matches
          ? 'GreenReserve fees collected match what Stripe reports for this period.'
          : `Collected $${(expectedCents / 100).toFixed(2)} in fees, Stripe shows $${(feeWin.grossCents / 100).toFixed(2)} — ${Math.abs(deltaCents) / 100 > 5 ? 'investigate' : 'likely timing at the period edge'} (${roundsCollected} round${roundsCollected !== 1 ? 's' : ''}).`,
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
