import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { validItemInput } from '@/lib/shop';

// POS-1a (PLATFORM_ROADMAP_SPEC §4): the course's pro-shop catalog. GET is for
// anyone who can sell from the sheet or edit the catalog; writes need
// shop.catalog and a current agreement (it is course configuration).

const SELECT = { id: true, name: true, category: true, priceCents: true, active: true, sortOrder: true, stockCount: true } as const;

/** POS-2: stock is optional — absent leaves it, null/'' stops counting, else a whole number 0..100000. */
function stockFrom(body: { stockCount?: unknown }): { stockCount?: number | null } | string {
  if (!('stockCount' in body) || body.stockCount === undefined) return {};
  if (body.stockCount === null || body.stockCount === '') return { stockCount: null };
  const n = Number(body.stockCount);
  if (!Number.isInteger(n) || n < 0 || n > 100000) return 'Stock must be a whole number from 0 to 100,000, or blank to not count it.';
  return { stockCount: n };
}

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(session, 'shop.sell') && !can(session, 'shop.catalog')) {
    const denied = requirePermission(session, 'shop.sell');
    if (denied) return denied;
  }
  const items = await prisma.shopItem.findMany({
    where: { courseId: session.courseId },
    orderBy: [{ active: 'desc' }, { category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    select: SELECT,
  });
  return NextResponse.json({ items });
}

async function writeGate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'shop.catalog');
  if (denied) return { res: denied };
  const agreementBlock = await requireAgreementCurrent(session.courseId); // AG-3 §3
  if (agreementBlock) return { res: agreementBlock };
  return { session };
}

export async function POST(req: NextRequest) {
  const g = await writeGate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({}));
  const v = validItemInput(body);
  if (typeof v === 'string') return NextResponse.json({ error: v }, { status: 400 });
  const stock = stockFrom(body);
  if (typeof stock === 'string') return NextResponse.json({ error: stock }, { status: 400 });
  const item = await prisma.shopItem.create({ data: { courseId: g.session.courseId, ...v, ...stock }, select: SELECT });
  return NextResponse.json({ item });
}

export async function PATCH(req: NextRequest) {
  const g = await writeGate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as { id?: unknown; active?: unknown; name?: unknown; category?: unknown; priceCents?: unknown; stockCount?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  // Tenant isolation: never trust a bare id from the client.
  const existing = id ? await prisma.shopItem.findUnique({ where: { id } }) : null;
  if (!existing || existing.courseId !== g.session.courseId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Hiding/showing only, or a full edit. A price change never reaches a sale
  // already on a booking — those lines carry their own copied price.
  const stock = stockFrom(body);
  if (typeof stock === 'string') return NextResponse.json({ error: stock }, { status: 400 });
  if (body.name === undefined && (typeof body.active === 'boolean' || 'stockCount' in stock)) {
    // Hide/show or a stock count on its own.
    const item = await prisma.shopItem.update({ where: { id }, data: { ...(typeof body.active === 'boolean' ? { active: body.active } : {}), ...stock }, select: SELECT });
    return NextResponse.json({ item });
  }
  const v = validItemInput(body);
  if (typeof v === 'string') return NextResponse.json({ error: v }, { status: 400 });
  const item = await prisma.shopItem.update({ where: { id }, data: { ...v, ...stock, ...(typeof body.active === 'boolean' ? { active: body.active } : {}) }, select: SELECT });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const g = await writeGate();
  if ('res' in g) return g.res;
  const { id } = await req.json().catch(() => ({ id: '' })) as { id?: string };
  const existing = id ? await prisma.shopItem.findUnique({ where: { id }, select: { courseId: true, _count: { select: { sales: true, saleLines: true } } } }) : null;
  if (!existing || existing.courseId !== g.session.courseId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // An item that was ever sold (on a round or walk-up) is hidden, not deleted —
  // past receipts keep their own copy of the name either way, but the sale history keeps its link.
  if (existing._count.sales > 0 || existing._count.saleLines > 0) {
    await prisma.shopItem.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ success: true, hidden: true });
  }
  await prisma.shopItem.delete({ where: { id } });
  return NextResponse.json({ success: true, hidden: false });
}
