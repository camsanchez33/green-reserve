import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';
import { ACTIVE_COURSE_COOKIE } from '@/lib/session';

// Sets which of an operator's courses the dashboard should act on. Always
// re-validates ownership server-side — the cookie is just a preference, never
// trusted for authorization.
export async function POST(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.kind !== 'operator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { courseId } = await req.json();
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  const course = await prisma.course.findFirst({ where: { id: courseId, operatorId: session.operatorId }, select: { id: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const res = NextResponse.json({ success: true });
  res.cookies.set(ACTIVE_COURSE_COOKIE, course.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return res;
}
