import { NextRequest, NextResponse } from 'next/server';
import { searchCourses } from '@/lib/courses-data';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const courses = searchCourses({
    q: searchParams.get('q') || undefined,
    type: searchParams.get('type') || undefined,
    state: searchParams.get('state') || undefined,
    featured: searchParams.get('featured') === '1' || undefined,
  });
  return NextResponse.json(courses);
}
