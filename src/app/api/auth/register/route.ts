import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
  const { email, password, name, courseName } = await req.json();
  if (!email || !password || !name || !courseName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const existing = await prisma.courseOperator.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });

  const hashed = await bcrypt.hash(password, 12);
  const slug = courseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const verificationToken = randomBytes(32).toString('hex');

  const operator = await prisma.courseOperator.create({
    data: {
      email,
      password: hashed,
      name,
      emailVerified: false,
      verificationToken,
      onboardingStep: 0,
      course: {
        create: {
          slug,
          name: courseName,
          active: false,
        },
      },
    },
  });

  const token = await signToken({ operatorId: operator.id, email: operator.email });
  const res = NextResponse.json({ success: true, verificationToken });
  res.cookies.set('gr_operator', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return res;
}
