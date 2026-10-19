import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { residentInput } from '@/lib/residents';

// RES-1 (Cam 2026-10-19): the course's residents — golfers who showed their
// resident card. Seeing the list needs members.view; changing it members.edit.
// The course is always the session's.

async function gate(perm: 'members.view' | 'members.edit') {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, perm);
  if (denied) return { res: denied };
  return { session };
}

const SELECT = { id: true, name: true, email: true, cardNumber: true, expiresOn: true, notes: true, createdAt: true } as const;
const duplicate = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
const DUP = 'A resident with that email is already on your list.';

export async function GET() {
  const g = await gate('members.view');
  if ('res' in g) return g.res;
  const [residents, rated] = await Promise.all([
    prisma.courseResident.findMany({ where: { courseId: g.session.courseId }, select: SELECT, orderBy: { name: 'asc' }, take: 5000 }),
    // Whether any schedule sets a resident price — without one the list does nothing.
    prisma.teeTimeSchedule.count({ where: { courseId: g.session.courseId, OR: [{ residentRateWeekdayCents: { not: null } }, { residentRateWeekendCents: { not: null } }] } }),
  ]);
  return NextResponse.json({ residents, hasResidentRate: rated > 0 });
}

export async function POST(req: NextRequest) {
  const g = await gate('members.edit');
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const v = residentInput(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    const resident = await prisma.courseResident.create({ data: { ...v.value, courseId: g.session.courseId, addedBy: g.session.email }, select: SELECT });
    return NextResponse.json({ resident });
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
  try {
    const done = await prisma.courseResident.updateMany({ where: { id, courseId: g.session.courseId }, data: v.value });
    if (done.count === 0) return NextResponse.json({ error: 'Resident not found.' }, { status: 404 });
  } catch (err) {
    if (duplicate(err)) return NextResponse.json({ error: DUP }, { status: 409 });
    throw err;
  }
  const resident = await prisma.courseResident.findFirst({ where: { id, courseId: g.session.courseId }, select: SELECT });
  return NextResponse.json({ resident });
}

export async function DELETE(req: NextRequest) {
  const g = await gate('members.edit');
  if ('res' in g) return g.res;
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const done = await prisma.courseResident.deleteMany({ where: { id, courseId: g.session.courseId } });
  if (done.count === 0) return NextResponse.json({ error: 'Resident not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
