import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { randomUUID } from 'crypto';
import { signMemberInviteToken } from '@/lib/auth';
import { sendMemberInviteEmail, sendMemberLinkedNotification, sendMembershipPaymentLinkEmail } from '@/lib/email';

/** Send the dues payment link if the tier actually costs money and Stripe is connected. */
async function maybeSendPayLink(membershipId: string, isRenewal = false) {
  const m = await prisma.courseMembership.findUnique({
    where: { id: membershipId },
    include: { tier: true, course: { select: { name: true, stripeAccountActive: true } } },
  });
  if (!m || !m.tier) return;
  const initiation = m.lastPaidAt ? 0 : m.tier.initiationFee;
  if (m.tier.annualFee + initiation <= 0) return;
  if (!m.course.stripeAccountActive) return;
  await sendMembershipPaymentLinkEmail({
    name: m.inviteName,
    email: m.inviteEmail,
    courseName: m.course.name,
    tierName: m.tier.name,
    annualFee: m.tier.annualFee,
    initiationFee: initiation,
    payLink: `${process.env.NEXT_PUBLIC_URL}/membership/${m.id}?token=${m.payToken}`,
    isRenewal,
  });
}

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberships = await prisma.courseMembership.findMany({
    where: { courseId: session.courseId },
    include: {
      golfer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      tier:   { select: { id: true, name: true, color: true, annualFee: true, initiationFee: true, termMonths: true } },
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
    startedAt:      m.startedAt,
    paymentStatus:  m.paymentStatus,
    lastPaidAt:     m.lastPaidAt,
    annualFee:      m.tier?.annualFee ?? 0,
    initiationFee:  m.tier?.initiationFee ?? 0,
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
        invitePhone:    phone || golfer.phone || '',
        inviteAccepted: true,
        payToken:       randomUUID(),
      },
      include: {
        golfer: { select: { firstName: true, lastName: true, email: true, phone: true } },
        tier:   { select: { id: true, name: true, color: true } },
      },
    });

    // Existing golfer account — just let them know, no password setup needed.
    const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true, slug: true } });
    sendMemberLinkedNotification({
      name: membership.golfer ? `${membership.golfer.firstName} ${membership.golfer.lastName}`.trim() : (name || ''),
      email: lowerEmail,
      courseName: course?.name || 'your course',
      courseSlug: course?.slug,
      tierName: tier.name,
    }).catch(err => console.error('Member linked email error:', err));
    maybeSendPayLink(membership.id).catch(err => console.error('Pay link email error:', err));

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
        payToken:       randomUUID(),
      },
      include: { tier: { select: { id: true, name: true, color: true } } },
    });

    // No GolferAccount yet — send a set-password invite link.
    const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true, slug: true } });
    const token = await signMemberInviteToken({ membershipId: membership.id, email: lowerEmail });
    sendMemberInviteEmail({
      name: name.trim(),
      email: lowerEmail,
      courseName: course?.name || 'your course',
      tierName: tier.name,
      setupLink: `${process.env.NEXT_PUBLIC_URL}/courses/${course?.slug}/account/accept-invite?token=${token}`,
    }).catch(err => console.error('Member invite email error:', err));
    maybeSendPayLink(membership.id).catch(err => console.error('Pay link email error:', err));

    return NextResponse.json({ ...membership, linked: false }, { status: 201 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, tierId, status, notes, expiresAt, action } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const membership = await prisma.courseMembership.findUnique({ where: { id }, include: { tier: true } });
  if (!membership || membership.courseId !== session.courseId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Staff actions
  if (action === 'mark_paid') {
    // Cash/check at the pro shop — record it, no charge made.
    const termMonths = membership.tier?.termMonths ?? 12;
    const base = membership.expiresAt && membership.expiresAt.getTime() > Date.now() ? new Date(membership.expiresAt) : new Date();
    const newExpiry = new Date(base);
    newExpiry.setMonth(newExpiry.getMonth() + termMonths);
    const updated = await prisma.courseMembership.update({
      where: { id },
      data: {
        paymentStatus: 'paid_offline',
        status: 'active',
        startedAt: membership.startedAt ?? new Date(),
        lastPaidAt: new Date(),
        expiresAt: newExpiry,
        renewalRemindedAt: null,
      },
      include: {
        golfer: { select: { firstName: true, lastName: true, email: true, phone: true } },
        tier:   { select: { id: true, name: true, color: true } },
      },
    });
    return NextResponse.json(updated);
  }
  if (action === 'send_pay_link') {
    const isRenewal = !!membership.lastPaidAt;
    try {
      await maybeSendPayLink(id, isRenewal);
    } catch (err) {
      console.error('Pay link email error:', err);
      return NextResponse.json({ error: 'Could not send the payment email.' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
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
