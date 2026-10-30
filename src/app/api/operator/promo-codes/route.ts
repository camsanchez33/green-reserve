import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { readPromo, listPromos } from '@/lib/promo-codes';

// PRICE-1 (Cam 2026-10-30): the course's promo codes, on the Schedule page beside its
// prices. Reading needs schedule.view, making and changing a code schedule.edit, like
// the prices themselves. A code that has been used is never deleted — it is turned off.
// This course only.
async function gate(key: 'schedule.view' | 'schedule.edit') {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, key);
  return denied ? { res: denied } : { session };
}

export async function GET() {
  const g = await gate('schedule.view');
  if ('res' in g) return g.res;
  return NextResponse.json({ codes: await listPromos(g.session.courseId) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const g = await gate('schedule.edit');
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const r = readPromo(body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const taken = await prisma.promoCode.findUnique({ where: { courseId_code: { courseId: g.session.courseId, code: r.data.code } }, select: { id: true } });
  if (taken) return NextResponse.json({ error: `You already have a code ${r.data.code}.` }, { status: 409 });
  const made = await prisma.promoCode.create({ data: { ...r.data, courseId: g.session.courseId, createdBy: g.session.email } });
  return NextResponse.json({ id: made.id });
}

export async function PATCH(req: NextRequest) {
  const g = await gate('schedule.edit');
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  const row = id ? await prisma.promoCode.findFirst({ where: { id, courseId: g.session.courseId }, select: { id: true, code: true } }) : null;
  if (!row) return NextResponse.json({ error: 'That code is gone — refresh.' }, { status: 404 });
  // Turning a code on or off.
  if (typeof body.active === 'boolean' && body.code === undefined) {
    await prisma.promoCode.updateMany({ where: { id: row.id, courseId: g.session.courseId }, data: { active: body.active } });
    return NextResponse.json({ ok: true });
  }
  // A full edit. The code's text stays as it was (golfers may already have it).
  const r = readPromo({ ...body, code: row.code });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const { code: _c, ...data } = r.data;
  await prisma.promoCode.updateMany({ where: { id: row.id, courseId: g.session.courseId }, data });
  return NextResponse.json({ ok: true });
}
