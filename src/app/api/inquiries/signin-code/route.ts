import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, evidentiaryIp } from '@/lib/rate-limit';
import { ALIVE_STATUSES } from '@/lib/inquiry-status';
import { sendInquirySigninCode } from '@/lib/email';
import {
  SIGNIN_COOKIE, CODE_TTL_SECONDS, cookieOptions,
  generateCode, macCode, newChallengeId, signChallenge, inertChallenge,
} from '@/lib/inquiry-signin';

// SD-11 step 2. The public form answered "yes, I am trying to sign in", so send
// a code to the address ON FILE and hand back a challenge cookie.
//
// This route must answer the same way whatever it finds, because it is public
// and the whole point of the SECURITY follow-on (30385cd) was that a stranger
// must not learn which courses already have a GreenReserve page. It is reached
// from a screen that only appears to someone who already used the email on file,
// but the route cannot assume that: anyone can POST to it directly.
//
// REVIEW FIX (cfeb2e1 audit): "the same way" has to include the HEADERS. The
// first version returned an identical body on every path and set the challenge
// cookie only on success, so `Set-Cookie` present meant "this course is built
// AND that is the address on file" — a clean oracle over public facts, since a
// course's name, town and GM's address are usually on its own website. Every
// exit now carries a cookie; the declining ones carry a challenge that cannot
// succeed.
export async function POST(req: NextRequest) {
  const ip = evidentiaryIp(req);

  async function blind() {
    const res = NextResponse.json({ sent: true });
    res.cookies.set(SIGNIN_COOKIE, await signChallenge(inertChallenge()), { ...cookieOptions, maxAge: CODE_TTL_SECONDS });
    return res;
  }

  // In front of the per-challenge cap, which someone could otherwise reset by
  // asking for a fresh code.
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
  if (!courseName || !city || !state || !email) return blind();

  let existing;
  try {
    existing = await prisma.courseInquiry.findFirst({
      where: {
        status: { in: ALIVE_STATUSES },
        courseName: { equals: courseName, mode: 'insensitive' },
        city: { equals: city, mode: 'insensitive' },
        state: { equals: state, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, email: true, builtCourseId: true, firstName: true },
    });
  } catch (err) {
    // REVIEW FIX: an unwrapped query turned the blind 200 into a 500 — a fourth
    // distinguishable response, appearing exactly when the system is least able
    // to cope. The ledger write and the mail send were already guarded; the
    // lookups were not.
    console.error('signin-code lookup failed:', err);
    return blind();
  }

  // No inquiry, not built yet, or the submitter is not using the address on
  // file: nothing is sent and nothing is said. 21c8d25's rule, unchanged.
  if (!existing || !existing.builtCourseId) return blind();

  // REVIEW FIX: per-INQUIRY, not just per-IP. Course name, town and state are
  // public, so with a rotating IP pool the old limit let anyone bury a real
  // inquiry's timeline under thousands of "requested from an email NOT on file"
  // rows — burying the very trace the 30385cd audit asked for — and, knowing the
  // address, send that many real emails from our domain to a real operator.
  // Declining reads as blind, so the cap itself is not an oracle either.
  if (!(await rateLimit(`signin-code-inquiry:${existing.id}`, 3, 3600))) return blind();

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
    return blind();
  }

  const cid = newChallengeId();
  const code = generateCode();
  const token = await signChallenge({ inquiryId: existing.id, cid, codeMac: macCode(cid, code) });

  // To the address ON FILE, never to whatever was typed. They are the same value
  // in the only case that reaches this line, and that is exactly why the stored
  // one is the one to use — the day the check above loosens, this line should not
  // have to be revisited.
  //
  // REVIEW FIX: fired, not awaited, like its sibling in /api/inquiries. Awaiting
  // a live Resend call put hundreds of milliseconds on the success path and none
  // on the declining ones, which is the same oracle again through a slower lens.
  sendInquirySigninCode({
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
