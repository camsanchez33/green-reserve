import { NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { cartRuleOf } from '@/lib/cart-pricing';
import { cartNumberMode, cartTicketMode } from '@/lib/starter-sheet';
import { courseBuckets } from '@/lib/range-buckets';

// CART-3: what checkout's Riding and Range balls rows need from the course — its cart rule and (RANGE-1) its bucket
// list, the register's own (lib/range-buckets; Settings → Range), at $0 while balls come with a round. Read-only; anyone who sees the sheet. The course is always the session's.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.view'); if (denied) return denied; }
  const c = await prisma.course.findUnique({
    where: { id: session.courseId },
    select: { cartPricing: true, cartNumbers: true, cartTicket: true, hasDrivingRange: true, rangeBallsFree: true },
  });
  if (!c) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  const list = c.hasDrivingRange ? await courseBuckets(prisma, session.courseId) : [];
  const range = list.map(i => ({ id: i.id, name: i.name, balls: i.rangeBalls, priceCents: c.rangeBallsFree ? 0 : i.priceCents }));
  return NextResponse.json({ cartRule: cartRuleOf(c.cartPricing), range, cartNumbers: cartNumberMode(c.cartNumbers), cartTicket: cartTicketMode(c.cartTicket) }, { headers: { 'Cache-Control': 'no-store' } });
}
