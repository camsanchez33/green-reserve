import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signMemberMagicToken } from '@/lib/member-session';
import { sendMemberMagicLink } from '@/lib/email';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ courseSlug: string }> }
) {
  const { courseSlug } = await params;
  const body = await req.json();
  const rawEmail = body?.email;
  if (!rawEmail) return NextResponse.json({ error: 'Email required' }, { status: 400 });
  const email = String(rawEmail).trim().toLowerCase();

  const course = await prisma.course.findUnique({
    where: { slug: courseSlug },
    select: { id: true, name: true, active: true, liveStatus: true },
  });
  if (!course || !course.active || course.liveStatus !== 'live') {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }

  // Find membership by linked GolferAccount email OR invite email
  const membership = await prisma.courseMembership.findFirst({
    where: {
      courseId: course.id,
      status: 'active',
      OR: [
        { inviteEmail: email },
        { golfer: { email } },
      ],
    },
    include: {
      golfer: { select: { email: true, firstName: true, lastName: true } },
    },
  });

  // Always return 200 — don't reveal whether the email is a member
  if (!membership) {
    return NextResponse.json({ success: true });
  }

  const memberEmail = membership.golfer?.email ?? membership.inviteEmail;
  const memberName = membership.golfer
    ? `${membership.golfer.firstName} ${membership.golfer.lastName}`
    : (membership.inviteName || 'Member');

  const token = await signMemberMagicToken({
    membershipId: membership.id,
    courseId: course.id,
    email: memberEmail,
  });

  const magicLink = `${process.env.NEXT_PUBLIC_URL}/api/member/${courseSlug}/verify?token=${encodeURIComponent(token)}`;

  await sendMemberMagicLink({
    name: memberName,
    email: memberEmail,
    courseName: course.name,
    magicLink,
  });

  return NextResponse.json({ success: true });
}
