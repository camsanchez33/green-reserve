import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, evidentiaryIp } from '@/lib/rate-limit';
import { SIGNIN_COOKIE, MAX_CODE_ATTEMPTS, CODE_TTL_SECONDS, cookieOptions, checkCode, readChallenge, signChallenge } from '@/lib/inquiry-signin';

// SD-11 step 3. A correct code proves the person reads the address on file.
// It does NOT sign them in — see the note at the top of lib/inquiry-signin.ts.
// What it buys is the pointer: which address their account uses, and where the
// real login is.
const GENERIC = 'That code is not right, or it has expired. Check the email, or start again.';

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`signin-verify:${evidentiaryIp(req)}`, 20, 3600))) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  const challenge = await readChallenge(req.cookies.get(SIGNIN_COOKIE)?.value);
  // Expired, forged, or never issued all read the same. A distinct "no
  // challenge" message would tell someone probing the route whether their
  // earlier request had found a real course.
  if (!challenge) return NextResponse.json({ error: GENERIC }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim();

  if (challenge.attempts >= MAX_CODE_ATTEMPTS) {
    const dead = NextResponse.json({ error: 'Too many wrong codes. Start again.' }, { status: 429 });
    dead.cookies.set(SIGNIN_COOKIE, '', { ...cookieOptions, maxAge: 0 });
    return dead;
  }

  const ok = code.length === 6 && await checkCode(code, challenge.codeHash);
  if (!ok) {
    // Re-signed rather than incremented client-side, so the counter cannot be
    // edited back down by anyone holding the cookie.
    const next = await signChallenge({ ...challenge, attempts: challenge.attempts + 1 });
    const res = NextResponse.json({ error: GENERIC, attemptsLeft: MAX_CODE_ATTEMPTS - challenge.attempts - 1 }, { status: 400 });
    res.cookies.set(SIGNIN_COOKIE, next, { ...cookieOptions, maxAge: CODE_TTL_SECONDS });
    return res;
  }

  const inquiry = await prisma.courseInquiry.findUnique({
    where: { id: challenge.inquiryId },
    select: { id: true, status: true, email: true, courseName: true, builtCourseId: true },
  });
  if (!inquiry || !inquiry.builtCourseId) {
    return NextResponse.json({ error: GENERIC }, { status: 400 });
  }

  // Does an account they can actually sign into exist yet? A course can be
  // BUILT while its operator has never finished setting one up, and pointing
  // that person at a login screen is a dead end dressed as an answer.
  const operator = await prisma.courseOperator.findUnique({
    where: { email: inquiry.email.trim().toLowerCase() },
    select: { id: true, emailVerified: true },
  });
  const hasAccount = !!operator;
  const needsSetup = !!operator && operator.emailVerified === false;

  await prisma.inquiryStatusEvent.create({
    data: {
      inquiryId: inquiry.id,
      fromStatus: inquiry.status,
      toStatus: inquiry.status,
      trigger: 'system',
      actorName: hasAccount
        ? (needsSetup
          ? 'Sign-in code verified — operator account exists but is UNVERIFIED, cannot log in yet'
          : 'Sign-in code verified — pointed at the dashboard login')
        : 'Sign-in code verified — NO operator account exists for this course yet, needs a human',
    },
  }).catch(err => console.error('signin-verify event failed:', err));

  const res = NextResponse.json({
    ok: true,
    courseName: inquiry.courseName,
    // Safe to return: they have just proved they read this inbox.
    loginEmail: inquiry.email,
    hasAccount,
    needsSetup,
  });
  res.cookies.set(SIGNIN_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return res;
}
