import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe, chargeOnConnectedAccount, MEMBERSHIP_FEE_CENTS } from '@/lib/stripe';
import { sendMembershipReceiptEmail } from '@/lib/email';

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
function amountsDue(m: { lastPaidAt: Date | null; tier: { annualFee: number; initiationFee: number } | null }) {
  const annual = m.tier?.annualFee ?? 0;
  const initiation = m.lastPaidAt ? 0 : (m.tier?.initiationFee ?? 0);
  return { annualCents: Math.round(annual * 100), initiationCents: Math.round(initiation * 100) };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await authorize(id, req.nextUrl.searchParams.get('token'));
  if (!m) return NextResponse.json({ error: 'Invalid or expired payment link.' }, { status: 404 });

  const { annualCents, initiationCents } = amountsDue(m);
  return NextResponse.json({
    memberName: m.golferId ? undefined : m.inviteName,
    name: m.inviteName,
    courseName: m.course.name,
    courseLogo: m.course.logoUrl || '',
    tierName: m.tier?.name ?? m.membershipType,
    termMonths: m.tier?.termMonths ?? 12,
    annual: annualCents / 100,
    initiation: initiationCents / 100,
    total: (annualCents + initiationCents) / 100,
    paymentStatus: m.paymentStatus,
    alreadyPaid: m.paymentStatus === 'paid' || m.paymentStatus === 'paid_offline',
    expiresAt: m.expiresAt,
    stripeReady: !!(m.course.stripeAccountActive && m.course.stripeAccountId),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { token, paymentMethodId } = await req.json();
  const m = await authorize(id, token);
  if (!m) return NextResponse.json({ error: 'Invalid or expired payment link.' }, { status: 404 });

  if (!paymentMethodId) return NextResponse.json({ error: 'Missing payment details.' }, { status: 400 });
  if (!m.course.stripeAccountActive || !m.course.stripeAccountId) {
    return NextResponse.json({ error: 'This course is not set up for online payments yet — please pay at the pro shop.' }, { status: 422 });
  }

  const { annualCents, initiationCents } = amountsDue(m);
  const totalCents = annualCents + initiationCents;
  if (totalCents <= 0) return NextResponse.json({ error: 'Nothing due on this membership.' }, { status: 409 });

  // A paid membership can only be paid again once it's within its renewal
  // window (30 days of expiry) — protects against double-pays from old emails.
  if (m.paymentStatus === 'paid' && m.expiresAt) {
    const daysLeft = (m.expiresAt.getTime() - Date.now()) / 86400000;
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
      applicationFeeCents: MEMBERSHIP_FEE_CENTS,
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
  const base = m.expiresAt && m.expiresAt.getTime() > Date.now() ? new Date(m.expiresAt) : new Date();
  const newExpiry = new Date(base);
  newExpiry.setMonth(newExpiry.getMonth() + termMonths);

  const updated = await prisma.courseMembership.update({
    where: { id: m.id },
    data: {
      paymentStatus: 'paid',
      status: 'active',
      startedAt: m.startedAt ?? new Date(),
      lastPaidAt: new Date(),
      lastPaymentIntentId: paymentIntentId,
      expiresAt: newExpiry,
      renewalRemindedAt: null,
    },
  });

  sendMembershipReceiptEmail({
    name: m.inviteName,
    email: m.inviteEmail,
    courseName: m.course.name,
    tierName: m.tier?.name ?? m.membershipType,
    amountPaid: totalCents / 100,
    expiresAt: updated.expiresAt,
  }).catch(console.error);

  return NextResponse.json({ success: true, amountPaid: totalCents / 100, expiresAt: updated.expiresAt });
}
