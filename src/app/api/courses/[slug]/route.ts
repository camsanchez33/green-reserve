import { NextRequest, NextResponse } from 'next/server';
import { getCourseBySlug } from '@/lib/courses-data';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const course = getCourseBySlug(slug);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  return NextResponse.json(course);
}
