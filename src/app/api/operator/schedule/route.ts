import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';
import { generateTeeTimes } from '@/lib/tee-sheet-engine';

export async function GET() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json([]);
  return NextResponse.json(await prisma.teeTimeSchedule.findMany({ where: { courseId: course.id } }));
}

export async function POST(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json({ error: 'No course' }, { status: 404 });

  const body = await req.json();
  const schedule = await prisma.teeTimeSchedule.create({
    data: {
      courseId: course.id,
      daysOfWeek: body.daysOfWeek ?? [],
      startTime: body.startTime,
      endTime: body.endTime,
      intervalMinutes: Number(body.intervalMinutes) || 8,
      greenFeeWeekday: Number(body.greenFeeWeekday),
      greenFeeWeekend: Number(body.greenFeeWeekend),
      cartFee: Number(body.cartFee) || 0,
      walkingAllowed: body.walkingAllowed !== false,
    },
  });

  // Generate immediately
  const today = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    await generateTeeTimes(course.id, d.toISOString().split('T')[0]);
  }

  return NextResponse.json(schedule);
}

export async function DELETE(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  await prisma.teeTimeSchedule.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
