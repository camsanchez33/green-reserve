import { NextRequest, NextResponse } from 'next/server';
import { loadPublicCourse } from '@/lib/public-course';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const course = await loadPublicCourse(slug);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  return NextResponse.json(course);
}
