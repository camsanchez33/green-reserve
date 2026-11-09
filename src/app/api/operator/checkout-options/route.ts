import { NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { cartRuleOf } from '@/lib/cart-pricing';
import { cartNumberMode, cartTicketMode } from '@/lib/starter-sheet';

// CART-3: what checkout's Riding and Range balls rows need from the course — its cart rule and its range-ball buckets
// (Settings → Your course). Read-only; anyone who sees the sheet. The course is always the session's.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.view'); if (denied) return denied; }
  const c = await prisma.course.findUnique({
    where: { id: session.courseId },
    select: { cartPricing: true, cartNumbers: true, cartTicket: true, hasDrivingRange: true, rangeBallsFree: true, rangeBallsSmallPriceCents: true, rangeBallsMediumPriceCents: true, rangeBallsLargePriceCents: true },
  });
  if (!c) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  const prices = { small: c.rangeBallsSmallPriceCents, medium: c.rangeBallsMediumPriceCents, large: c.rangeBallsLargePriceCents };
  // A size is offered when it has a price, or every size when the range's balls are free.
  const sizes = (['small', 'medium', 'large'] as const).filter(k => c.rangeBallsFree || prices[k] > 0).map(k => ({ size: k, priceCents: c.rangeBallsFree ? 0 : prices[k] }));
  return NextResponse.json({ cartRule: cartRuleOf(c.cartPricing), range: c.hasDrivingRange ? sizes : [], cartNumbers: cartNumberMode(c.cartNumbers), cartTicket: cartTicketMode(c.cartTicket) }, { headers: { 'Cache-Control': 'no-store' } });
}
