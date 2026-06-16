import { NextRequest, NextResponse } from 'next/server';
import { getCourseBySlug, generateTeeTimes } from '@/lib/courses-data';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const course = getCourseBySlug(slug);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 });

  return NextResponse.json(generateTeeTimes(course, date));
}
