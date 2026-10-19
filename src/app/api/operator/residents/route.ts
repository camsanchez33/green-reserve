import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { residentInput } from '@/lib/residents';
import { groupCourseIds } from '@/lib/course-group';

// RES-1 (Cam 2026-10-19): the course's residents — golfers who showed their
// resident card. Seeing the list needs members.view; changing it members.edit.
// GRP-1: a course in a group shares one list with the group's other courses —
// staff at any of them see and keep it; a new resident is stored at the
// session's course. A course on its own sees only its own.

async function gate(perm: 'members.view' | 'members.edit') {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, perm);
  if (denied) return { res: denied };
  return { session };
}

const SELECT = { id: true, name: true, email: true, cardNumber: true, expiresOn: true, notes: true, createdAt: true, course: { select: { name: true } } } as const;
const view = <T extends { course: { name: string } }>({ course, ...r }: T) => ({ ...r, courseName: course.name });
/** Refuse an email already on the group's list (each course has its own unique key). */
async function takenInGroup(ids: string[], email: string | null, notId?: string) {
  if (!email) return false;
  return !!(await prisma.courseResident.findFirst({ where: { courseId: { in: ids }, email, ...(notId ? { NOT: { id: notId } } : {}) }, select: { id: true } }));
}
const duplicate = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
const DUP = 'A resident with that email is already on your list.';

export async function GET() {
  const g = await gate('members.view');
  if ('res' in g) return g.res;
  const ids = await groupCourseIds(g.session.courseId);
  const [residents, rated] = await Promise.all([
    prisma.courseResident.findMany({ where: { courseId: { in: ids } }, select: SELECT, orderBy: { name: 'asc' }, take: 5000 }),
    // Whether any schedule sets a resident price — without one the list does nothing.
    prisma.teeTimeSchedule.count({ where: { courseId: g.session.courseId, OR: [{ residentRateWeekdayCents: { not: null } }, { residentRateWeekendCents: { not: null } }] } }),
  ]);
  return NextResponse.json({ residents: residents.map(view), hasResidentRate: rated > 0, shared: ids.length > 1 });
}

export async function POST(req: NextRequest) {
  const g = await gate('members.edit');
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const v = residentInput(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (await takenInGroup(await groupCourseIds(g.session.courseId), v.value.email)) return NextResponse.json({ error: DUP }, { status: 409 });
  try {
    const resident = await prisma.courseResident.create({ data: { ...v.value, courseId: g.session.courseId, addedBy: g.session.email }, select: SELECT });
    return NextResponse.json({ resident: view(resident) });
  } catch (err) {
    if (duplicate(err)) return NextResponse.json({ error: DUP }, { status: 409 });
    throw err;
  }
}

export async function PATCH(req: NextRequest) {
  const g = await gate('members.edit');
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Missing resident.' }, { status: 400 });
  const v = residentInput(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const ids = await groupCourseIds(g.session.courseId);
  if (await takenInGroup(ids, v.value.email, id)) return NextResponse.json({ error: DUP }, { status: 409 });
  try {
    const done = await prisma.courseResident.updateMany({ where: { id, courseId: { in: ids } }, data: v.value });
    if (done.count === 0) return NextResponse.json({ error: 'Resident not found.' }, { status: 404 });
  } catch (err) {
    if (duplicate(err)) return NextResponse.json({ error: DUP }, { status: 409 });
    throw err;
  }
  const resident = await prisma.courseResident.findFirst({ where: { id, courseId: { in: ids } }, select: SELECT });
  return NextResponse.json({ resident: resident && view(resident) });
}

export async function DELETE(req: NextRequest) {
  const g = await gate('members.edit');
  if ('res' in g) return g.res;
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const done = await prisma.courseResident.deleteMany({ where: { id, courseId: { in: await groupCourseIds(g.session.courseId) } } });
  if (done.count === 0) return NextResponse.json({ error: 'Resident not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
