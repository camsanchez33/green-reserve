import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { createItems, updateItem, setItemActive, deleteItem, ITEM_SELECT } from '@/lib/shop-catalog';

// POS-1a (PLATFORM_ROADMAP_SPEC §4): the course's pro-shop catalog. GET is for
// anyone who can sell from the sheet or edit the catalog; writes need
// shop.catalog and a current agreement (it is course configuration).


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
    orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }, { sortOrder: 'asc' }],
    select: ITEM_SELECT,
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
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  // W2-7: one item (with any options), or many at once — a paste, a CSV or the AI's rows.
  const r = await createItems(g.session.courseId, Array.isArray(body.items) ? body.items : [body]);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}

export async function PATCH(req: NextRequest) {
  const g = await writeGate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const stock = stockFrom(body);
  if (typeof stock === 'string') return NextResponse.json({ error: stock }, { status: 400 });
  if (body.name === undefined) {
    // Hide/show and/or a shelf count on one row. Tenant isolation: this course's rows only.
    const row = await prisma.shopItem.findFirst({ where: { id, courseId: g.session.courseId }, select: { _count: { select: { options: true } } } });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (typeof body.active !== 'boolean' && !('stockCount' in stock)) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    if ('stockCount' in stock && row._count.options > 0) return NextResponse.json({ error: 'Count stock on each option, not on the item.' }, { status: 400 });
    if (typeof body.active === 'boolean') await setItemActive(g.session.courseId, id, body.active);
    if ('stockCount' in stock) await prisma.shopItem.updateMany({ where: { id, courseId: g.session.courseId }, data: { stockCount: stock.stockCount } });
    return NextResponse.json({ ok: true });
  }
  // A full edit — a price change never reaches a sale already made; those lines carry their own copied price.
  const r = await updateItem(g.session.courseId, id, body);
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}

export async function DELETE(req: NextRequest) {
  const g = await writeGate();
  if ('res' in g) return g.res;
  const { id } = await req.json().catch(() => ({ id: '' })) as { id?: string };
  // An item that was ever sold (on a round or walk-up) is hidden, not deleted —
  // past receipts keep their own copy of the name either way, but the sale history keeps its link.
  const r = typeof id === 'string' && id ? await deleteItem(g.session.courseId, id) : null;
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, hidden: r.hidden });
}
