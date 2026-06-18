import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken, signStaffToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  // Try operator first
  const operator = await prisma.courseOperator.findUnique({ where: { email } });
  if (operator) {
    const valid = await bcrypt.compare(password, operator.password);
    if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    const token = await signToken({ operatorId: operator.id, email: operator.email });
    let redirect = '/dashboard';
    if (!operator.emailVerified) redirect = '/dashboard/verify';
    else if (operator.onboardingStep < 3) redirect = '/dashboard/onboarding';

    const res = NextResponse.json({ success: true, redirect });
    res.cookies.set('gr_operator', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return res;
  }

  // Try staff account
  const staff = await prisma.courseStaff.findUnique({ where: { email } });
  if (staff) {
    if (!staff.active) return NextResponse.json({ error: 'Account disabled' }, { status: 401 });
    const valid = await bcrypt.compare(password, staff.password);
    if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    const token = await signStaffToken({ staffId: staff.id, courseId: staff.courseId, email: staff.email });
    const res = NextResponse.json({ success: true, redirect: '/dashboard' });
    res.cookies.set('gr_operator', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return res;
  }

  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}
