import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS, SUPPORT_PLUS, areaGate } from '@/lib/admin-session';
import { logSettingsChanged } from '@/lib/course-timeline';
import { needReason, reasonOf, auditAdmin, changedFields, bodyWithReason } from '@/lib/admin-audit';

// GRP-1 (Cam 2026-10-19, after golfbergencounty.com): course groups — several
// courses run together (a county, a club with more than one course). Made here
// only (Cam: "it should need approval"). A group gets one golfer page
// (/g/{slug}) and one shared resident list. Reading: support+; changing: manager+.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COURSES = { select: { id: true, name: true, slug: true, city: true, state: true, liveStatus: true, active: true, archivedAt: true }, orderBy: { name: 'asc' as const } };

async function gate(write: boolean) {
  const session = await resolveAdminSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const noArea = areaGate(session, 'courses');
  if (noArea) return { res: noArea };
  if (!requireRole(session, write ? MANAGER_PLUS : SUPPORT_PLUS)) return { res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session };
}

function fields(body: Record<string, unknown>) {
  const name = String(body.name ?? '').trim().slice(0, 120);
  const slug = String(body.slug ?? '').trim().toLowerCase().slice(0, 60);
  const description = String(body.description ?? '').trim().slice(0, 600);
  if (!name) return { error: 'Give the group a name, e.g. "Bergen County Golf".' };
  if (!SLUG.test(slug)) return { error: 'The web address can use lowercase letters, numbers and dashes, e.g. bergen-county-golf.' };
  return { value: { name, slug, description } };
}
const taken = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export async function GET() {
  const g = await gate(false);
  if ('res' in g) return g.res;
  const groups = await prisma.courseGroup.findMany({ orderBy: { name: 'asc' }, include: { courses: COURSES } });
  return NextResponse.json({ groups });
}

export async function POST(req: NextRequest) {
  const g = await gate(true);
  if ('res' in g) return g.res;
  const f = fields(await req.json().catch(() => ({})));
  if ('error' in f) return NextResponse.json({ error: f.error }, { status: 400 });
  try {
    const group = await prisma.courseGroup.create({ data: f.value, include: { courses: COURSES } });
    await auditAdmin(g.session, { action: 'course_group_add', targetType: 'course_group', targetId: group.id, after: f.value });
    return NextResponse.json({ group });
  } catch (err) {
    if (taken(err)) return NextResponse.json({ error: `greenreserve.app/g/${f.value.slug} is already taken — pick another address.` }, { status: 409 });
    throw err;
  }
}

/** Rename, or add / remove a course: { id, name, slug, description } | { id, addCourseId } | { id, removeCourseId }. */
export async function PATCH(req: NextRequest) {
  const g = await gate(true);
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  const group = id ? await prisma.courseGroup.findUnique({ where: { id }, select: { id: true, name: true } }) : null;
  if (!group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });

  if (typeof body.addCourseId === 'string') {
    const course = await prisma.course.findUnique({ where: { id: body.addCourseId }, select: { id: true, name: true, groupId: true, group: { select: { name: true } } } });
    if (!course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
    if (course.groupId === group.id) return NextResponse.json({ error: `${course.name} is already in this group.` }, { status: 409 });
    if (course.groupId) return NextResponse.json({ error: `${course.name} is in ${course.group?.name ?? 'another group'}. Remove it there first.` }, { status: 409 });
    await prisma.course.update({ where: { id: course.id }, data: { groupId: group.id } });
    await logSettingsChanged(course.id, [{ field: 'group', from: null, to: group.name }], g.session.email);
    await auditAdmin(g.session, { action: 'course_group_add_course', targetType: 'course_group', targetId: group.id, courseId: course.id, after: { group: group.name } });
  } else if (typeof body.removeCourseId === 'string') {
    const done = await prisma.course.updateMany({ where: { id: body.removeCourseId, groupId: group.id }, data: { groupId: null } });
    if (done.count === 0) return NextResponse.json({ error: 'That course isn’t in this group.' }, { status: 404 });
    await logSettingsChanged(body.removeCourseId, [{ field: 'group', from: group.name, to: null }], g.session.email);
    await auditAdmin(g.session, { action: 'course_group_remove_course', targetType: 'course_group', targetId: group.id, courseId: body.removeCourseId, before: { group: group.name } });
  } else {
    const f = fields(body);
    if ('error' in f) return NextResponse.json({ error: f.error }, { status: 400 });
    const prior = await prisma.courseGroup.findUnique({ where: { id }, select: { name: true, slug: true, description: true } });
    try { await prisma.courseGroup.update({ where: { id }, data: f.value }); }
    catch (err) {
      if (taken(err)) return NextResponse.json({ error: `greenreserve.app/g/${f.value.slug} is already taken — pick another address.` }, { status: 409 });
      throw err;
    }
    await auditAdmin(g.session, { action: 'course_group_edit', targetType: 'course_group', targetId: id, ...changedFields(prior ?? {}, f.value) });
  }
  const updated = await prisma.courseGroup.findUnique({ where: { id }, include: { courses: COURSES } });
  return NextResponse.json({ group: updated });
}

/** Delete a group: its courses stay, on their own again. */
export async function DELETE(req: NextRequest) {
  const g = await gate(true);
  if ('res' in g) return g.res;
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const group = await prisma.courseGroup.findUnique({ where: { id }, include: { courses: { select: { id: true } } } });
  if (!group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
  const body = await bodyWithReason(req);
  const nr = needReason('course_group_delete', body); if (nr) return nr;
  await prisma.$transaction([
    prisma.course.updateMany({ where: { groupId: id }, data: { groupId: null } }),
    prisma.courseGroup.delete({ where: { id } }),
  ]);
  for (const c of group.courses) await logSettingsChanged(c.id, [{ field: 'group', from: group.name, to: null }], g.session.email);
  await auditAdmin(g.session, { action: 'course_group_delete', targetType: 'course_group', targetId: id, before: { name: group.name, slug: group.slug, courses: group.courses.length }, reason: reasonOf(body) });
  return NextResponse.json({ ok: true });
}
