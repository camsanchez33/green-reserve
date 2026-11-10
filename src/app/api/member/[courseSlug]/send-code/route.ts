import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signMemberMagicToken } from '@/lib/member-session';
import { sendMemberMagicLink } from '@/lib/email';
import { rateLimit, evidentiaryIp } from '@/lib/rate-limit';
import { securityEvent } from '@/lib/security-events';

// SEC lane 2026-11-10 (High): this had no rate limit — anyone could loop a member's address and flood their inbox —
// and a member's answer came after a token sign and an awaited send (slower, and a 500 when the send failed) while a
// non-member's came at once: a membership oracle. Now, as /api/auth/forgot-password: capped per connection and per
// address, and the lookup + send happen in after(), so every caller gets the same immediate answer. A failed send is
// logged, not shown; the person sees the usual "check your email" and can ask again.
const SUCCESS = () => NextResponse.json({ success: true });

async function sendLink(course: { id: string; name: string }, courseSlug: string, email: string) {
  const membership = await prisma.courseMembership.findFirst({
    where: { courseId: course.id, status: 'active', OR: [{ inviteEmail: email }, { golfer: { email } }] },
    include: { golfer: { select: { email: true, firstName: true, lastName: true } } },
  });
  if (!membership) return;
  const memberEmail = membership.golfer?.email ?? membership.inviteEmail;
  const memberName = membership.golfer ? `${membership.golfer.firstName} ${membership.golfer.lastName}` : (membership.inviteName || 'Member');
  const token = await signMemberMagicToken({ membershipId: membership.id, courseId: course.id, email: memberEmail });
  const magicLink = `${process.env.NEXT_PUBLIC_URL}/api/member/${courseSlug}/verify?token=${encodeURIComponent(token)}`;
  await sendMemberMagicLink({ name: memberName, email: memberEmail, courseName: course.name, magicLink });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  const { courseSlug } = await params;
  let rawEmail: unknown;
  try { ({ email: rawEmail } = await req.json()); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  if (!rawEmail || typeof rawEmail !== 'string') return NextResponse.json({ error: 'Email required' }, { status: 400 });
  const email = rawEmail.trim().toLowerCase();

  // Whether a course is live is public (its booking page says so), so this may answer 404.
  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true, name: true, active: true, liveStatus: true },
  });
  if (!course || !course.active || course.liveStatus !== 'live') {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }

  // Per connection: says nothing about any member, so it may say no.
  if (!(await rateLimit(`member-code:ip:${evidentiaryIp(req)}`, 10, 600))) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'member', detail: 'member sign-in link' });
    return NextResponse.json({ error: 'Too many requests from this connection — try again in a few minutes.' }, { status: 429 });
  }
  // Per address: over the cap, answer exactly as if a link went — a different answer would reveal the address.
  if (!(await rateLimit(`member-code:${course.id}:${email}`, 3, 3600))) {
    await securityEvent(req, { kind: 'rate_limited', surface: 'member', detail: 'member sign-in link (per address)' });
    return SUCCESS();
  }

  after(sendLink(course, courseSlug, email).catch(err => console.error(JSON.stringify({ ev: 'member_link.fail', error: err instanceof Error ? err.message : String(err) }))));
  return SUCCESS();
}
