import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { sendMembershipPaymentLinkEmail } from '@/lib/email';

// B-10 (UI_REVISE_SPEC §4): one click reminds every overdue member. "Overdue"
// = an active membership on a paid tier that is either unpaid or past its
// expiry. Each member gets the same dues link email the per-member "send pay
// link" action sends, at most once every 7 days (renewalRemindedAt). Sends
// are awaited one by one and every outcome is counted back to the caller —
// a bounced send is reported, never swallowed.
//
// Deliberately NOT here: "online booking paused until paid". No such rule
// exists in the booking code, so the email does not claim one.
const REMIND_EVERY_DAYS = 7;

export async function POST() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true, stripeAccountActive: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  if (!course.stripeAccountActive) {
    return NextResponse.json({ error: 'Connect Stripe first — the reminder carries a payment link, and there is nowhere for the money to go yet.' }, { status: 409 });
  }

  const now = new Date();
  const recent = new Date(now.getTime() - REMIND_EVERY_DAYS * 86400000);
  const overdue = await prisma.courseMembership.findMany({
    where: {
      courseId: session.courseId,
      status: 'active',
      OR: [{ paymentStatus: 'unpaid' }, { expiresAt: { lt: now } }],
    },
    include: { tier: true },
  });

  let sent = 0, skippedRecent = 0, skippedFree = 0, skippedNoEmail = 0;
  const failed: string[] = [];
  for (const m of overdue) {
    if (!m.tier) { skippedFree++; continue; }
    const initiationCents = m.lastPaidAt ? 0 : m.tier.initiationFeeCents;
    if (m.tier.annualFeeCents + initiationCents <= 0) { skippedFree++; continue; }
    if (!m.inviteEmail) { skippedNoEmail++; continue; }
    if (m.renewalRemindedAt && m.renewalRemindedAt > recent) { skippedRecent++; continue; }
    try {
      await sendMembershipPaymentLinkEmail({
        name: m.inviteName,
        email: m.inviteEmail,
        courseName: course.name,
        tierName: m.tier.name,
        annualFee: centsToDollarsOr0(m.tier.annualFeeCents),
        initiationFee: centsToDollarsOr0(initiationCents),
        payLink: `${process.env.NEXT_PUBLIC_URL}/membership/${m.id}?token=${m.payToken}`,
        isRenewal: !!m.lastPaidAt,
      });
      await prisma.courseMembership.update({ where: { id: m.id }, data: { renewalRemindedAt: now } });
      sent++;
    } catch (err) {
      console.error('remind-overdue: send failed', m.id, err);
      failed.push(m.inviteName || m.inviteEmail);
    }
  }

  return NextResponse.json({ overdue: overdue.length, sent, skippedRecent, skippedFree, skippedNoEmail, failed });
}
