import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, evidentiaryIp } from '@/lib/rate-limit';
import { ALIVE_STATUSES } from '@/lib/inquiry-status';
import { sendInquirySigninCode } from '@/lib/email';
import { SIGNIN_COOKIE, CODE_TTL_SECONDS, cookieOptions, generateCode, hashCode, signChallenge } from '@/lib/inquiry-signin';

// SD-11 step 2. The public form answered "yes, I am trying to sign in", so send
// a code to the address ON FILE and hand back a challenge cookie.
//
// This route answers IDENTICALLY whatever it finds — same shape, same status,
// same message — because it is public and the whole point of the SECURITY
// follow-on (30385cd) was that a stranger must not be able to learn which
// courses already have a GreenReserve page. It is reached from a screen that
// only appears to someone who already used the email on file, but the route
// itself cannot assume that: anyone can POST to it directly.
export async function POST(req: NextRequest) {
  const ip = evidentiaryIp(req);
  // In front of the per-browser attempt cap, which someone could otherwise
  // reset by throwing the cookie away.
  if (!(await rateLimit(`signin-code:${ip}`, 6, 3600))) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const courseName = String(body.courseName || '').trim();
  const city = String(body.city || '').trim();
  const state = String(body.state || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  // Deliberately the same 200 for a bad request as for a course that does not
  // exist — a 400 here would itself be an answer.
  const blind = NextResponse.json({ sent: true });
  if (!courseName || !city || !state || !email) return blind;

  const existing = await prisma.courseInquiry.findFirst({
    where: {
      status: { in: ALIVE_STATUSES },
      courseName: { equals: courseName, mode: 'insensitive' },
      city: { equals: city, mode: 'insensitive' },
      state: { equals: state, mode: 'insensitive' },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, email: true, builtCourseId: true, firstName: true },
  });

  // No inquiry, not built yet, or the submitter is not using the address on
  // file: nothing is sent and nothing is said. 21c8d25's rule, unchanged.
  if (!existing || !existing.builtCourseId) return blind;
  if (existing.email.trim().toLowerCase() !== email) {
    // Worth a trace — someone naming a real built course from the wrong address
    // is the shape of a probe, and until now it left no record anywhere.
    await prisma.inquiryStatusEvent.create({
      data: {
        inquiryId: existing.id,
        fromStatus: existing.status,
        toStatus: existing.status,
        trigger: 'system',
        actorName: 'Sign-in code requested from an email that is NOT on file — nothing sent',
      },
    }).catch(err => console.error('signin-code event failed:', err));
    return blind;
  }

  const code = generateCode();
  const codeHash = await hashCode(code);
  const token = await signChallenge({ inquiryId: existing.id, codeHash, attempts: 0 });

  // To the address ON FILE, never to whatever was typed. They are the same
  // value in the only case that reaches this line, and that is exactly why the
  // stored one is the one to use — the day the check above loosens, this line
  // should not have to be revisited.
  await sendInquirySigninCode({
    email: existing.email,
    firstName: existing.firstName || 'there',
    courseName,
    code,
  }).catch(err => console.error('signin code email failed:', err));

  await prisma.inquiryStatusEvent.create({
    data: {
      inquiryId: existing.id,
      fromStatus: existing.status,
      toStatus: existing.status,
      trigger: 'system',
      actorName: 'Sign-in code sent — course already built, asked from the form',
    },
  }).catch(err => console.error('signin-code event failed:', err));

  const res = NextResponse.json({ sent: true });
  res.cookies.set(SIGNIN_COOKIE, token, { ...cookieOptions, maxAge: CODE_TTL_SECONDS });
  return res;
}
