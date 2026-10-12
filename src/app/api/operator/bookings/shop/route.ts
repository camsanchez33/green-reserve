import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { addItemToBooking, removeLineFromBooking, shopLinesFor } from '@/lib/shop';

// POS-1a: add pro-shop items to a group's booking from the tee sheet panel, or
// take one off. They are charged with the round (check-in or the pay link) with
// GreenReserve's $0.50 per sale. Like check-in, this is a counter action, not
// course configuration, so it keeps working past an agreement deadline.

async function gate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'shop.sell');
  if (denied) return { res: denied };
  return { session };
}

async function respond(bookingId: string, r: Awaited<ReturnType<typeof addItemToBooking>>) {
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ success: true, shopTotalCents: r.shopTotalCents, shopFeeCents: r.shopFeeCents, lines: await shopLinesFor(bookingId) });
}

export async function POST(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as { bookingId?: unknown; shopItemId?: unknown; quantity?: unknown };
  const bookingId = typeof body.bookingId === 'string' ? body.bookingId : '';
  const shopItemId = typeof body.shopItemId === 'string' ? body.shopItemId : '';
  if (!bookingId || !shopItemId) return NextResponse.json({ error: 'Pick an item.' }, { status: 400 });
  const quantity = body.quantity == null ? 1 : Number(body.quantity);
  return respond(bookingId, await addItemToBooking(g.session.courseId, bookingId, shopItemId, quantity, g.session.email));
}

export async function DELETE(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as { bookingId?: unknown; lineId?: unknown };
  const bookingId = typeof body.bookingId === 'string' ? body.bookingId : '';
  const lineId = typeof body.lineId === 'string' ? body.lineId : '';
  if (!bookingId || !lineId) return NextResponse.json({ error: 'Missing booking or item.' }, { status: 400 });
  return respond(bookingId, await removeLineFromBooking(g.session.courseId, bookingId, lineId));
}
