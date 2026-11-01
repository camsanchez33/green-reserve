import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { dollarsToCents, dollarsToCentsOr0 } from '@/lib/money';
import { tierToWire } from '@/lib/tier-wire';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { readJoinMode, JOIN_NEEDS_DUES } from '@/lib/membership-join';
import { readAccountSettings } from '@/lib/member-account';

/** MEM-ACCT: the account limit from the form (dollars): blank = no limit; anything unreadable is refused (NaN), never "no limit". */
const limitCents = (v: unknown) => v === undefined ? undefined : v === '' || v === null ? null : (dollarsToCents(v as string) ?? Number.NaN);
import { memberContact, STOP_DATA } from '@/lib/membership-autorenew';
import { sendAutoRenewOffEmail } from '@/lib/email';

/** Audit 2026-10-31: a term is a whole number of months, 1 to 36 — it sets when every renewal is charged. */
const termOk = (v: unknown) => v == null || (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 36);
const TERM_BAD = 'The term is a whole number of months, from 1 to 36.';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'members.view'); if (denied) return denied; } // SP-A

  const tiers = await prisma.membershipTier.findMany({
    where: { courseId: session.courseId },
    include: { _count: { select: { memberships: { where: { status: 'active' } } } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(tiers.map(tierToWire));
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'members.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const body = await req.json();
  const { name, color, greenFeeWeekday, greenFeeWeekend, cartFeeWeekday, cartFeeWeekend,
          discountPct, advanceBookingDays, guestPassesPerYear, annualFee, initiationFee, termMonths, notes, guestsPayMemberRate, joinOnline, autoRenew, autoRenewRetry, accountOn, accountLimit, accountSettle } = body;
  if (!termOk(termMonths)) return NextResponse.json({ error: TERM_BAD }, { status: 400 });

  if (!name?.trim()) return NextResponse.json({ error: 'Tier name is required' }, { status: 400 });
  // ACT-1 review: a booking records its tier by NAME, so two live tiers with one
  // name would make repricing a moved member ambiguous.
  if (await prisma.membershipTier.findFirst({ where: { courseId: session.courseId, name: name.trim(), active: true }, select: { id: true } })) {
    return NextResponse.json({ error: `You already have a tier called “${name.trim()}”. Pick a different name.` }, { status: 409 });
  }

  // Validate: must have either flat rates OR a discount %, not both
  const hasFlat = greenFeeWeekday != null || greenFeeWeekend != null;
  const hasPct  = discountPct != null;
  if (hasFlat && hasPct) {
    return NextResponse.json({ error: 'Use either flat rates or a discount %, not both' }, { status: 400 });
  }

  // MEM-JOIN: joined online only with dues to pay (lib/membership-join).
  const join = joinOnline === undefined ? 'off' : readJoinMode(joinOnline);
  if (!join) return NextResponse.json({ error: 'Pick how golfers join online.' }, { status: 400 });
  if (join !== 'off' && dollarsToCentsOr0(annualFee) <= 0) return NextResponse.json({ error: JOIN_NEEDS_DUES }, { status: 400 });

  // MEM-ACCT: members on this tier can charge to an account, up to its limit (dollars on the wire; blank = none).
  const acct = readAccountSettings({ accountOn, accountLimitCents: limitCents(accountLimit), accountSettle });
  if (!acct.ok) return NextResponse.json({ error: acct.error }, { status: 400 });

  const tier = await prisma.membershipTier.create({
    data: {
      ...acct.data,
      joinOnline: join,
      // MEM-RENEW: golfers on this tier agree to automatic renewal when they pay (lib/membership-autorenew).
      autoRenew: autoRenew === true && dollarsToCentsOr0(annualFee) > 0,
      autoRenewRetry: autoRenewRetry !== false,
      courseId: session.courseId,
      name: name.trim(),
      color: color || '#1b4332',
      // MP-3 B2a: the wire stays dollars (that is what the form collects); the
      // column is integer cents. This route is the only place the unit changes.
      greenFeeWeekdayCents: dollarsToCents(greenFeeWeekday),
      greenFeeWeekendCents: dollarsToCents(greenFeeWeekend),
      cartFeeWeekdayCents:  dollarsToCents(cartFeeWeekday),
      cartFeeWeekendCents:  dollarsToCents(cartFeeWeekend),
      discountPct:        discountPct        != null ? Number(discountPct)        : null,
      // Security review: this now sizes the tee-time generation loop — bounded like the course windows.
      advanceBookingDays: advanceBookingDays != null ? Math.min(365, Math.max(1, Number(advanceBookingDays) || 14)) : 14,
      guestPassesPerYear: guestPassesPerYear != null ? Number(guestPassesPerYear) : 0,
      // Cam 2026-10-29: off = only the member gets the member rate (lib/member-rates).
      guestsPayMemberRate: guestsPayMemberRate === true,
      annualFeeCents:     dollarsToCentsOr0(annualFee),
      initiationFeeCents: dollarsToCentsOr0(initiationFee),
      termMonths:         termMonths         != null ? Number(termMonths)         : 12,
      notes: notes || '',
    },
  });
  return NextResponse.json(tierToWire(tier), { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'members.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing tier id' }, { status: 400 });
  if (!termOk(updates.termMonths)) return NextResponse.json({ error: TERM_BAD }, { status: 400 });

  const tier = await prisma.membershipTier.findUnique({ where: { id } });
  if (!tier || tier.courseId !== session.courseId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (typeof updates.name === 'string' && updates.name.trim() && updates.name.trim() !== tier.name &&
      await prisma.membershipTier.findFirst({ where: { courseId: session.courseId, name: updates.name.trim(), active: true, id: { not: id } }, select: { id: true } })) {
    return NextResponse.json({ error: `You already have a tier called “${updates.name.trim()}”. Pick a different name.` }, { status: 409 });
  }

  const join = updates.joinOnline === undefined ? tier.joinOnline : readJoinMode(updates.joinOnline);
  if (!join) return NextResponse.json({ error: 'Pick how golfers join online.' }, { status: 400 });
  const duesAfter = updates.annualFee != null ? dollarsToCentsOr0(updates.annualFee) : tier.annualFeeCents;
  if (join !== 'off' && duesAfter <= 0) return NextResponse.json({ error: JOIN_NEEDS_DUES }, { status: 400 });

  const acct = readAccountSettings({ accountOn: updates.accountOn, accountLimitCents: limitCents(updates.accountLimit), accountSettle: updates.accountSettle });
  if (!acct.ok) return NextResponse.json({ error: acct.error }, { status: 400 });

  const updated = await prisma.membershipTier.update({
    where: { id },
    data: {
      ...acct.data,
      joinOnline: join,
      // MEM-RENEW: turning it on changes what the next payer agrees to; turning it off stops it for everyone on it (below).
      autoRenew: (typeof updates.autoRenew === 'boolean' ? updates.autoRenew : tier.autoRenew) && duesAfter > 0,
      autoRenewRetry: typeof updates.autoRenewRetry === 'boolean' ? updates.autoRenewRetry : tier.autoRenewRetry,
      name:               updates.name               ?? tier.name,
      color:              updates.color              ?? tier.color,
      greenFeeWeekdayCents: updates.greenFeeWeekday !== undefined ? dollarsToCents(updates.greenFeeWeekday) : tier.greenFeeWeekdayCents,
      greenFeeWeekendCents: updates.greenFeeWeekend !== undefined ? dollarsToCents(updates.greenFeeWeekend) : tier.greenFeeWeekendCents,
      cartFeeWeekdayCents:  updates.cartFeeWeekday  !== undefined ? dollarsToCents(updates.cartFeeWeekday)  : tier.cartFeeWeekdayCents,
      cartFeeWeekendCents:  updates.cartFeeWeekend  !== undefined ? dollarsToCents(updates.cartFeeWeekend)  : tier.cartFeeWeekendCents,
      discountPct:        updates.discountPct        !== undefined ? (updates.discountPct     != null ? Number(updates.discountPct)     : null) : tier.discountPct,
      advanceBookingDays: updates.advanceBookingDays != null ? Math.min(365, Math.max(1, Number(updates.advanceBookingDays) || tier.advanceBookingDays)) : tier.advanceBookingDays,
      guestPassesPerYear: updates.guestPassesPerYear != null ? Number(updates.guestPassesPerYear) : tier.guestPassesPerYear,
      guestsPayMemberRate: typeof updates.guestsPayMemberRate === 'boolean' ? updates.guestsPayMemberRate : tier.guestsPayMemberRate,
      annualFeeCents:     updates.annualFee     != null ? dollarsToCentsOr0(updates.annualFee)     : tier.annualFeeCents,
      initiationFeeCents: updates.initiationFee != null ? dollarsToCentsOr0(updates.initiationFee) : tier.initiationFeeCents,
      termMonths:         updates.termMonths         != null ? Number(updates.termMonths)         : tier.termMonths,
      notes:              updates.notes              ?? tier.notes,
      active:             updates.active             !== undefined ? updates.active : tier.active,
    },
  });
  // MEM-RENEW: the course stopped automatic renewal on this tier — its members go back to pay-link renewals, and are told.
  // Audit 2026-10-31: a new term length is a schedule nobody agreed to (yearly → monthly would charge the yearly
  // amount every month), so it stops automatic renewal the same way; members agree again when they next pay.
  if (tier.autoRenew && (!updated.autoRenew || updated.termMonths !== tier.termMonths)) {
    const on = await prisma.courseMembership.findMany({ where: { tierId: tier.id, autoRenew: true }, select: { id: true, inviteName: true, inviteEmail: true, expiresAt: true, golfer: { select: { email: true, firstName: true, lastName: true } } } });
    await prisma.courseMembership.updateMany({ where: { tierId: tier.id, autoRenew: true }, data: STOP_DATA() });
    const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true } });
    for (const m of on) {
      const to = memberContact(m);
      if (!to.email) continue;
      try { await sendAutoRenewOffEmail({ name: to.name, email: to.email, courseName: course?.name ?? '', tierName: updated.name, endsOn: m.expiresAt }); }
      catch (err) { console.error(JSON.stringify({ ev: 'membership.autorenew.tier_off_email_fail', membershipId: m.id, error: err instanceof Error ? err.message : String(err) })); }
    }
  }
  return NextResponse.json(tierToWire(updated));
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'members.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const tier = await prisma.membershipTier.findUnique({ where: { id } });
  if (!tier || tier.courseId !== session.courseId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Check if tier has active members
  const count = await prisma.courseMembership.count({ where: { tierId: id, status: 'active' } });
  if (count > 0) {
    return NextResponse.json({ error: `This tier has ${count} active member${count === 1 ? '' : 's'}. Reassign or remove them first.` }, { status: 409 });
  }

  await prisma.membershipTier.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
