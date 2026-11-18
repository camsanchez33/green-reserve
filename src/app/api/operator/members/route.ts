import { NextRequest, NextResponse, after } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { todayIn } from '@/lib/course-time';
import { memberRoundStats } from '@/lib/member-stats';
import { randomUUID } from 'crypto';
import { markDuesPaidAtCourse, amountsDue, removeUnpaidMembership } from '@/lib/membership-dues';
import { requireRegisterOpen } from '@/lib/register-open';
import { duesThisYear } from '@/lib/dues-year';
import { assignMemberNumber, nextMemberNumber } from '@/lib/member-number';
import { del } from '@vercel/blob';
import { privateBlobToken, isBlobStoreUrl } from '@/lib/private-blob';
import { settleStaleDuesReader } from '@/lib/dues-reader';
import { sendWelcome, COUNTER_ADDED } from '@/lib/member-welcome';
import { sendAutoRenewOffEmail } from '@/lib/email';
import { maybeSendPayLink, NOT_SENT } from '@/lib/membership-pay-link';
import { stopAutoRenew, STOP_DATA, memberContact } from '@/lib/membership-autorenew';
import { ciEquals } from '@/lib/like-exact';

/** Memberships item 2: a whole membership row as a response — never where the photo is stored, only whether there is one. */
function safeRow<T extends { photoUrl?: string }>(row: T): Omit<T, 'photoUrl'> & { hasPhoto: boolean } {
  const { photoUrl, ...rest } = row;
  return { ...rest, hasPhoto: !!photoUrl };
}

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'members.view'); if (denied) return denied; } // SP-A

  // Memberships item 2: the add form's "Made for them automatically" — the number the next member on this tier gets.
  const nextFor = req.nextUrl.searchParams.get('nextNumber');
  if (nextFor) {
    const next = await nextMemberNumber(session.courseId, nextFor);
    if (!next) return NextResponse.json({ error: 'Invalid tier' }, { status: 404 });
    return NextResponse.json({ nextNumber: next });
  }

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
    // GOLFER-LOGIN-1: the member's own contact (staff edit it, and its email is the one that logs in); an older
    // linked account's only where none was ever typed.
    name:           m.inviteName || (m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}`.trim() : ''),
    email:          m.inviteEmail || m.golfer?.email || '',
    phone:          m.invitePhone || m.golfer?.phone || '',
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
    autoRenew:      m.autoRenew,
    // Memberships item 2: the member number, and whether there is a photo (served by /api/operator/members/photo — never its address).
    memberNumber:   m.memberNumber,
    hasPhoto:       !!m.photoUrl,
    roundsThisYear: st?.roundsThisYear ?? 0,
    spendThisYearCents: st?.spendThisYearCents ?? null,
  }; });

  // Memberships page: dues collected this year by membership (money — shown only with money.payments, as spend is).
  const dues = can(session, 'money.payments') ? await duesThisYear(session.courseId, course?.timezone) : null;

  return NextResponse.json({ members: normalized, roundsThisYear: stats.roundsThisYear, duesThisYear: dues });
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'members.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const body = await req.json();
  const { email, name, phone, tierId, notes, expiresAt } = body;
  // Memberships item 1 (Cam 2026-11-16, "they are a member only once paid"): the add-a-member flow takes the payment
  // first. The membership waits as 'awaiting_payment' (no member rates, lib/member-rates) and no email goes out until
  // the dues are paid on /api/operator/members/pay — or at once when the tier has nothing to pay.
  const payFirst = body.payFirst === true;

  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  if (!tierId)        return NextResponse.json({ error: 'Tier is required' }, { status: 400 });

  const tier = await prisma.membershipTier.findUnique({ where: { id: tierId } });
  if (!tier || tier.courseId !== session.courseId || !tier.active) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }

  const lowerEmail = email.trim().toLowerCase();
  const golfer = await prisma.golferAccount.findUnique({ where: { email: lowerEmail } });
  const owes = amountsDue({ lastPaidAt: null, initiationWaived: false, tier }).duesCents > 0;
  const waiting = payFirst && owes;
  const startStatus = waiting ? 'awaiting_payment' : 'active';
  const addedBy = payFirst ? COUNTER_ADDED : 'operator';

  // An add at the counter that was never paid (the customer walked away, the card failed) is picked up again rather
  // than refused as a duplicate: same person, the tier and details as now entered.
  if (payFirst) {
    const unpaid = await prisma.courseMembership.findFirst({
      where: { courseId: session.courseId, addedBy: COUNTER_ADDED, status: { in: ['awaiting_payment', 'cancelled'] }, lastPaidAt: null, duesChargeStartedAt: null, duesReaderId: '', OR: [{ inviteEmail: ciEquals(lowerEmail) }, ...(golfer ? [{ inviteEmail: '', golferId: golfer.id }] : [])] },
      select: { id: true, golferId: true },
    });
    if (unpaid) {
      const again = await prisma.courseMembership.update({
        where: { id: unpaid.id },
        data: { tierId, membershipType: tier.name, notes: notes || '', ...(unpaid.golferId ? {} : { inviteName: String(name ?? '').trim().slice(0, 120) || undefined, invitePhone: String(phone ?? '').trim().slice(0, 30) }), status: owes ? 'awaiting_payment' : 'active' },
        include: { tier: { select: { id: true, name: true, color: true } } },
      });
      if (!owes) after(sendWelcome(again.id).catch(err => console.error('Member welcome email error:', err)));
      return NextResponse.json({ ...safeRow(again), memberNumber: await assignMemberNumber(again.id), linked: !!again.golferId, awaitingPayment: owes }, { status: 200 });
    }
  }

  if (golfer) {
    const existing = await prisma.courseMembership.findUnique({
      where: { golferId_courseId: { golferId: golfer.id, courseId: session.courseId } },
    });
    if (existing) {
      return NextResponse.json({ error: `${email} is already a member of this course` }, { status: 409 });
    }
    // GOLFER-LOGIN-1: the email that logs in is the membership's own; never let two memberships share it.
    if (await prisma.courseMembership.findFirst({ where: { courseId: session.courseId, OR: [{ inviteEmail: ciEquals(lowerEmail) }, { inviteEmail: '', golfer: { email: ciEquals(lowerEmail) } }] }, select: { id: true } })) {
      return NextResponse.json({ error: `${email} already has a membership here` }, { status: 409 });
    }
    const membership = await prisma.courseMembership.create({
      data: {
        courseId:       session.courseId,
        golferId:       golfer.id,
        tierId,
        membershipType: tier.name,
        status:         startStatus,
        addedBy,
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

    // Existing golfer account — just let them know, no password setup needed (after paying, when paying first).
    if (!waiting) after(sendWelcome(membership.id).catch(err => console.error('Member linked email error:', err)));
    if (!payFirst) after(maybeSendPayLink(membership.id).catch(err => console.error('Pay link email error:', err)));

    return NextResponse.json({ ...safeRow(membership), memberNumber: await assignMemberNumber(membership.id), linked: true, awaitingPayment: waiting }, { status: 201 });
  } else {
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required for members without an existing account' }, { status: 400 });
    }
    const existingInvite = await prisma.courseMembership.findFirst({
      where: { courseId: session.courseId, OR: [{ inviteEmail: ciEquals(lowerEmail) }, { inviteEmail: '', golfer: { email: ciEquals(lowerEmail) } }] },
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
        status:         startStatus,
        addedBy,
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

    // No GolferAccount yet — send a set-password invite link (after paying, when paying first).
    if (!waiting) after(sendWelcome(membership.id).catch(err => console.error('Member invite email error:', err)));
    if (!payFirst) after(maybeSendPayLink(membership.id).catch(err => console.error('Pay link email error:', err)));

    return NextResponse.json({ ...safeRow(membership), memberNumber: await assignMemberNumber(membership.id), linked: false, awaitingPayment: waiting }, { status: 201 });
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
    // Cash/check at the pro shop — record it, no charge made (lib/membership-dues markDuesPaidAtCourse).
    // Memberships item 1 / DRAWER-1 (Cam 2026-11-16): dues cash goes in the drawer, so only while the register is open;
    // it is counted in the close-out's expected cash (lib/register-close, other cash). A check is not drawer cash.
    if (body.method !== 'check') { const closed = await requireRegisterOpen(session.courseId); if (closed) return NextResponse.json({ error: closed, registerClosed: true }, { status: 409 }); }
    await settleStaleDuesReader(membership);
    const r = await markDuesPaidAtCourse(session.courseId, id, { amountCents: body.amountCents, method: body.method });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    if (!membership.lastPaidAt && membership.addedBy === COUNTER_ADDED) after(sendWelcome(id).catch(err => console.error('Member welcome email error:', err)));
    const updated = await prisma.courseMembership.findUniqueOrThrow({
      where: { id },
      include: {
        golfer: { select: { firstName: true, lastName: true, email: true, phone: true } },
        tier:   { select: { id: true, name: true, color: true } },
      },
    });
    return NextResponse.json(safeRow(updated));
  }
  // Not paid yet → Remove (a member added at the counter who never paid). Join online and its approve/decline are
  // gone for good (GOLFER-SIGNIN-RETIRED, Cam 2026-11-18).
  if (action === 'remove_unpaid') {
    const r = await removeUnpaidMembership(session.courseId, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ success: true });
  }
  // MEM-RENEW: staff can turn a member's automatic renewal off (never on — only the golfer agrees to it).
  if (action === 'stop_auto_renew') {
    if (!(await stopAutoRenew(id, session.courseId))) return NextResponse.json({ error: 'Automatic renewal is already off.' }, { status: 409 });
    return NextResponse.json({ success: true });
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

  // Revamp 3 dead end 21: a member's details can be edited after they're added. GOLFER-LOGIN-1 (Cam 2026-11-18): no
  // golfer account signs in now, so a member linked to an older account is edited here too; the member's own email
  // (inviteEmail) is the one that logs in (lib/member-session).
  const contact: { inviteName?: string; inviteEmail?: string; invitePhone?: string } = {};
  if (body.name !== undefined || body.email !== undefined || body.phone !== undefined) {
    if (body.name !== undefined) { const n = String(body.name ?? '').trim().slice(0, 120); if (!n) return NextResponse.json({ error: 'Add the member’s name.' }, { status: 400 }); contact.inviteName = n; }
    if (body.email !== undefined) {
      const e = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
      if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return NextResponse.json({ error: 'That email address doesn’t look right.' }, { status: 400 });
      // A linked member can't be left without an email: the account's no longer logs in once one was typed.
      if (!e && membership.golferId) return NextResponse.json({ error: 'Add the member’s email.' }, { status: 400 });
      if (e && e !== membership.inviteEmail.toLowerCase() && await prisma.courseMembership.findFirst({ where: { courseId: session.courseId, id: { not: id }, OR: [{ inviteEmail: ciEquals(e) }, { inviteEmail: '', golfer: { email: ciEquals(e) } }] }, select: { id: true } })) return NextResponse.json({ error: 'Another member already uses that email.' }, { status: 409 });
      contact.inviteEmail = e;
    }
    if (body.phone !== undefined) contact.invitePhone = String(body.phone ?? '').trim().slice(0, 30);
  }

  // Memberships item 1: a status change waits while the dues are being paid (a card going through, the card reader).
  if (status !== undefined && status !== membership.status && (membership.duesReaderId || (membership.duesChargeStartedAt && Date.now() - membership.duesChargeStartedAt.getTime() < 10 * 60_000))) {
    return NextResponse.json({ error: 'These dues are being paid right now — finish or cancel the payment first.' }, { status: 409 });
  }

  if (tierId) {
    const tier = await prisma.membershipTier.findUnique({ where: { id: tierId } });
    if (!tier || tier.courseId !== session.courseId || !tier.active) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }
  }
  // MEM-RENEW: the golfer agreed to renew THIS tier at its price. On another tier automatic renewal
  // stops (they're told); they agree again if they pay on a tier that renews automatically.
  if (tierId && tierId !== membership.tierId && membership.autoRenew) {
    await prisma.courseMembership.updateMany({ where: { id, autoRenew: true }, data: STOP_DATA() });
    const who = await prisma.courseMembership.findUnique({ where: { id }, select: { inviteName: true, inviteEmail: true, expiresAt: true, golfer: { select: { email: true, firstName: true, lastName: true } }, course: { select: { name: true } } } });
    const to = who ? memberContact(who) : null;
    if (who && to?.email) {
      try { await sendAutoRenewOffEmail({ name: to.name, email: to.email, courseName: who.course.name, tierName: membership.tier?.name ?? 'membership', endsOn: who.expiresAt }); }
      catch (err) { console.error(JSON.stringify({ ev: 'membership.autorenew.tier_change_email_fail', membershipId: id, error: err instanceof Error ? err.message : String(err) })); }
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
      // An older golfer self-join (retired 2026-11-18) has no pay link yet. Once
      // staff put it on a tier, it can owe dues — mint the token so the pay
      // link, the overdue reminder and the dues cron all reach it.
      ...(!membership.payToken && (tierId ?? membership.tierId) ? { payToken: randomUUID() } : {}),
    },
    include: {
      golfer: { select: { firstName: true, lastName: true, email: true, phone: true } },
      tier:   { select: { id: true, name: true, color: true } },
    },
  });
  // Memberships item 2: a request put on its first membership gets its number now (a member keeps theirs on a change;
  // members from before numbers are not given one by an edit — no backfill; a request waits for approval).
  const memberNumber = updated.memberNumber ?? (!membership.tierId && updated.tierId && updated.status !== 'requested' ? await assignMemberNumber(updated.id) : null);
  return NextResponse.json(safeRow({ ...updated, memberNumber }));
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

  // Members audit 10 (archive, never delete): removing a membership cascades its account lines and statements
  // away, so only one with no history (added by mistake) can go. Anyone else is set to Not active, which keeps
  // their dues, account and statements.
  const [charges, statements, moves] = await Promise.all([
    prisma.memberCharge.count({ where: { membershipId: id } }),
    prisma.memberStatement.count({ where: { membershipId: id } }),
    prisma.moneyMove.count({ where: { membershipId: id } }),
  ]);
  // A dues charge in flight counts too: removing mid-charge would take the money for a membership that's gone.
  if (charges || statements || moves || membership.lastPaidAt || membership.duesChargeStartedAt || membership.duesIntentId) {
    return NextResponse.json({ error: 'This member has dues or account history, so they can’t be removed — set them to Not active instead. That keeps the history.' }, { status: 409 });
  }
  await prisma.courseMembership.delete({ where: { id } });
  // Memberships item 2: their photo goes with them (the private store; best effort, never blocks the removal).
  const token = privateBlobToken();
  if (membership.photoUrl && token && isBlobStoreUrl(membership.photoUrl)) { try { await del(membership.photoUrl, { token }); } catch { /* best effort */ } }
  return NextResponse.json({ success: true });
}
