import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getMemberSession } from '@/lib/member-session';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  const { courseSlug } = await params;
  const session = await getMemberSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true, name: true },
  });
  if (!course || course.id !== session.courseId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const membership = await prisma.courseMembership.findUnique({
    where: { id: session.membershipId },
    include: { tier: true },
  });
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const records: {
    type: string;
    amount: number;
    date: Date | null;
    status: string;
    tierName: string;
  }[] = [];

  if (membership.lastPaidAt) {
    records.push({
      type: 'dues',
      amount: membership.tier?.annualFee ?? 0,
      date: membership.lastPaidAt,
      status: membership.paymentStatus,
      tierName: membership.tier?.name ?? membership.membershipType,
    });
  }

  if (
    membership.startedAt &&
    membership.tier?.initiationFee &&
    membership.tier.initiationFee > 0
  ) {
    records.push({
      type: 'initiation',
      amount: membership.tier.initiationFee,
      date: membership.startedAt,
      status: 'paid',
      tierName: membership.tier.name,
    });
  }

  // Sort newest first
  records.sort((a, b) => {
    const ta = a.date ? a.date.getTime() : 0;
    const tb = b.date ? b.date.getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json({
    membership: {
      status: membership.status,
      paymentStatus: membership.paymentStatus,
      expiresAt: membership.expiresAt,
      startedAt: membership.startedAt,
      tierName: membership.tier?.name ?? membership.membershipType,
      annualFee: membership.tier?.annualFee ?? 0,
      initiationFee: membership.tier?.initiationFee ?? 0,
    },
    records,
    courseName: course.name,
  });
}
