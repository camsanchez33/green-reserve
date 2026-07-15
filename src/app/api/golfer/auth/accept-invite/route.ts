import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyMemberInviteToken, signGolferToken } from '@/lib/auth';

// Lets an operator-added member (no GolferAccount yet) land on the emailed link,
// see what they're setting up, before deciding whether to set a password.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  const payload = await verifyMemberInviteToken(token);
  if (!payload) return NextResponse.json({ error: 'This invite link is invalid or expired.' }, { status: 400 });

  const membership = await prisma.courseMembership.findUnique({
    where: { id: payload.membershipId },
    include: { course: { select: { name: true } }, tier: { select: { name: true } } },
  });
  if (!membership) return NextResponse.json({ error: 'This membership no longer exists.' }, { status: 404 });
  if (membership.inviteAccepted) return NextResponse.json({ error: 'This invite has already been used. Just log in.' }, { status: 409 });

  return NextResponse.json({
    email: payload.email,
    name: membership.inviteName,
    courseName: membership.course.name,
    tierName: membership.tier?.name || membership.membershipType,
  });
}

export async function POST(req: NextRequest) {
  const { token, password, firstName, lastName, phone } = await req.json();
  const payload = await verifyMemberInviteToken(token);
  if (!payload) return NextResponse.json({ error: 'This invite link is invalid or expired.' }, { status: 400 });
  if (!password || password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });

  const membership = await prisma.courseMembership.findUnique({ where: { id: payload.membershipId } });
  if (!membership) return NextResponse.json({ error: 'This membership no longer exists.' }, { status: 404 });
  if (membership.inviteAccepted) return NextResponse.json({ error: 'This invite has already been used. Just log in.' }, { status: 409 });

  // Edge case: they registered a GolferAccount separately between being invited
  // and clicking the link — link to that account instead of creating a duplicate.
  let golfer = await prisma.golferAccount.findUnique({ where: { email: payload.email } });
  if (!golfer) {
    if (!firstName?.trim() || !lastName?.trim()) {
      return NextResponse.json({ error: 'First and last name are required.' }, { status: 400 });
    }
    const hashed = await bcrypt.hash(password, 12);
    try {
      golfer = await prisma.golferAccount.create({
        data: { email: payload.email, password: hashed, firstName: firstName.trim(), lastName: lastName.trim(), phone: phone ? String(phone).trim() : null },
      });
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        return NextResponse.json({ error: 'That phone number is already on another account.' }, { status: 409 });
      }
      throw err;
    }
  }

  await prisma.courseMembership.update({
    where: { id: membership.id },
    data: { golferId: golfer.id, inviteAccepted: true },
  });

  const jwt = await signGolferToken({ golferId: golfer.id, email: golfer.email });
  const res = NextResponse.json({ success: true });
  res.cookies.set('gr_golfer', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 90,
    path: '/',
  });
  return res;
}
