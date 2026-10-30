import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe, chargeOnConnectedAccount, membershipFeeCents } from '@/lib/stripe';
import { sendMembershipReceiptEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { recordMove } from '@/lib/money-ledger';
import { paidUntilRenewal } from '@/lib/membership-renewal';

/** A dues claim older than this is from a request that died; a new payment may take over. */
const DUES_CLAIM_STALE_MS = 10 * 60_000;

// Public, token-gated membership dues payment — the member pays from the
// link in their email, no login required. The payToken is the proof of
// ownership, same magic-link pattern as golfer self check-in.

async function authorize(id: string, token: string | null) {
  if (!token) return null;
  const m = await prisma.courseMembership.findUnique({
    where: { id },
    include: {
      tier: true,
      course: { select: { name: true, city: true, state: true, stripeAccountId: true, stripeAccountActive: true, logoUrl: true } },
    },
  });
  if (!m || !m.payToken || m.payToken !== token) return null;
  return m;
}

/** Initiation is only owed on the first payment ever — never by a member who
 *  joined before the course came to GreenReserve (imported, initiationWaived). */
function amountsDue(m: { lastPaidAt: Date | null; initiationWaived: boolean; tier: { annualFeeCents: number; initiationFeeCents: number } | null }) {
  // MP-3 B2a: this used to multiply dollars by 100 to reach cents. The columns
  // ARE cents now, so that multiplication would have charged 100x — exactly the
  // silent failure the rename exists to make impossible.
  const annualCents = m.tier?.annualFeeCents ?? 0;
  const initiationCents = m.lastPaidAt || m.initiationWaived ? 0 : (m.tier?.initiationFeeCents ?? 0);
  const duesCents = annualCents + initiationCents;
  // The 1% rides on top: the course receives its full dues, the member pays dues + fee.
  const feeCents = membershipFeeCents(duesCents);
  return { annualCents, initiationCents, duesCents, feeCents, totalCents: duesCents + feeCents };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await authorize(id, req.nextUrl.searchParams.get('token'));
  if (!m) return NextResponse.json({ error: 'Invalid or expired payment link.' }, { status: 404 });

  const { annualCents, initiationCents, feeCents, totalCents } = amountsDue(m);
  return NextResponse.json({
    memberName: m.golferId ? undefined : m.inviteName,
    name: m.inviteName,
    courseName: m.course.name,
    courseLogo: m.course.logoUrl || '',
    tierName: m.tier?.name ?? m.membershipType,
    termMonths: m.tier?.termMonths ?? 12,
    annual: annualCents / 100,
    initiation: initiationCents / 100,
    serviceFee: feeCents / 100,
    total: totalCents / 100,
    paymentStatus: m.paymentStatus,
    // Paid, and not yet inside the 30-day renewal window the POST allows —
    // else the renewal link the reminder cron sends could never be paid.
    alreadyPaid: paidUntilRenewal(m, m.tier?.termMonths ?? 12),
    expiresAt: m.expiresAt,
    stripeReady: !!(m.course.stripeAccountActive && m.course.stripeAccountId),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Security review: the one token-gated, money-moving endpoint with no limit.
  if (!(await rateLimit('membership:pay:' + id, 10, 300))) {
    return NextResponse.json({ error: 'Too many attempts — wait a few minutes and try again.' }, { status: 429 });
  }
  const { token, paymentMethodId } = await req.json();
  const m = await authorize(id, token);
  if (!m) return NextResponse.json({ error: 'Invalid or expired payment link.' }, { status: 404 });

  if (!paymentMethodId) return NextResponse.json({ error: 'Missing payment details.' }, { status: 400 });
  if (!m.course.stripeAccountActive || !m.course.stripeAccountId) {
    return NextResponse.json({ error: 'This course is not set up for online payments yet — please pay at the pro shop.' }, { status: 422 });
  }

  if (amountsDue(m).duesCents <= 0) return NextResponse.json({ error: 'Nothing due on this membership.' }, { status: 409 });

  // LEDGER-1 (Cam 2026-10-30): the card used to be charged inside a database
  // transaction holding the row lock — a timeout after Stripe took the money rolled
  // the record back and left a paid member unpaid. Now: claim the membership (one
  // payment at a time, like a shop or event pay link), charge outside any
  // transaction, put the money on the ledger, then record the term.
  const startedAt = new Date();
  const claimed = await prisma.courseMembership.updateMany({
    // MEM-JOIN: a golfer who joined online ('awaiting_payment') pays here too, and becomes active below.
    where: { id: m.id, status: { in: ['active', 'awaiting_payment'] }, OR: [{ duesChargeStartedAt: null }, { duesChargeStartedAt: { lt: new Date(Date.now() - DUES_CLAIM_STALE_MS) } }] },
    data: { duesChargeStartedAt: startedAt },
  });
  if (!claimed.count) {
    const s = await prisma.courseMembership.findUnique({ where: { id: m.id }, select: { status: true } });
    return NextResponse.json({ error: s?.status !== 'active' && s?.status !== 'awaiting_payment' ? 'This membership is no longer active — please contact the course.' : 'These dues are being paid right now — wait a moment and refresh.' }, { status: 409 });
  }
  const release = () => prisma.courseMembership.updateMany({ where: { id: m.id, duesChargeStartedAt: startedAt }, data: { duesChargeStartedAt: null } });
  const now = await prisma.courseMembership.findUniqueOrThrow({ where: { id: m.id }, select: { paymentStatus: true, expiresAt: true, lastPaidAt: true } });
  // A paid membership (online, or cash/check at the shop) can only be paid
  // again within its renewal window (30 days of expiry) — protects against
  // double-pays from old emails.
  if (paidUntilRenewal(now, m.tier?.termMonths ?? 12)) {
    await release();
    return NextResponse.json({ error: 'These dues are already paid — nothing due until renewal.' }, { status: 409 });
  }
  // What is due is worked out from the row as it is now, under the claim.
  const due = amountsDue({ ...m, lastPaidAt: now.lastPaidAt });

  let paymentIntentId: string;
  let chargedCents: number;
  try {
    const customer = await stripe.customers.create({
      email: m.inviteEmail,
      name: m.inviteName,
      metadata: { membershipId: m.id, source: 'membership_dues' },
    });
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
    const pi = await chargeOnConnectedAccount({
      customerId: customer.id,
      paymentMethodId,
      connectedAccountId: m.course.stripeAccountId,
      amountCents: due.totalCents,
      applicationFeeCents: due.feeCents,
      description: `Membership dues - ${m.tier?.name ?? m.membershipType} - ${m.course.name}`,
      metadata: { membershipId: m.id },
      // Per term: a retry of this term with this card replays the same charge; next year's renewal is its own.
      idempotencyKey: `membership-${m.id}-${now.lastPaidAt ? now.lastPaidAt.getTime() : 'first'}-${paymentMethodId}`,
    });
    paymentIntentId = pi.id;
    chargedCents = pi.amount;
  } catch (err) {
    await release();
    const message = err instanceof Error ? err.message : 'Card could not be charged.';
    return NextResponse.json({ error: `Payment failed: ${message}` }, { status: 402 });
  }
  // The money moved: on the ledger first, so nothing after this can lose it.
  await recordMove({ courseId: m.courseId, what: 'dues', direction: 'in', method: 'card', account: 'course', amountCents: chargedCents, platformFeeCents: due.feeCents, stripeId: paymentIntentId, membershipId: m.id, actor: 'golfer', note: `${m.tier?.name ?? m.membershipType}${due.initiationCents ? ' + initiation' : ''}` });

  // Term extends from expiry if renewing early, from today otherwise. A first
  // payment (nothing paid before) always starts today: the end date typed when
  // the member was added is not a paid term (Cam 2026-10-29: it paid two terms).
  const termMonths = m.tier?.termMonths ?? 12;
  const base = now.lastPaidAt && now.expiresAt && now.expiresAt.getTime() > Date.now() ? new Date(now.expiresAt) : new Date();
  const newExpiry = new Date(base);
  newExpiry.setMonth(newExpiry.getMonth() + termMonths);

  // One plain update (no transaction to time out). Only if the term is still the one
  // charged for: a replayed charge (same key) the first try already recorded is not a second term.
  const recorded = await prisma.courseMembership.updateMany({
    where: { id: m.id, lastPaidAt: now.lastPaidAt },
    data: {
      paymentStatus: 'paid',
      status: 'active',
      startedAt: m.startedAt ?? new Date(),
      lastPaidAt: new Date(),
      lastPaymentIntentId: paymentIntentId,
      expiresAt: newExpiry,
      renewalRemindedAt: null,
      duesChargeStartedAt: null,
    },
  });
  if (!recorded.count) {
    await release();
    console.error(JSON.stringify({ ev: 'membership.pay.term_changed', membershipId: m.id, paymentIntentId }));
  }
  const updated = await prisma.courseMembership.findUniqueOrThrow({ where: { id: m.id }, select: { expiresAt: true } });

  after(sendMembershipReceiptEmail({
    name: m.inviteName,
    email: m.inviteEmail,
    courseName: m.course.name,
    tierName: m.tier?.name ?? m.membershipType,
    amountPaid: chargedCents / 100,
    serviceFee: due.feeCents / 100,
    expiresAt: updated.expiresAt,
  }).catch(console.error));

  return NextResponse.json({ success: true, amountPaid: chargedCents / 100, expiresAt: updated.expiresAt });
}
