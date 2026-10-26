import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyMemberMagicToken, signMemberSessionToken } from '@/lib/member-session';
import { securityEvent } from '@/lib/security-events';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  const { courseSlug } = await params;
  const token = req.nextUrl.searchParams.get('token');

  const failUrl = `${process.env.NEXT_PUBLIC_URL}/courses/${courseSlug}/member?error=invalid`;

  if (!token) return NextResponse.redirect(failUrl);
  // SEC-3 audit: this link check had no limit at all.
  if (!(await rateLimit(`member-verify-ip:${clientIp(req)}`, 30, 600))) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'member', detail: 'sign-in link' });
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/courses/${courseSlug}/member?error=busy`);
  }

  const payload = await verifyMemberMagicToken(token);
  if (!payload) {
    await securityEvent(req, { kind: 'signin_failed', surface: 'member', detail: 'sign-in link invalid or expired' });
    return NextResponse.redirect(failUrl);
  }

  // Confirm token's courseId belongs to this slug
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true },
  });
  if (!course || course.id !== payload.courseId) {
    return NextResponse.redirect(failUrl);
  }

  // Confirm membership is still active
  const membership = await prisma.courseMembership.findUnique({
    where: { id: payload.membershipId },
    select: { status: true },
  });
  if (!membership || membership.status !== 'active') {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_URL}/courses/${courseSlug}/member?error=inactive`
    );
  }

  const sessionToken = await signMemberSessionToken({
    membershipId: payload.membershipId,
    courseId: payload.courseId,
    email: payload.email,
  });

  const res = NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_URL}/courses/${courseSlug}/member`
  );
  res.cookies.set('gr_member', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return res;
}
