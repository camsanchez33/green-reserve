import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';

export async function GET() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.kind !== 'operator') return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const operator = await prisma.courseOperator.findUnique({
    where: { id: session.operatorId },
    select: { verificationToken: true },
  });
  return NextResponse.json({ token: operator?.verificationToken });
}
