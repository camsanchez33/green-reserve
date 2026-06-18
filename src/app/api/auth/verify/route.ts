import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 400 });

  const operator = await prisma.courseOperator.findFirst({
    where: { verificationToken: token },
  });

  if (!operator) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  if (operator.emailVerified) return NextResponse.json({ success: true, alreadyVerified: true });

  await prisma.courseOperator.update({
    where: { id: operator.id },
    data: { emailVerified: true, onboardingStep: 1 },
  });

  return NextResponse.json({ success: true });
}
