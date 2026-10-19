import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe, chargeOnConnectedAccount, membershipFeeCents } from '@/lib/stripe';
import { sendMembershipReceiptEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';

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

/** Initiation is only owed on the first payment ever. */
function amountsDue(m: { lastPaidAt: Date | null; tier: { annualFeeCents: number; initiationFeeCents: number } | null }) {
  // MP-3 B2a: this used to multiply dollars by 100 to reach cents. The columns
  // ARE cents now, so that multiplication would have charged 100x — exactly the
  // silent failure the rename exists to make impossible.
  const annualCents = m.tier?.annualFeeCents ?? 0;
  const initiationCents = m.lastPaidAt ? 0 : (m.tier?.initiationFeeCents ?? 0);
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
    alreadyPaid: m.paymentStatus === 'paid' || m.paymentStatus === 'paid_offline',
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

  const { duesCents, feeCents, totalCents } = amountsDue(m);
  if (duesCents <= 0) return NextResponse.json({ error: 'Nothing due on this membership.' }, { status: 409 });

  // Launch security review 2026-10-18: the whole pay runs holding this
  // membership's row lock, so a double click or a retry waits for the first
  // payment and then hits the guards below instead of charging again.
  return prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM "CourseMembership" WHERE id = ${m.id} FOR UPDATE`;
  const now = await tx.courseMembership.findUnique({ where: { id: m.id }, select: { status: true, paymentStatus: true, expiresAt: true } });
  if (!now) return NextResponse.json({ error: 'Invalid or expired payment link.' }, { status: 404 });
  // A membership the course deactivated is not revived by an old pay link.
  if (now.status !== 'active') {
    return NextResponse.json({ error: 'This membership is no longer active — please contact the course.' }, { status: 409 });
  }
  // A paid membership (online, or cash/check at the shop) can only be paid
  // again within its renewal window (30 days of expiry) — protects against
  // double-pays from old emails.
  if ((now.paymentStatus === 'paid' || now.paymentStatus === 'paid_offline') && now.expiresAt) {
    const daysLeft = (now.expiresAt.getTime() - Date.now()) / 86400000;
    if (daysLeft > 30) {
      return NextResponse.json({ error: 'These dues are already paid — nothing due until renewal.' }, { status: 409 });
    }
  }

  let paymentIntentId: string;
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
      amountCents: totalCents,
      applicationFeeCents: feeCents,
      description: `Membership dues - ${m.tier?.name ?? m.membershipType} - ${m.course.name}`,
      idempotencyKey: `membership-${m.id}-${paymentMethodId}`,
    });
    paymentIntentId = pi.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Card could not be charged.';
    return NextResponse.json({ error: `Payment failed: ${message}` }, { status: 402 });
  }

  // Term extends from expiry if renewing early, from today otherwise.
  const termMonths = m.tier?.termMonths ?? 12;
  const base = now.expiresAt && now.expiresAt.getTime() > Date.now() ? new Date(now.expiresAt) : new Date();
  const newExpiry = new Date(base);
  newExpiry.setMonth(newExpiry.getMonth() + termMonths);

  const updated = await tx.courseMembership.update({
    where: { id: m.id },
    data: {
      paymentStatus: 'paid',
      startedAt: m.startedAt ?? new Date(),
      lastPaidAt: new Date(),
      lastPaymentIntentId: paymentIntentId,
      expiresAt: newExpiry,
      renewalRemindedAt: null,
    },
  });

  after(sendMembershipReceiptEmail({
    name: m.inviteName,
    email: m.inviteEmail,
    courseName: m.course.name,
    tierName: m.tier?.name ?? m.membershipType,
    amountPaid: totalCents / 100,
    serviceFee: feeCents / 100,
    expiresAt: updated.expiresAt,
  }).catch(console.error));

  return NextResponse.json({ success: true, amountPaid: totalCents / 100, expiresAt: updated.expiresAt });
  }, { timeout: 30_000, maxWait: 30_000 });
}
