import { NextRequest, NextResponse } from 'next/server';
import { COURSES } from '@/lib/courses-data';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { course_id, golfer_name, golfer_email, players } = body;

  if (!course_id || !golfer_name || !golfer_email || !players) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const course = COURSES.find(c => c.id === Number(course_id));

  // In a real app you'd persist this to a DB. For now we return success + redirect URL.
  return NextResponse.json({
    booking_id: `GR-${Date.now()}`,
    booking_url: course?.booking_url || null,
    course_name: course?.name || '',
  });
}
