import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canLogIn, signMemberSessionToken } from '@/lib/member-session';
import { checkLoginCode, useLoginCode, hasAgreed, recordAgreement } from '@/lib/member-login-code';
import { termsVersionNow } from '@/lib/terms';
import { securityEvent } from '@/lib/security-events';
import { rateLimit, evidentiaryIp } from '@/lib/rate-limit';

// Log in with a code (Cam 2026-11-18, GOLFER-LOGIN-1). One answer for every wrong case — wrong, expired, used, too
// many tries, never sent, or an email in no group here — so this never says whether an email is on a list. The
// first-log-in terms box is asked for only AFTER a correct code (Build 2026-11-18: the mockup showed it before the
// code, which would have told anyone typing an email that it had logged in before). The code is not used up by that
// answer; the golfer ticks the box and sends the same code again.
const BAD = () => NextResponse.json({ error: 'That code didn’t work. Check it, or send a new one.', code: 'bad_code' }, { status: 400 });

export async function POST(req: NextRequest, { params }: { params: Promise<{ courseSlug: string }> }) {
  const { courseSlug } = await params;
  let body: { email?: unknown; code?: unknown; agreeTerms?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (typeof body.email !== 'string' || !body.email.trim() || typeof body.code !== 'string') return NextResponse.json({ error: 'Enter your email and the 6 digits from the message.' }, { status: 400 });
  const email = body.email.trim().toLowerCase();
  // Not six digits: refused before any try is counted.
  const typed = body.code.replace(/\D/g, '');
  if (typed.length !== 6) return NextResponse.json({ error: 'Enter the 6 digits from the message.', code: 'bad_code' }, { status: 400 });

  const course = await prisma.course.findUnique({ where: { slug: courseSlug }, select: { id: true, active: true, liveStatus: true, timezone: true, hasResidentPricing: true, memberLoginOn: true } });
  if (!course || !course.active || course.liveStatus !== 'live') return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  if (!course.memberLoginOn) return NextResponse.json({ error: 'This course doesn’t offer log-in online.', code: 'login_off' }, { status: 404 });

  const ip = evidentiaryIp(req);
  if (!(await rateLimit(`member-verify-code:ip:${ip}`, 20, 600))) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'member', detail: 'log-in code' });
    return NextResponse.json({ error: 'Too many tries from this connection. Wait a few minutes and try again.' }, { status: 429 });
  }
  // Per address, on top of the code's own 5 tries: answered as a wrong code, so it says nothing about the address.
  if (!(await rateLimit(`member-verify-code:${course.id}:${email}`, 10, 3600))) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'member', email, detail: 'log-in code (per address)' });
    return BAD();
  }

  const checked = await checkLoginCode(course.id, email, typed);
  if (!checked.ok) {
    await securityEvent(req, { kind: 'signin_failed', surface: 'member', email, detail: 'log-in code wrong or expired' });
    return BAD();
  }
  // Still in a group when the code is used (a code is only ever sent to one, but a card can expire in 10 minutes).
  if (!(await canLogIn(course, email))) {
    await useLoginCode(checked.codeId);
    await securityEvent(req, { kind: 'signin_failed', surface: 'member', email, detail: 'not in a group at this course' });
    return BAD();
  }

  const version = await termsVersionNow();
  if (!(await hasAgreed(course.id, email, version))) {
    // No security event here: every ordinary first log-in passes this way, and the resubmit records the outcome
    // (a signin_failed here would make a course's launch day look like an attack to the hourly check).
    if (body.agreeTerms !== true) {
      return NextResponse.json({ error: 'Tick the box to agree before you log in.', code: 'terms_required', termsVersion: version }, { status: 409 });
    }
  }
  if (!(await useLoginCode(checked.codeId))) {
    await securityEvent(req, { kind: 'signin_failed', surface: 'member', email, detail: 'log-in code already used' });
    return BAD();
  }
  if (body.agreeTerms === true) await recordAgreement(course.id, email, version, ip);

  const token = await signMemberSessionToken({ courseId: course.id, email });
  await securityEvent(req, { kind: 'signin_ok', surface: 'member', email, detail: 'log-in code' });
  const res = NextResponse.json({ ok: true });
  res.cookies.set('gr_member', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
  return res;
}
