import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { readPack, listPacks, findHoldings } from '@/lib/round-packs';

// PRICE-3 (Cam 2026-10-30): the course's round packs. GET is for anyone who sells at the
// register, books walk-ins or edits the catalog: the packs, and with ?q= (or ?holders=1)
// who holds rounds — names, rounds left and when they end; the holder's email only with
// sheet.golfer_contact. Writes are catalog changes: shop.catalog and a current agreement.
// This course only.
export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(session, 'shop.sell') && !can(session, 'shop.catalog') && !can(session, 'sheet.walkin')) {
    const denied = requirePermission(session, 'shop.sell');
    if (denied) return denied;
  }
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80);
  const all = req.nextUrl.searchParams.get('holders') === '1';
  const contact = can(session, 'sheet.golfer_contact');
  const [packs, holders] = await Promise.all([
    listPacks(session.courseId),
    q.length >= 2 || all ? findHoldings(session.courseId, q, { all, byEmail: contact }) : Promise.resolve([]),
  ]);
  return NextResponse.json({
    packs: can(session, 'shop.catalog') ? packs : packs.filter(p => p.active),
    holders: holders.map(h => ({ ...h, holderEmail: contact ? h.holderEmail : '' })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

async function writeGate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'shop.catalog');
  if (denied) return { res: denied };
  const agreementBlock = await requireAgreementCurrent(session.courseId);
  if (agreementBlock) return { res: agreementBlock };
  return { session };
}

export async function POST(req: NextRequest) {
  const g = await writeGate();
  if ('res' in g) return g.res;
  const r = readPack(await req.json().catch(() => ({})) as Record<string, unknown>);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const made = await prisma.roundPack.create({ data: { ...r.data, courseId: g.session.courseId } });
  return NextResponse.json({ id: made.id });
}

// A pack already sold keeps the terms it was sold with (they are copied onto each sale line);
// an edit changes what is sold from now on. A pack is turned off, never deleted.
export async function PATCH(req: NextRequest) {
  const g = await writeGate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  const row = id ? await prisma.roundPack.findFirst({ where: { id, courseId: g.session.courseId }, select: { id: true } }) : null;
  if (!row) return NextResponse.json({ error: 'That pack is gone — refresh.' }, { status: 404 });
  if (typeof body.active === 'boolean' && body.name === undefined) {
    await prisma.roundPack.updateMany({ where: { id: row.id, courseId: g.session.courseId }, data: { active: body.active } });
    return NextResponse.json({ ok: true });
  }
  const r = readPack(body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const { active: _a, ...data } = r.data;
  await prisma.roundPack.updateMany({ where: { id: row.id, courseId: g.session.courseId }, data });
  return NextResponse.json({ ok: true });
}
