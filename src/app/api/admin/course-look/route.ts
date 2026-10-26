import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, VIEWER_PLUS, areaGate } from '@/lib/admin-session';
import { hasArea } from '@/lib/admin-areas';
import { signLookToken } from '@/lib/preview-token';

// Cam 2026-10-26 ("I want to be able to see it before sending them a preview"):
// a view-only link to a built course's page, for the admin. Its token is the
// 'look' purpose, which the approve / request-changes routes refuse — so
// opening it can never approve or ask for changes on the course's behalf.
// Open to Pipeline (the inquiry page) or Courses (the course page).
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasArea(session, 'pipeline')) { const noArea = areaGate(session, 'courses'); if (noArea) return noArea; }
  if (!requireRole(session, VIEWER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const courseId = req.nextUrl.searchParams.get('courseId') ?? '';
  const course = courseId ? await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } }) : null;
  if (!course) return NextResponse.json({ error: 'That course is gone — refresh the page.' }, { status: 404 });
  const base = process.env.NEXT_PUBLIC_URL || '';
  return NextResponse.json({ url: `${base}/preview/${course.id}?token=${await signLookToken(course.id)}` });
}
