import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signMemberMagicToken, canLogIn } from '@/lib/member-session';
import { sendMemberMagicLink, sendMemberLoginCode } from '@/lib/email';
import { issueLoginCode } from '@/lib/member-login-code';
import { rateLimit, evidentiaryIp } from '@/lib/rate-limit';
import { securityEvent } from '@/lib/security-events';

// SEC lane 2026-11-10 (High): this had no rate limit — anyone could loop a member's address and flood their inbox —
// and a member's answer came after a token sign and an awaited send (slower, and a 500 when the send failed) while a
// non-member's came at once: a membership oracle. Now, as /api/auth/forgot-password: capped per connection and per
// address, and the lookup + send happen in after(), so every caller gets the same immediate answer. A failed send is
// logged, not shown; the person sees the usual "check your email" and can ask again.
const SUCCESS = () => NextResponse.json({ success: true });

// Residents log in (Cam 2026-11-18): anyone in one of the course's groups gets the link — an active member here, or a
// resident card good today here or in the course's group (lib/member-session canLogIn).
async function sendLink(course: { id: string; name: string; timezone: string | null; hasResidentPricing: boolean }, courseSlug: string, email: string) {
  const who = await canLogIn(course, email);
  if (!who) return;
  const token = await signMemberMagicToken({ courseId: course.id, email });
  const magicLink = `${process.env.NEXT_PUBLIC_URL}/api/member/${courseSlug}/verify?token=${encodeURIComponent(token)}`;
  await sendMemberMagicLink({ name: who.name, email, courseName: course.name, courseId: course.id, magicLink });
}

// Log in with a code (GOLFER-LOGIN-1, Cam 2026-11-18): the same check, then a 6-digit code (lib/member-login-code)
// that works for 10 minutes. Typed back on POST /api/member/[courseSlug]/verify-code.
async function sendCode(course: { id: string; name: string; timezone: string | null; hasResidentPricing: boolean }, email: string) {
  if (!(await canLogIn(course, email))) return;
  const code = await issueLoginCode(course.id, email);
  await sendMemberLoginCode({ email, courseName: course.name, courseId: course.id, code });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  const { courseSlug } = await params;
  let rawEmail: unknown, rawMode: unknown;
  try { ({ email: rawEmail, mode: rawMode } = await req.json()); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  // mode 'code' (the approved Log in screen); anything else is the emailed link, until the golfer page moves over.
  const byCode = rawMode === 'code';
  if (!rawEmail || typeof rawEmail !== 'string') return NextResponse.json({ error: 'Email required' }, { status: 400 });
  const email = rawEmail.trim().toLowerCase();

  // Whether a course is live is public (its booking page says so), so this may answer 404.
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true, name: true, active: true, liveStatus: true, timezone: true, hasResidentPricing: true, memberLoginOn: true },
  });
  if (!course || !course.active || course.liveStatus !== 'live') {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }
  // The course's own switch (Settings "Show Log in on your booking page"); public, so it may say so.
  if (!course.memberLoginOn) return NextResponse.json({ error: 'This course doesn\u2019t offer log-in online.', code: 'login_off' }, { status: 404 });

  // Per connection: says nothing about any member, so it may say no.
  if (!(await rateLimit(`member-code:ip:${evidentiaryIp(req)}`, 10, 600))) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'member', detail: 'member sign-in link' });
    return NextResponse.json({ error: 'Too many requests from this connection — try again in a few minutes.' }, { status: 429 });
  }
  // Per address: over the cap, answer exactly as if a link went — a different answer would reveal the address.
  if (!(await rateLimit(`member-code:${course.id}:${email}`, byCode ? 5 : 3, 3600))) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'member', email, detail: byCode ? 'log-in code (per address)' : 'member sign-in link (per address)' });
    return SUCCESS();
  }

  if (byCode) {
    after(sendCode(course, email).catch(err => console.error(JSON.stringify({ ev: 'member_code.fail', error: err instanceof Error ? err.message : String(err) }))));
    return SUCCESS();
  }
  after(sendLink(course, courseSlug, email).catch(err => console.error(JSON.stringify({ ev: 'member_link.fail', error: err instanceof Error ? err.message : String(err) }))));
  return SUCCESS();
}
