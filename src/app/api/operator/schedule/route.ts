import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { generateTeeTimes } from '@/lib/tee-sheet-engine';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(
    await prisma.teeTimeSchedule.findMany({
      where: { courseId: session.courseId },
      orderBy: { createdAt: 'asc' },
    })
  );
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const schedule = await prisma.teeTimeSchedule.create({
    data: {
      courseId: session.courseId,
      tierName: body.tierName || 'standard',
      daysOfWeek: body.daysOfWeek ?? [],
      startTime: body.startTime,
      endTime: body.endTime,
      intervalMinutes: Number(body.intervalMinutes) || 8,
      holes: Number(body.holes) || 18,
      greenFeeWeekday: Number(body.greenFeeWeekday),
      greenFeeWeekend: Number(body.greenFeeWeekend),
      memberRateWeekday: body.memberRateWeekday ? Number(body.memberRateWeekday) : null,
      memberRateWeekend: body.memberRateWeekend ? Number(body.memberRateWeekend) : null,
      residentRateWeekday: body.residentRateWeekday ? Number(body.residentRateWeekday) : null,
      residentRateWeekend: body.residentRateWeekend ? Number(body.residentRateWeekend) : null,
      cartFee: Number(body.cartFee) || 0,
      walkingAllowed: body.walkingAllowed !== false,
    },
  });

  // Generate next 8 days immediately
  const today = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    await generateTeeTimes(session.courseId, d.toISOString().split('T')[0]);
  }

  return NextResponse.json(schedule);
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Verify ownership
  const existing = await prisma.teeTimeSchedule.findFirst({ where: { id, courseId: session.courseId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.teeTimeSchedule.update({
    where: { id },
    data: {
      active: data.active !== undefined ? data.active : existing.active,
      tierName: data.tierName ?? existing.tierName,
      daysOfWeek: data.daysOfWeek ?? existing.daysOfWeek,
      startTime: data.startTime ?? existing.startTime,
      endTime: data.endTime ?? existing.endTime,
      intervalMinutes: data.intervalMinutes !== undefined ? Number(data.intervalMinutes) : existing.intervalMinutes,
      holes: data.holes !== undefined ? Number(data.holes) : existing.holes,
      greenFeeWeekday: data.greenFeeWeekday !== undefined ? Number(data.greenFeeWeekday) : existing.greenFeeWeekday,
      greenFeeWeekend: data.greenFeeWeekend !== undefined ? Number(data.greenFeeWeekend) : existing.greenFeeWeekend,
      memberRateWeekday: data.memberRateWeekday !== undefined ? (data.memberRateWeekday ? Number(data.memberRateWeekday) : null) : existing.memberRateWeekday,
      memberRateWeekend: data.memberRateWeekend !== undefined ? (data.memberRateWeekend ? Number(data.memberRateWeekend) : null) : existing.memberRateWeekend,
      residentRateWeekday: data.residentRateWeekday !== undefined ? (data.residentRateWeekday ? Number(data.residentRateWeekday) : null) : existing.residentRateWeekday,
      residentRateWeekend: data.residentRateWeekend !== undefined ? (data.residentRateWeekend ? Number(data.residentRateWeekend) : null) : existing.residentRateWeekend,
      cartFee: data.cartFee !== undefined ? Number(data.cartFee) : existing.cartFee,
      walkingAllowed: data.walkingAllowed !== undefined ? data.walkingAllowed : existing.walkingAllowed,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  await prisma.teeTimeSchedule.deleteMany({ where: { id, courseId: session.courseId } });
  return NextResponse.json({ success: true });
}
