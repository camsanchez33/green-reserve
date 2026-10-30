import { NextRequest, NextResponse, after } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { todayIn } from '@/lib/course-time';
import { memberRoundStats } from '@/lib/member-stats';
import { randomUUID } from 'crypto';
import { signMemberInviteToken } from '@/lib/auth';
import { recordMove } from '@/lib/money-ledger';
import { sendMemberInviteEmail, sendMemberLinkedNotification, sendMembershipPaymentLinkEmail } from '@/lib/email';

/**
 * Send the dues payment link if the tier actually costs money and Stripe is connected.
 * Says why when it didn't (dead end 21: the staff button must never report a send that didn't happen).
 */
async function maybeSendPayLink(membershipId: string, isRenewal = false): Promise<'sent' | 'no_tier' | 'no_email' | 'nothing_owed' | 'no_stripe'> {
  const m = await prisma.courseMembership.findUnique({
    where: { id: membershipId },
    include: { tier: true, course: { select: { name: true, stripeAccountActive: true } }, golfer: { select: { email: true, firstName: true, lastName: true } } },
  });
  if (!m || !m.tier) return 'no_tier';
  // The account's email wins over the invite address (a self-joined member has no invite address).
  const to = m.golfer?.email || m.inviteEmail;
  if (!to) return 'no_email';
  // MP-3 B2a: compare in cents, convert to dollars only for the email, which
  // renders $${annualFee.toFixed(2)}.
  const initiationCents = m.lastPaidAt || m.initiationWaived ? 0 : m.tier.initiationFeeCents;
  if (m.tier.annualFeeCents + initiationCents <= 0) return 'nothing_owed';
  if (!m.course.stripeAccountActive) return 'no_stripe';
  await sendMembershipPaymentLinkEmail({
    name: m.inviteName || [m.golfer?.firstName, m.golfer?.lastName].filter(Boolean).join(' '),
    email: to,
    courseName: m.course.name,
    tierName: m.tier.name,
    annualFee: centsToDollarsOr0(m.tier.annualFeeCents),
    initiationFee: centsToDollarsOr0(initiationCents),
    payLink: `${process.env.NEXT_PUBLIC_URL}/membership/${m.id}?token=${m.payToken}`,
    isRenewal,
  });
  return 'sent';
}

const NOT_SENT: Record<Exclude<Awaited<ReturnType<typeof maybeSendPayLink>>, 'sent'>, string> = {
  no_tier: 'Put them on a membership first — the link is for its dues.',
  no_email: 'They have no email on file — add one with Edit details.',
  nothing_owed: 'Their membership costs nothing, so there is no link to send.',
  no_stripe: 'Connect Stripe first — the link takes a payment, and there is nowhere for the money to go yet.',
};

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'members.view'); if (denied) return denied; } // SP-A

  const memberships = await prisma.courseMembership.findMany({
    where: { courseId: session.courseId },
    include: {
      golfer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      tier:   { select: { id: true, name: true, color: true, annualFeeCents: true, initiationFeeCents: true, termMonths: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Cam 2026-10-19: each member's last round here; DENSE-5 (Cam 2026-10-28): rounds and
  // spend since January 1 of the course's year, and the members' rounds in all (lib/member-stats).
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true } });
  const yearStart = `${todayIn(course?.timezone).slice(0, 4)}-01-01`;
  const stats = await memberRoundStats(session.courseId,
    memberships.map(m => ({ id: m.id, keys: [m.golferId ?? '', m.inviteEmail, m.golfer?.email ?? ''] })),
    yearStart, can(session, 'money.payments'));

  const normalized = memberships.map(m => { const st = stats.byMember.get(m.id); return {
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
    annualFee:      centsToDollarsOr0(m.tier?.annualFeeCents),
    initiationFee:  centsToDollarsOr0(m.tier?.initiationFeeCents),
    notes:          m.notes,
    createdAt:      m.createdAt,
    linked:         !!m.golferId,
    lastRound:      st?.lastRound ?? null,
    initiationWaived: m.initiationWaived,
    roundsThisYear: st?.roundsThisYear ?? 0,
    spendThisYearCents: st?.spendThisYearCents ?? null,
  }; });

  return NextResponse.json({ members: normalized, roundsThisYear: stats.roundsThisYear });
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'members.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

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
    after(sendMemberLinkedNotification({
      name: membership.golfer ? `${membership.golfer.firstName} ${membership.golfer.lastName}`.trim() : (name || ''),
      email: lowerEmail,
      courseName: course?.name || 'your course',
      courseSlug: course?.slug,
      tierName: tier.name,
    }).catch(err => console.error('Member linked email error:', err)));
    after(maybeSendPayLink(membership.id).catch(err => console.error('Pay link email error:', err)));

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
    after(sendMemberInviteEmail({
      name: name.trim(),
      email: lowerEmail,
      courseName: course?.name || 'your course',
      tierName: tier.name,
      setupLink: `${process.env.NEXT_PUBLIC_URL}/courses/${course?.slug}/account/accept-invite?token=${token}`,
    }).catch(err => console.error('Member invite email error:', err)));
    after(maybeSendPayLink(membership.id).catch(err => console.error('Pay link email error:', err)));

    return NextResponse.json({ ...membership, linked: false }, { status: 201 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'members.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const body = await req.json();
  const { id, tierId, status, notes, expiresAt, action } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  if (expiresAt && (typeof expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(expiresAt) || Number.isNaN(Date.parse(expiresAt)))) return NextResponse.json({ error: 'Pick the date it runs until, or leave it blank.' }, { status: 400 });

  const membership = await prisma.courseMembership.findUnique({ where: { id }, include: { tier: true } });
  if (!membership || membership.courseId !== session.courseId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Staff actions
  if (action === 'mark_paid') {
    // Cash/check at the pro shop — record it, no charge made.
    const termMonths = membership.tier?.termMonths ?? 12;
    // A first payment starts today; only a renewal extends from the end date (Cam 2026-10-29).
    const base = membership.lastPaidAt && membership.expiresAt && membership.expiresAt.getTime() > Date.now() ? new Date(membership.expiresAt) : new Date();
    const newExpiry = new Date(base);
    newExpiry.setMonth(newExpiry.getMonth() + termMonths);
    // LEDGER-2 (Cam 2026-10-30, "Amount + cash or check"): what staff actually took, and how.
    // Without an amount (an older screen) it is what was due — this term, initiation on a first payment.
    const dueCents = (membership.tier?.annualFeeCents ?? 0) + (membership.lastPaidAt || membership.initiationWaived ? 0 : (membership.tier?.initiationFeeCents ?? 0));
    const takenCents = body.amountCents === undefined || body.amountCents === null || body.amountCents === '' ? dueCents : Number(body.amountCents);
    if (!Number.isInteger(takenCents) || takenCents < 0 || takenCents > 10_000_000) return NextResponse.json({ error: 'Enter the amount taken (up to $100,000).' }, { status: 400 });
    const method = body.method === 'check' ? 'check' : body.method === 'cash' || body.method === undefined ? 'cash' : null;
    if (!method) return NextResponse.json({ error: 'Say whether it was cash or a check.' }, { status: 400 });
    await recordMove({ courseId: session.courseId, what: 'dues', direction: 'in', method: method === 'cash' ? 'cash' : 'other', account: 'course', amountCents: takenCents, membershipId: id, actor: 'staff', note: method === 'check' ? 'check at the course' : 'cash at the course' });
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
    let sent: Awaited<ReturnType<typeof maybeSendPayLink>>;
    try {
      sent = await maybeSendPayLink(id, isRenewal);
    } catch (err) {
      console.error('Pay link email error:', err);
      return NextResponse.json({ error: 'Could not send the payment email.' }, { status: 500 });
    }
    if (sent !== 'sent') return NextResponse.json({ error: NOT_SENT[sent] }, { status: 409 });
    return NextResponse.json({ success: true });
  }

  // Revamp 3 dead end 21: a member's details can be edited after they're added. A linked
  // golfer account owns its own name, email and phone; only an invite's are edited here.
  const contact: { inviteName?: string; inviteEmail?: string; invitePhone?: string } = {};
  if (body.name !== undefined || body.email !== undefined || body.phone !== undefined) {
    if (membership.golferId) return NextResponse.json({ error: 'This member signs in with their own account — their name, email and phone are theirs to change.' }, { status: 409 });
    if (body.name !== undefined) { const n = String(body.name ?? '').trim().slice(0, 120); if (!n) return NextResponse.json({ error: 'Add the member’s name.' }, { status: 400 }); contact.inviteName = n; }
    if (body.email !== undefined) {
      const e = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
      if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return NextResponse.json({ error: 'That email address doesn’t look right.' }, { status: 400 });
      if (e && e !== membership.inviteEmail.toLowerCase() && await prisma.courseMembership.findFirst({ where: { courseId: session.courseId, id: { not: id }, inviteEmail: { equals: e, mode: 'insensitive' } }, select: { id: true } })) return NextResponse.json({ error: 'Another member already uses that email.' }, { status: 409 });
      contact.inviteEmail = e;
    }
    if (body.phone !== undefined) contact.invitePhone = String(body.phone ?? '').trim().slice(0, 30);
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
      ...contact,
      // A golfer's self-join has no pay link yet (api/golfer/memberships). Once
      // staff put it on a tier, it can owe dues — mint the token so the pay
      // link, the overdue reminder and the dues cron all reach it.
      ...(!membership.payToken && (tierId ?? membership.tierId) ? { payToken: randomUUID() } : {}),
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
  { const denied = requirePermission(session, 'members.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

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
