import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';

function checkAdmin(req: NextRequest) {
  return req.headers.get('x-admin-key') === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const operators = await prisma.courseOperator.findMany({
    select: { id: true, email: true, name: true, emailVerified: true, verificationToken: true, onboardingStep: true },
    orderBy: { id: 'desc' },
  });
  const base = process.env.NEXT_PUBLIC_URL || 'https://green-reserve.vercel.app';
  return NextResponse.json(operators.map(op => ({
    ...op,
    setupLink: `${base}/dashboard/verify?token=${op.verificationToken}`,
  })));
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { email } = await req.json();
  const op = await prisma.courseOperator.findUnique({ where: { email } });
  if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Generate a fresh token if missing
  const token = op.verificationToken || randomBytes(32).toString('hex');
  await prisma.courseOperator.update({
    where: { email },
    data: { emailVerified: true, onboardingStep: Math.max(op.onboardingStep, 1), verificationToken: token },
  });
  const base = process.env.NEXT_PUBLIC_URL || 'https://green-reserve.vercel.app';
  return NextResponse.json({
        email,
    setupLink: `${base}/dashboard/verify?token=${token}`,
    verified: true,
  });
}

  });
}
