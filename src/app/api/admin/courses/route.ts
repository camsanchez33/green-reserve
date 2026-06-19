import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function checkAdmin(req: NextRequest) {
  return req.headers.get('x-admin-key') === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const courses = await prisma.course.findMany({
    include: { operator: { select: { email: true, name: true, onboardingStep: true, emailVerified: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(courses);
}

export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  // Delete related records first to avoid FK constraint errors
  await prisma.$transaction([
    prisma.booking.deleteMany({ where: { courseId: id } }),
    prisma.waitlist.deleteMany({ where: { courseId: id } }),
    prisma.teeTime.deleteMany({ where: { courseId: id } }),
    prisma.teeTimeSchedule.deleteMany({ where: { courseId: id } }),
    prisma.blackout.deleteMany({ where: { courseId: id } }),
    prisma.courseMembership.deleteMany({ where: { courseId: id } }),
    prisma.courseStaff.deleteMany({ where: { courseId: id } }),
    prisma.course.delete({ where: { id } }),
  ]);
  return NextResponse.json({ success: true });
}
