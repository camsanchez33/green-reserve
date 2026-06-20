import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { signMemberInviteToken } from '@/lib/auth';
import { sendMemberInviteEmail, sendMemberLinkedNotification } from '@/lib/email';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberships = await prisma.courseMembership.findMany({
    where: { courseId: session.courseId },
    include: {
      golfer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      tier:   { select: { id: true, name: true, color: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const normalized = memberships.map(m => ({
    id:             m.id,
    golferId:       m.golferId,
    name:           m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}`.trim() : m.inviteName,
    email:          m.golfer?.email ?? m.inviteEmail,
    phone:          m.golfer?.phone ?? m.invitePhone,
    tierId:         m.tierId,
    tierName:       m.tier?.name ?? m.membershipType,
    tierColor:      m.tier?.color ?? '#6b7280',
    status:         m.status,
    inviteAccepted: m.inviteAccepted,
    expiresAt:      m.expiresAt,
    notes:          m.notes,
    createdAt:      m.createdAt,
    linked:         !!m.golferId,
  }));

  return NextResponse.json(normalized);
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { email, name, phone, tierId, notes, expiresAt } = body;

  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  if (!tierId)        return NextResponse.json({ error: 'Tier is required' }, { status: 400 });

  const tier = await prisma.membershipTier.findUnique({ where: { id: tierId } });
  if (!tier || tier.courseId !== session.courseId) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }

  const lowerEmail = email.trim().toLowerCase();
  const golfer = await prisma.golferAccount.findUnique({ where: { email: lowerEmail } });

  if (golfer) {
    const existing = await prisma.courseMembership.findUnique({
      where: { golferId_courseId: { golferId: golfer.id, courseId: session.courseId } },
    });
    if (existing) {
      return NextResponse.json({ error: `${email} is already a member of this course` }, { status: 409 });
    }
    const membership = await prisma.courseMembership.create({
      data: {
        courseId:       session.courseId,
        golferId:       golfer.id,
        tierId,
        membershipType: tier.name,
        status:         'active',
        addedBy:        'operator',
        notes:          notes || '',
        expiresAt:      expiresAt ? new Date(expiresAt) : null,
        inviteEmail:    lowerEmail,
        inviteName:     name || `${golfer.firstName} ${golfer.lastName}`,
        invitePhone:    phone || golfer.phone,
        inviteAccepted: true,
      },
      include: {
        golfer: { select: { firstName: true, lastName: true, email: true, phone: true } },
        tier:   { select: { id: true, name: true, color: true } },
      },
    });

    // Existing golfer account — just let them know, no password setup needed.
    const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true } });
    sendMemberLinkedNotification({
      name: membership.golfer ? `${membership.golfer.firstName} ${membership.golfer.lastName}`.trim() : (name || ''),
      email: lowerEmail,
      courseName: course?.name || 'your course',
      tierName: tier.name,
    }).catch(err => console.error('Member linked email error:', err));

    return NextResponse.json({ ...membership, linked: true }, { status: 201 });
  } else {
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required for members without an existing account' }, { status: 400 });
    }
    const existingInvite = await prisma.courseMembership.findFirst({
      where: { courseId: session.courseId, inviteEmail: lowerEmail },
    });
    if (existingInvite) {
      return NextResponse.json({ error: `${email} already has a pending membership` }, { status: 409 });
    }
    const membership = await prisma.courseMembership.create({
      data: {
        courseId:       session.courseId,
        golferId:       null,
        tierId,
        membershipType: tier.name,
        status:         'active',
        addedBy:        'operator',
        notes:          notes || '',
        expiresAt:      expiresAt ? new Date(expiresAt) : null,
        inviteEmail:    lowerEmail,
        inviteName:     name.trim(),
        invitePhone:    phone || '',
        inviteAccepted: false,
      },
      include: { tier: { select: { id: true, name: true, color: true } } },
    });

    // No GolferAccount yet — send a set-password invite link.
    const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true } });
    const token = await signMemberInviteToken({ membershipId: membership.id, email: lowerEmail });
    sendMemberInviteEmail({
      name: name.trim(),
      email: lowerEmail,
      courseName: course?.name || 'your course',
      tierName: tier.name,
      setupLink: `${process.env.NEXT_PUBLIC_URL}/account/accept-invite?token=${token}`,
    }).catch(err => console.error('Member invite email error:', err));

    return NextResponse.json({ ...membership, linked: false }, { status: 201 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, tierId, status, notes, expiresAt } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const membership = await prisma.courseMembership.findUnique({ where: { id } });
  if (!membership || membership.courseId !== session.courseId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (tierId) {
    const tier = await prisma.membershipTier.findUnique({ where: { id: tierId } });
    if (!tier || tier.courseId !== session.courseId) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }
  }

  const updated = await prisma.courseMembership.update({
    where: { id },
    data: {
      tierId:    tierId    ?? membership.tierId,
      status:    status    ?? membership.status,
      notes:     notes     ?? membership.notes,
      expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : membership.expiresAt,
    },
    include: {
      golfer: { select: { firstName: true, lastName: true, email: true, phone: true } },
      tier:   { select: { id: true, name: true, color: true } },
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const membership = await prisma.courseMembership.findUnique({ where: { id } });
  if (!membership || membership.courseId !== session.courseId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.courseMembership.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
