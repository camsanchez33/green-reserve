import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { stockRows, receiveStock, setReorder, setCost, recentReceipts } from '@/lib/shop-stock';

// SHOP-4 (Cam 2026-10-30): the pro shop's stock — the counted items with their
// reorder points, low ones first, and the last deliveries. Reading needs shop.sell
// or shop.catalog; receiving a delivery and setting a reorder point need
// shop.catalog; cost is the owner's alone ("only the owner sees it"). This course only.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(session, 'shop.sell') && !can(session, 'shop.catalog')) { const denied = requirePermission(session, 'shop.sell'); if (denied) return denied; }
  const cost = !session.isStaff;
  const [rows, receipts] = await Promise.all([stockRows(session.courseId, { cost }), recentReceipts(session.courseId, { cost })]);
  return NextResponse.json({ rows, receipts, canEdit: can(session, 'shop.catalog'), canCost: cost }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { action?: string; itemId?: unknown; quantity?: unknown; unitCostCents?: unknown; note?: unknown; reorderAt?: unknown; costCents?: unknown };
  const itemId = typeof body.itemId === 'string' ? body.itemId : '';
  if (!itemId) return NextResponse.json({ error: 'Pick an item.' }, { status: 400 });
  if (body.action === 'cost') {
    if (session.isStaff) return NextResponse.json({ error: 'Only the course owner can see or set costs.' }, { status: 403 });
    const r = await setCost(session.courseId, itemId, body.costCents);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  { const denied = requirePermission(session, 'shop.catalog'); if (denied) return denied; }
  if (body.action === 'receive') {
    const r = await receiveStock(session.courseId, itemId, { quantity: body.quantity, unitCostCents: body.unitCostCents, note: body.note }, session.email, !session.isStaff);
    return r.ok ? NextResponse.json({ ok: true, stockCount: r.value.stockCount }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  if (body.action === 'reorder') {
    const r = await setReorder(session.courseId, itemId, body.reorderAt);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
