import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitCount, evidentiaryIp } from '@/lib/rate-limit';
import { sendLockedOutOperatorAlert } from '@/lib/email';
import {
  SIGNIN_COOKIE, MAX_CODE_ATTEMPTS, cookieOptions,
  codeMatches, readChallenge, verifyAttemptKey, CODE_TTL_SECONDS,
} from '@/lib/inquiry-signin';

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

  // REVIEW FIX (cfeb2e1 audit): the attempt counter used to live INSIDE the
  // token, re-signed on each miss. That stops someone editing it down and does
  // nothing about replay — you do not need to edit a token you already have, and
  // resending the original cookie reset the count to zero on every guess, so the
  // cap did not exist. The counter now hangs off the challenge id on the server,
  // in the RateLimit table this codebase already has, so an old cookie lands on
  // the same counter. No schema change, and a real cap this time.
  const cap = await rateLimitCount(verifyAttemptKey(challenge.cid), MAX_CODE_ATTEMPTS, CODE_TTL_SECONDS);
  const attemptsLeft = Math.max(0, MAX_CODE_ATTEMPTS - cap.used);
  if (!cap.allowed) {
    const dead = NextResponse.json({ error: 'Too many wrong codes. Send yourself a new one.' }, { status: 429 });
    dead.cookies.set(SIGNIN_COOKIE, '', { ...cookieOptions, maxAge: 0 });
    return dead;
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim();

  if (code.length !== 6 || !codeMatches(challenge.cid, code, challenge.codeMac)) {
    // The count the limiter already had. Without it the lockout arrived with no
    // warning it was coming.
    return NextResponse.json({ error: GENERIC, attemptsLeft }, { status: 400 });
  }

  let inquiry;
  try {
    inquiry = await prisma.courseInquiry.findUnique({
      where: { id: challenge.inquiryId },
      select: { id: true, status: true, email: true, courseName: true, builtCourseId: true },
    });
  } catch (err) {
    console.error('signin-verify lookup failed:', err);
    return NextResponse.json({ error: GENERIC }, { status: 400 });
  }
  if (!inquiry || !inquiry.builtCourseId) {
    return NextResponse.json({ error: GENERIC }, { status: 400 });
  }

  // Does an account they can actually sign into exist yet? A course can be
  // BUILT while its operator has never finished setting one up, and pointing
  // that person at a login screen is a dead end dressed as an answer.
  const operator = await prisma.courseOperator.findUnique({
    where: { email: inquiry.email.trim().toLowerCase() },
    select: { id: true, emailVerified: true },
  }).catch(() => null);
  const hasAccount = !!operator;
  const needsSetup = !!operator && operator.emailVerified === false;

  // REVIEW FIX (UX audit, HIGH): the screen tells this person the team has been
  // told and will email them. A ledger row is a record, not a notification —
  // nothing reads it unless someone happens to open that inquiry. So send the
  // actual email, and let it reply straight back to them.
  if (!hasAccount || needsSetup) {
    sendLockedOutOperatorAlert({
      courseName: inquiry.courseName,
      inquiryId: inquiry.id,
      operatorEmail: inquiry.email,
      reason: hasAccount ? 'unverified' : 'no-account',
    }).catch(err => console.error('locked-out operator alert failed:', err));
  }

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
    // Safe to return: they had to type this address to get a challenge at all.
    loginEmail: inquiry.email,
    hasAccount,
    needsSetup,
  });
  res.cookies.set(SIGNIN_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return res;
}
