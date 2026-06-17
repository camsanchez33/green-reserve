import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const course = await prisma.course.findFirst({
    where: { operator: { id: session.operatorId } },
  });
  if (!course) return NextResponse.json([]);

  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0];
  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId: course.id, date },
    orderBy: { time: 'asc' },
  });
  return NextResponse.json(teeTimes);
}

export async function POST(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const course = await prisma.course.findFirst({
    where: { operator: { id: session.operatorId } },
  });
  if (!course) return NextResponse.json({ error: 'No course found' }, { status: 404 });

  const body = await req.json();
  const teeTime = await prisma.teeTime.create({
    data: {
      courseId: course.id,
      date: body.date,
      time: body.time,
      holes: body.holes ?? 18,
      playersAvailable: body.playersAvailable ?? 4,
      greenFee: body.greenFee,
      cartFee: body.cartFee ?? 0,
      walkingAllowed: body.walkingAllowed ?? true,
      status: 'available',
    },
  });
  return NextResponse.json(teeTime);
}

export async function DELETE(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  await prisma.teeTime.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
