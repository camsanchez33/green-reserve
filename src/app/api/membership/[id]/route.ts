import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendMembershipReceiptEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { paidUntilRenewal } from '@/lib/membership-renewal';
import { amountsDue } from '@/lib/membership-dues';
import { payDuesByCard } from '@/lib/dues-payment';
import { welcomeIfFirst } from '@/lib/member-welcome';
import { autoRenewTermsText, renewalCents } from '@/lib/membership-autorenew';
import { sendAutoRenewOnEmail } from '@/lib/email';

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
    // Audit 2026-10-31: the exact total the page shows; the POST charges only this.
    totalCents,
    paymentStatus: m.paymentStatus,
    // Paid, and not yet inside the 30-day renewal window the POST allows —
    // else the renewal link the reminder cron sends could never be paid.
    alreadyPaid: paidUntilRenewal(m, m.tier?.termMonths ?? 12),
    expiresAt: m.expiresAt,
    stripeReady: !!(m.course.stripeAccountActive && m.course.stripeAccountId),
    // MEM-RENEW: the box and its terms (tier renews automatically), and whether this member has it on.
    autoRenewTier: !!m.tier?.autoRenew,
    autoRenewTerms: m.tier?.autoRenew ? autoRenewTermsText({ courseName: m.course.name, tierName: m.tier.name, termMonths: m.tier.termMonths, annualFeeCents: m.tier.annualFeeCents }) : '',
    autoRenewOn: m.autoRenew,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Security review: the one token-gated, money-moving endpoint with no limit.
  if (!(await rateLimit('membership:pay:' + id, 10, 300))) {
    return NextResponse.json({ error: 'Too many attempts — wait a few minutes and try again.' }, { status: 429 });
  }
  const { token, paymentMethodId, autoRenewConsent, expectedTotalCents, autoRenewTerms } = await req.json();
  const m = await authorize(id, token);
  if (!m) return NextResponse.json({ error: 'Invalid or expired payment link.' }, { status: 404 });

  // The claim, the one charge, the ledger and the term: lib/dues-payment (shared with staff typing a card at the course).
  const r = await payDuesByCard({ membershipId: m.id, paymentMethodId, expectedTotalCents, by: 'golfer', autoRenewConsent, autoRenewTerms });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const chargedCents = r.chargedCents;
  const recorded = r.recorded;
  const updated = { expiresAt: r.expiresAt };
  const autoTerms = m.tier?.autoRenew ? autoRenewTermsText({ courseName: m.course.name, tierName: m.tier.name, termMonths: m.tier.termMonths, annualFeeCents: m.tier.annualFeeCents }) : '';
  const due = { feeCents: r.feeCents };

  after(sendMembershipReceiptEmail({
    name: m.inviteName,
    email: m.inviteEmail,
    courseName: m.course.name,
    tierName: m.tier?.name ?? m.membershipType,
    amountPaid: chargedCents / 100,
    serviceFee: due.feeCents / 100,
    expiresAt: updated.expiresAt,
  }).catch(console.error));

  // Memberships item 1: a member added at the counter who pays their first dues by this link gets the welcome now.
  after(welcomeIfFirst(m.id, r.firstPayment).catch(console.error));

  // MEM-RENEW: the terms they agreed to, in writing, with how to turn it off.
  if (m.tier?.autoRenew && recorded) {
    after(sendAutoRenewOnEmail({
      name: m.inviteName, email: m.inviteEmail, courseName: m.course.name, tierName: m.tier.name, terms: autoTerms,
      renewsOn: updated.expiresAt, totalCents: renewalCents(m.tier).totalCents,
      manageLink: `${process.env.NEXT_PUBLIC_URL}/membership/${m.id}?token=${m.payToken}`,
    }).catch(console.error));
  }

  return NextResponse.json({ success: true, amountPaid: chargedCents / 100, expiresAt: updated.expiresAt, autoRenew: !!m.tier?.autoRenew });
}
