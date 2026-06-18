import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';

export async function GET() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json([]);
  const members = await prisma.courseMembership.findMany({
    where: { courseId: course.id },
    include: { golfer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(members);
}

// Operator adds a member by email
export async function POST(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json({ error: 'No course' }, { status: 404 });

  const { email, membershipType, expiresAt, notes } = await req.json();
  const golfer = await prisma.golferAccount.findUnique({ where: { email } });
  if (!golfer) return NextResponse.json({ error: 'No golfer account found with that email — they need to sign up first' }, { status: 404 });

  const existing = await prisma.courseMembership.findUnique({
    where: { golferId_courseId: { golferId: golfer.id, courseId: course.id } },
  });
  if (existing) {
    const updated = await prisma.courseMembership.update({
      where: { id: existing.id },
      data: { status: 'active', membershipType: membershipType || 'member', notes: notes || '', expiresAt: expiresAt ? new Date(expiresAt) : null },
    });
    return NextResponse.json(updated);
  }

  const membership = await prisma.courseMembership.create({
    data: {
      golferId: golfer.id,
      courseId: course.id,
      membershipType: membershipType || 'member',
      status: 'active',
      addedBy: 'operator',
      notes: notes || '',
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });
  return NextResponse.json(membership);
}

// Operator updates or removes a member
export async function PATCH(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, status, membershipType } = await req.json();
  const updated = await prisma.courseMembership.update({
    where: { id },
    data: { status, membershipType },
  });
  return NextResponse.json(updated);
}
