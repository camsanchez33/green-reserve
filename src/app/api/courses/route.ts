import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { searchCourses } from '@/lib/courses-data';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q') || undefined;
  const type = searchParams.get('type') || undefined;
  const state = searchParams.get('state') || undefined;
  const featured = searchParams.get('featured') === '1' || undefined;

  // Always load static courses as the base
  const staticCourses = searchCourses({ q, type, state, featured });

  try {
    // Load active DB courses that have at least a name and city filled in
    const where: Record<string, unknown> = { active: true, city: { not: '' } };
    if (type) where.type = type;
    if (state) where.state = state;
    if (featured) where.featured = true;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { state: { contains: q, mode: 'insensitive' } },
      ];
    }
    const dbCourses = await prisma.course.findMany({
      where,
      orderBy: [{ featured: 'desc' }, { rating: 'desc' }],
    });

    // Merge: DB courses first, then static courses that aren't already in DB (by slug)
    const dbSlugs = new Set(dbCourses.map((c) => c.slug));
    const filteredStatic = staticCourses.filter((c) => !dbSlugs.has(c.slug));
    return NextResponse.json([...dbCourses, ...filteredStatic]);
  } catch {
    return NextResponse.json(staticCourses);
  }
}
