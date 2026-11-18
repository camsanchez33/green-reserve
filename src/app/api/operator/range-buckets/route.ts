import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { validItemInput } from '@/lib/shop';
import { courseBuckets, MAX_BUCKET_BALLS } from '@/lib/range-buckets';

// RANGE-1 (Cam 2026-11-17: "the course names its own buckets: any number, each with a name, ball count and price").
// The course's ONE bucket list: pro-shop items with rangeBalls set, in the "Range" category, so the register sells
// them like any item and every other place reads the same price (lib/range-buckets). Editing the list is editing the
// catalog (shop.catalog, a current agreement). A bucket is never deleted, only hidden, so past sales keep their link.

const MAX_LIST = 30;
const CATEGORY = 'Range';

function ballsOf(v: unknown): number | string {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_BUCKET_BALLS ? n : `Balls must be a whole number from 1 to ${MAX_BUCKET_BALLS.toLocaleString()}.`;
}

async function gate(write: boolean) {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  // Reading the list: anyone who edits the catalog or the course's settings (the section sits in Settings).
  if (write || !can(session, 'settings.edit')) {
    const denied = requirePermission(session, 'shop.catalog');
    if (denied) return { res: denied };
  }
  if (write) {
    const block = await requireAgreementCurrent(session.courseId); // AG-3 §3
    if (block) return { res: block };
  }
  return { session };
}

export async function GET() {
  const g = await gate(false);
  if ('res' in g) return g.res;
  const [buckets, course] = await Promise.all([
    courseBuckets(prisma, g.session.courseId, false),
    prisma.course.findUnique({ where: { id: g.session.courseId }, select: { hasDrivingRange: true, rangeBallsFree: true, sellRangeOnline: true } }),
  ]);
  if (!course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  return NextResponse.json({ buckets, ...course, ownerLogin: !g.session.isStaff }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const g = await gate(true);
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const v = validItemInput({ name: body.name, priceCents: body.priceCents });
  if (typeof v === 'string') return NextResponse.json({ error: v }, { status: 400 });
  const balls = ballsOf(body.balls);
  if (typeof balls === 'string') return NextResponse.json({ error: balls }, { status: 400 });
  const courseId = g.session.courseId;
  const count = await prisma.shopItem.count({ where: { courseId, rangeBalls: { not: null }, parentId: null } });
  if (count >= MAX_LIST) return NextResponse.json({ error: `Up to ${MAX_LIST} buckets — hide one you no longer sell first.` }, { status: 400 });
  const item = await prisma.shopItem.create({
    data: { courseId, name: v.name, category: CATEGORY, priceCents: v.priceCents, rangeBalls: balls, sortOrder: count },
    select: { id: true, name: true, rangeBalls: true, priceCents: true, active: true },
  });
  return NextResponse.json({ bucket: item });
}

export async function PATCH(req: NextRequest) {
  const g = await gate(true);
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  // Tenant isolation: only this course's buckets; another course's id reads as missing.
  const row = id ? await prisma.shopItem.findFirst({ where: { id, courseId: g.session.courseId, rangeBalls: { not: null }, parentId: null }, select: { name: true, priceCents: true, rangeBalls: true } }) : null;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const data: { name?: string; priceCents?: number; rangeBalls?: number; active?: boolean } = {};
  if (body.name !== undefined || body.priceCents !== undefined) {
    // A price change reaches only what is sold from now on: bookings and sales keep their own copied price.
    const v = validItemInput({ name: body.name ?? row.name, priceCents: body.priceCents ?? row.priceCents });
    if (typeof v === 'string') return NextResponse.json({ error: v }, { status: 400 });
    data.name = v.name; data.priceCents = v.priceCents;
  }
  if (body.balls !== undefined) {
    const balls = ballsOf(body.balls);
    if (typeof balls === 'string') return NextResponse.json({ error: balls }, { status: 400 });
    data.rangeBalls = balls;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    data.active = body.active;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  const bucket = await prisma.shopItem.update({ where: { id }, data, select: { id: true, name: true, rangeBalls: true, priceCents: true, active: true } });
  return NextResponse.json({ bucket });
}
