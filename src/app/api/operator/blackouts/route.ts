import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await prisma.blackout.findMany({ where: { courseId: session.courseId } }));
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { date, reason } = await req.json();
  await prisma.teeTime.deleteMany({ where: { courseId: session.courseId, date } });
  const blackout = await prisma.blackout.create({ data: { courseId: session.courseId, date, reason: reason || '' } });
  return NextResponse.json(blackout);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  // Verify ownership before deleting — never trust a bare ID from the client.
  const blackout = await prisma.blackout.findUnique({ where: { id } });
  if (!blackout || blackout.courseId !== session.courseId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await prisma.blackout.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
