import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { conditions } = await req.json();
  const updated = await prisma.course.update({
    where: { id: session.courseId },
    data: { conditions: conditions || '', conditionsUpdatedAt: conditions ? new Date() : null },
  });
  return NextResponse.json({ conditions: updated.conditions });
}
