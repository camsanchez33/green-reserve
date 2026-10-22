import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, ownerGateError } from '@/lib/admin-session';
import { fetchStripeFeeWindow } from '@/lib/platform-stripe';
import { lastFullMonths, matchResult } from '@/lib/stripe-match';

// ADMIN-C Money → Disputes: the last three complete months, our recorded fees
// against Stripe's. Owner only, like the period reconciliation. A month Stripe
// doesn't answer for says so — it is never shown as a match.
const PAID = { paymentStatus: 'paid', roundPaymentIntentId: { not: '' } } as const;

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const months = lastFullMonths(new Date(), 3);
  const rows = await Promise.all(months.map(async m => {
    const [ours, stripe] = await Promise.all([
      prisma.booking.aggregate({ where: { ...PAID, paidAt: { gte: m.start, lt: m.end } }, _sum: { accessFeeTotal: true } }),
      fetchStripeFeeWindow(Math.floor(m.start.getTime() / 1000), Math.floor(m.end.getTime() / 1000))
        .then(w => w.grossCents)
        .catch(e => { console.error('[stripe-match] Stripe fetch failed', e); return null; }),
    ]);
    const ourCents = ours._sum.accessFeeTotal ?? 0;
    return { month: m.label, ours: ourCents / 100, stripe: stripe === null ? null : stripe / 100, result: matchResult(ourCents, stripe) };
  }));
  return NextResponse.json({ months: rows });
}
