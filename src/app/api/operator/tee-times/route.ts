import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const withBookings = searchParams.get('withBookings') === '1';

  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json([]);

  const teeTimes = await prisma.teeTime.findMany({
    where: { courseId: course.id, date },
    orderBy: { time: 'asc' },
    include: withBookings ? { bookings: { where: { status: 'confirmed' }, orderBy: { createdAt: 'asc' } } } : undefined,
  });

  return NextResponse.json(teeTimes);
}

export async function POST(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json({ error: 'No course' }, { status: 404 });

  const body = await req.json();
  const teeTime = await prisma.teeTime.create({
    data: {
      courseId: course.id,
      date: body.date,
      time: body.time,
      holes: body.holes || 18,
      playersAvailable: Number(body.playersAvailable) || 4,
      playersBooked: 0,
      greenFee: Number(body.greenFee),
      cartFee: Number(body.cartFee) || 0,
      walkingAllowed: body.walkingAllowed !== false,
      status: 'available',
    },
  });
  return NextResponse.json(teeTime);
}

export async function PATCH(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, status } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Verify this tee time belongs to the operator's course
  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json({ error: 'No course' }, { status: 404 });

  const teeTime = await prisma.teeTime.findFirst({ where: { id, courseId: course.id } });
  if (!teeTime) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.teeTime.update({
    where: { id },
    data: { status },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json({ error: 'No course' }, { status: 404 });

  await prisma.teeTime.deleteMany({ where: { id, courseId: course.id } });
  return NextResponse.json({ success: true });
}
