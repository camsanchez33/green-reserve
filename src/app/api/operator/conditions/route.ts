import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';

export async function PATCH(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { conditions } = await req.json();
  const operator = await prisma.courseOperator.findUnique({
    where: { id: session.operatorId }, include: { course: { select: { id: true } } },
  });
  if (!operator?.course) return NextResponse.json({ error: 'No course' }, { status: 404 });
  const updated = await prisma.course.update({
    where: { id: operator.course.id },
    data: { conditions: conditions || '', conditionsUpdatedAt: conditions ? new Date() : null },
  });
  return NextResponse.json({ conditions: updated.conditions });
}
