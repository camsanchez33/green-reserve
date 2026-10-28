import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireOwner, ownerGateError, stepUpRequired } from '@/lib/admin-session';
import { needReason, reasonOf, auditAdmin } from '@/lib/admin-audit';
import { previewCourseReset, resetTestCourse } from '@/lib/data-reset';
import { fillTestCourse } from '@/lib/sample-data';

// Filling ~80 days of a course takes a while.
export const maxDuration = 300;

// TEST-1: a course's test mark and the reset of a test course
// (src/lib/data-reset.ts). Owner only.
//   GET   ?courseId=      whether it is a test course, and what a reset would clear
//   PATCH { courseId, isTest }          mark or unmark it
//   POST  { courseId, confirm, reason } reset it — confirm is the course's name
//   PUT   { courseId }                  fill an empty test course with sample data (src/lib/sample-data.ts)

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const courseId = req.nextUrl.searchParams.get('courseId') || '';
  const preview = courseId ? await previewCourseReset(courseId) : null;
  if (!preview) return NextResponse.json({ error: 'That course no longer exists — refresh the page.' }, { status: 404 });
  return NextResponse.json(preview, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const courseId = typeof body?.courseId === 'string' ? body.courseId : '';
  if (!courseId || typeof body?.isTest !== 'boolean') return NextResponse.json({ error: 'Send the course and whether it is a test course.' }, { status: 400 });
  const prior = await prisma.course.findUnique({ where: { id: courseId }, select: { isTest: true } });
  if (!prior) return NextResponse.json({ error: 'That course no longer exists — refresh the page.' }, { status: 404 });
  await prisma.course.update({ where: { id: courseId }, data: { isTest: body.isTest } });
  await auditAdmin(session, { action: 'course_test_mark', targetType: 'course', targetId: courseId, courseId, before: { isTest: prior.isTest }, after: { isTest: body.isTest } });
  return NextResponse.json({ success: true, isTest: body.isTest });
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const su = stepUpRequired(session); if (su) return su;
  const body = await req.json().catch(() => ({}));
  const nr = needReason('course_reset', body); if (nr) return nr;
  const courseId = typeof body?.courseId === 'string' ? body.courseId : '';
  const course = courseId ? await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } }) : null;
  if (!course) return NextResponse.json({ error: 'That course no longer exists — refresh the page.' }, { status: 404 });
  if (typeof body?.confirm !== 'string' || body.confirm.trim() !== course.name.trim()) return NextResponse.json({ error: `Type the course's name — ${course.name} — to confirm.` }, { status: 400 });
  const result = await resetTestCourse(courseId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await auditAdmin(session, { action: 'course_reset', targetType: 'course', targetId: courseId, courseId, after: result.cleared, reason: reasonOf(body) });
  return NextResponse.json({ success: true, cleared: result.cleared });
}

// Cam 2026-10-28: sample bookings, members, shop sales and an outing on an EMPTY
// test course, so every page can be judged with data on it. Reset clears it.
export async function PUT(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const courseId = typeof body?.courseId === 'string' ? body.courseId : '';
  if (!courseId) return NextResponse.json({ error: 'Send the course to fill.' }, { status: 400 });
  const result = await fillTestCourse(courseId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await auditAdmin(session, { action: 'course_sample_fill', targetType: 'course', targetId: courseId, courseId, after: result.made });
  return NextResponse.json({ success: true, made: result.made });
}
