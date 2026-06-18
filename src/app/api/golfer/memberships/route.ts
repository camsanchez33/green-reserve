import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';

export async function GET() {
  const session = await getGolferSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberships = await prisma.courseMembership.findMany({
    where: { golferId: session.golferId, status: 'active' },
    include: { course: { select: { id: true, name: true, slug: true, city: true, state: true } } },
  });
  return NextResponse.json(memberships);
}

// Golfer requests membership at a course
export async function POST(req: NextRequest) {
  const session = await getGolferSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { courseId } = await req.json();
  const existing = await prisma.courseMembership.findUnique({
    where: { golferId_courseId: { golferId: session.golferId, courseId } },
  });
  if (existing) return NextResponse.json({ error: 'Already requested' }, { status: 409 });
  const membership = await prisma.courseMembership.create({
    data: { golferId: session.golferId, courseId, status: 'pending', addedBy: 'self' },
  });
  return NextResponse.json(membership);
}
