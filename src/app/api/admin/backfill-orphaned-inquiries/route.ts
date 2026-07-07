import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';

// One-time fix: inquiries whose course was hard-deleted before Phase 2d
// were left at 'details_submitted' by the old Phase 2c code.
// Find any inquiry with a "permanently deleted" event that isn't already archived.
export async function POST() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orphans = await prisma.courseInquiry.findMany({
    where: {
      status: { not: 'archived' },
      events: { some: { actorName: { contains: 'permanently deleted' } } },
    },
    select: { id: true, status: true },
  });

  if (orphans.length === 0) return NextResponse.json({ fixed: 0 });

  await Promise.all(orphans.map(async inq => {
    await prisma.inquiryStatusEvent.create({
      data: {
        inquiryId: inq.id,
        fromStatus: inq.status,
        toStatus: 'archived',
        trigger: 'system',
        actorName: 'Backfill: course was permanently deleted',
      },
    });
    await prisma.courseInquiry.update({
      where: { id: inq.id },
      data: { status: 'archived' },
    });
  }));

  return NextResponse.json({ fixed: orphans.length });
}
