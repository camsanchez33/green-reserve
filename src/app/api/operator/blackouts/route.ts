import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json([]);
  return NextResponse.json(await prisma.blackout.findMany({ where: { courseId: course.id } }));
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json({ error: 'No course' }, { status: 404 });
  const { date, reason } = await req.json();
  await prisma.teeTime.deleteMany({ where: { courseId: course.id, date } });
  const blackout = await prisma.blackout.create({ data: { courseId: course.id, date, reason: reason || '' } });
  return NextResponse.json(blackout);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  await prisma.blackout.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
