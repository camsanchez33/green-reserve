import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';

export async function GET(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const courses = await prisma.course.findMany({
    include: { operator: { select: { email: true, name: true, onboardingStep: true, emailVerified: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(courses);
}

export async function DELETE(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { id }, select: { operatorId: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  // Delete related records first to avoid FK constraint errors.
  // Order matters: courseMembership references membershipTier, so it must go first.
  // The operator account (and its email) must be deleted too — otherwise the
  // email stays "taken" forever and that person can never register again.
  await prisma.$transaction([
    prisma.booking.deleteMany({ where: { courseId: id } }),
    prisma.waitlist.deleteMany({ where: { courseId: id } }),
    prisma.courseMembership.deleteMany({ where: { courseId: id } }),
    prisma.membershipTier.deleteMany({ where: { courseId: id } }),
    prisma.teeTime.deleteMany({ where: { courseId: id } }),
    prisma.teeTimeSchedule.deleteMany({ where: { courseId: id } }),
    prisma.blackout.deleteMany({ where: { courseId: id } }),
    prisma.courseStaff.deleteMany({ where: { courseId: id } }),
    // Clear the dangling pointer so the admin UI doesn't link to a deleted course.
    prisma.courseInquiry.updateMany({ where: { builtCourseId: id }, data: { builtCourseId: null } }),
    prisma.course.delete({ where: { id } }),
    ...(course.operatorId ? [prisma.courseOperator.delete({ where: { id: course.operatorId } })] : []),
  ]);
  return NextResponse.json({ success: true });
}
