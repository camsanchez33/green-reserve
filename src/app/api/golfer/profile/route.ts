import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';

export async function GET() {
  const session = await getGolferSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const golfer = await prisma.golferAccount.findUnique({
    where: { id: session.golferId },
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, createdAt: true },
  });
  return NextResponse.json(golfer);
}
