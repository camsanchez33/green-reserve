import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { searchCourses } from '@/lib/courses-data';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q') || undefined;
  const type = searchParams.get('type') || undefined;
  const state = searchParams.get('state') || undefined;
  const featured = searchParams.get('featured') === '1' || undefined;

  try {
    // Try live DB courses first
    const where: Record<string, unknown> = { active: true };
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
    const dbCourses = await prisma.course.findMany({ where, orderBy: [{ featured: 'desc' }, { rating: 'desc' }] });
    if (dbCourses.length > 0) return NextResponse.json(dbCourses);
  } catch { /* fall through to static */ }

  // Fallback to static data
  const courses = searchCourses({ q, type, state, featured });
  return NextResponse.json(courses);
}
