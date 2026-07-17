import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

// nineYardages/productRatings included for the Course & Layout tab (L1) —
// onboarding's GET consumer (dashboard/onboarding/page.tsx) only destructures
// id/name/yardage/rating/slope and ignores the rest, so this is additive.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const teeSets = await prisma.teeSet.findMany({
    where: { courseId: session.courseId },
    orderBy: { sortOrder: 'asc' },
    include: { nineYardages: true, productRatings: true },
  });
  return NextResponse.json(teeSets);
}

type NineYardageInput = { nineId: string; yardage: number };
type ProductRatingInput = { courseProductId: string; rating: number; slope: number };

// Small lists (a handful of nines/products per course) — delete-and-recreate
// on every save is simpler and safer than diffing, and avoids ever leaving a
// stale row behind if the operator removes a nine/product from a tee set.
async function replaceNineYardages(teeSetId: string, courseId: string, rows: unknown) {
  if (!Array.isArray(rows)) return;
  const input = rows as NineYardageInput[];
  const nineIds = input.map(r => r.nineId).filter(Boolean);
  const owned = nineIds.length
    ? await prisma.nine.findMany({ where: { id: { in: nineIds }, courseId }, select: { id: true } })
    : [];
  const ownedIds = new Set(owned.map(n => n.id));
  await prisma.teeSetNine.deleteMany({ where: { teeSetId } });
  const valid = input.filter(r => ownedIds.has(r.nineId));
  if (valid.length) {
    await prisma.teeSetNine.createMany({
      data: valid.map(r => ({ teeSetId, nineId: r.nineId, yardage: Number(r.yardage) || 0 })),
    });
  }
}

async function replaceProductRatings(teeSetId: string, courseId: string, rows: unknown) {
  if (!Array.isArray(rows)) return;
  const input = rows as ProductRatingInput[];
  const productIds = input.map(r => r.courseProductId).filter(Boolean);
  const owned = productIds.length
    ? await prisma.courseProduct.findMany({ where: { id: { in: productIds }, courseId }, select: { id: true } })
    : [];
  const ownedIds = new Set(owned.map(p => p.id));
  await prisma.courseProductTeeSet.deleteMany({ where: { teeSetId } });
  const valid = input.filter(r => ownedIds.has(r.courseProductId));
  if (valid.length) {
    await prisma.courseProductTeeSet.createMany({
      data: valid.map(r => ({ teeSetId, courseProductId: r.courseProductId, rating: Number(r.rating) || 0, slope: Number(r.slope) || 0 })),
    });
  }
}

// Single-row create — used by the Course & Layout tab (mirrors the
// nines/course-products routes). Distinct from PUT below, which is
// onboarding's bulk replace-all and stays untouched.
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const count = await prisma.teeSet.count({ where: { courseId: session.courseId } });
  const teeSet = await prisma.teeSet.create({
    data: {
      courseId: session.courseId,
      name: String(body.name).trim(),
      yardage: Number(body.yardage) || 0,
      rating: Number(body.rating) || 0,
      slope: Number(body.slope) || 0,
      sortOrder: count,
    },
  });

  await replaceNineYardages(teeSet.id, session.courseId, body.nineYardages);
  await replaceProductRatings(teeSet.id, session.courseId, body.productRatings);

  const full = await prisma.teeSet.findUnique({
    where: { id: teeSet.id },
    include: { nineYardages: true, productRatings: true },
  });
  return NextResponse.json(full);
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const existing = await prisma.teeSet.findFirst({ where: { id, courseId: session.courseId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.teeSet.update({
    where: { id },
    data: {
      name: data.name !== undefined ? String(data.name).trim() : existing.name,
      yardage: data.yardage !== undefined ? Number(data.yardage) : existing.yardage,
      rating: data.rating !== undefined ? Number(data.rating) : existing.rating,
      slope: data.slope !== undefined ? Number(data.slope) : existing.slope,
      sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : existing.sortOrder,
    },
  });

  if (data.nineYardages !== undefined) await replaceNineYardages(id, session.courseId, data.nineYardages);
  if (data.productRatings !== undefined) await replaceProductRatings(id, session.courseId, data.productRatings);

  const full = await prisma.teeSet.findUnique({
    where: { id },
    include: { nineYardages: true, productRatings: true },
  });
  return NextResponse.json(full);
}

// Single-row delete — used by the Course & Layout tab.
export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await prisma.teeSet.deleteMany({ where: { id, courseId: session.courseId } });
  return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const teeSets: unknown[] = Array.isArray(body.teeSets) ? body.teeSets : [];

  await prisma.$transaction([
    prisma.teeSet.deleteMany({ where: { courseId: session.courseId } }),
    ...teeSets
      .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && !!(t as Record<string, unknown>).name)
      .map((t, i) => prisma.teeSet.create({
        data: {
          courseId: session.courseId,
          name: String(t.name).trim(),
          yardage: Number(t.yardage) || 0,
          rating: Number(t.rating) || 0,
          slope: Number(t.slope) || 0,
          sortOrder: i,
        },
      })),
  ]);

  const updated = await prisma.teeSet.findMany({ where: { courseId: session.courseId }, orderBy: { sortOrder: 'asc' } });
  return NextResponse.json(updated);
}
