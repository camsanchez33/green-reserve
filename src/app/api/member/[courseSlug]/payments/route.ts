import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
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

  // LEDGER-1: what was actually paid, payment by payment — from the ledger, once it has any.
  const paidRows = await prisma.moneyMove.findMany({ where: { courseId: course.id, membershipId: membership.id, what: 'dues' }, orderBy: { at: 'desc' }, take: 50, select: { direction: true, method: true, amountCents: true, at: true } });
  for (const r of paidRows) records.push({
    type: r.direction === 'out' ? 'refund' : 'dues', amount: r.amountCents / 100, date: r.at,
    status: r.direction === 'out' ? 'refunded' : r.method === 'card' ? 'paid' : 'paid_offline',
    tierName: membership.tier?.name ?? membership.membershipType,
  });

  if (!paidRows.length && membership.lastPaidAt) {
    records.push({
      type: 'dues',
      amount: centsToDollarsOr0(membership.tier?.annualFeeCents),
      date: membership.lastPaidAt,
      status: membership.paymentStatus,
      tierName: membership.tier?.name ?? membership.membershipType,
    });
  }

  if (
    !paidRows.length &&
    membership.startedAt && !membership.initiationWaived &&
    membership.tier?.initiationFeeCents &&
    membership.tier.initiationFeeCents > 0
  ) {
    records.push({
      type: 'initiation',
      amount: centsToDollarsOr0(membership.tier.initiationFeeCents),
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
      annualFee: centsToDollarsOr0(membership.tier?.annualFeeCents),
      initiationFee: membership.initiationWaived ? 0 : centsToDollarsOr0(membership.tier?.initiationFeeCents),
    },
    records,
    courseName: course.name,
  });
}
