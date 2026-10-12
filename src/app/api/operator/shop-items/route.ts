import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { validItemInput } from '@/lib/shop';

// POS-1a (PLATFORM_ROADMAP_SPEC §4): the course's pro-shop catalog. GET is for
// anyone who can sell from the sheet or edit the catalog; writes need
// shop.catalog and a current agreement (it is course configuration).

const SELECT = { id: true, name: true, category: true, priceCents: true, active: true, sortOrder: true } as const;

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
  const item = await prisma.shopItem.create({ data: { courseId: g.session.courseId, ...v }, select: SELECT });
  return NextResponse.json({ item });
}

export async function PATCH(req: NextRequest) {
  const g = await writeGate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as { id?: unknown; active?: unknown; name?: unknown; category?: unknown; priceCents?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  // Tenant isolation: never trust a bare id from the client.
  const existing = id ? await prisma.shopItem.findUnique({ where: { id } }) : null;
  if (!existing || existing.courseId !== g.session.courseId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Hiding/showing only, or a full edit. A price change never reaches a sale
  // already on a booking — those lines carry their own copied price.
  if (typeof body.active === 'boolean' && body.name === undefined) {
    const item = await prisma.shopItem.update({ where: { id }, data: { active: body.active }, select: SELECT });
    return NextResponse.json({ item });
  }
  const v = validItemInput(body);
  if (typeof v === 'string') return NextResponse.json({ error: v }, { status: 400 });
  const item = await prisma.shopItem.update({ where: { id }, data: { ...v, ...(typeof body.active === 'boolean' ? { active: body.active } : {}) }, select: SELECT });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const g = await writeGate();
  if ('res' in g) return g.res;
  const { id } = await req.json().catch(() => ({ id: '' })) as { id?: string };
  const existing = id ? await prisma.shopItem.findUnique({ where: { id }, select: { courseId: true, _count: { select: { sales: true } } } }) : null;
  if (!existing || existing.courseId !== g.session.courseId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // An item that was ever sold is hidden, not deleted — past receipts keep
  // their own copy of the name either way, but the sale history keeps its link.
  if (existing._count.sales > 0) {
    await prisma.shopItem.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ success: true, hidden: true });
  }
  await prisma.shopItem.delete({ where: { id } });
  return NextResponse.json({ success: true, hidden: false });
}
