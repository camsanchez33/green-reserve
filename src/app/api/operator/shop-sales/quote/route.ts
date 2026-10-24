import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { quoteSale, hasDiscount } from '@/lib/shop-sales';

// W2-7 part B: what a walk-up sale comes to with sales tax, shown at the
// counter before cash changes hands. Writes nothing; the sale reuses this
// quote when it still matches (lib/sales-tax reuseShopTaxQuote).
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'shop.sell'); if (denied) return denied; }
  if (!(await rateLimit(`shop-quote:${session.courseId}`, 600, 3600))) return NextResponse.json({ error: 'Too many totals this hour — wait a minute.' }, { status: 429 });
  const body = await req.json().catch(() => ({})) as { lines?: unknown; discount?: { percent?: unknown; amountCents?: unknown; note?: unknown } };
  // POS-3: a discount is the shop.discount power, even just to see the total with it.
  if (hasDiscount(body.discount)) { const denied = requirePermission(session, 'shop.discount'); if (denied) return denied; }
  const r = await quoteSale(session.courseId, body.lines, body.discount);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.value);
}
