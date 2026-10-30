import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cron-auth';
import { cronRoute } from '@/lib/cron-log';
import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';
import { paidUntilRenewal } from '@/lib/membership-renewal';
import { sendReminderEmail, sendMembershipPaymentLinkEmail, sendMembershipReceiptEmail, sendAutoRenewReminderEmail, sendAutoRenewDeclinedEmail } from '@/lib/email';
import { remindersDue, markReminded, chargesDue, chargeRenewal, renewalCents, memberContact, RETRY_DAYS } from '@/lib/membership-autorenew';
import { chargeOnConnectedAccount } from '@/lib/stripe';

export const GET = cronRoute('send-reminders', async (req: NextRequest) => {
  // cronRoute authorises before logging; the check stays here too so every
  // cron route is visibly guarded on its own.
  const denied = cronAuthFailure(req);
  if (denied) return denied;

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Day-before reminders for tomorrow's confirmed bookings (all payment types).
  // Same-day check-in emails (no-fee courses) are handled by the hourly cron
  // at /api/cron/hourly, which fires 3 hours before the tee time.
  const tomorrowBookings = await prisma.booking.findMany({
    where: { status: 'confirmed', teeTime: { date: tomorrowStr } },
    include: {
      teeTime: { select: { date: true, time: true, holes: true, product: { select: { label: true } } } },
      course: { select: { name: true, slug: true, address: true, city: true, state: true } },
    },
  });

  let sent = 0;
  for (const booking of tomorrowBookings) {
    try {
      await sendReminderEmail({
        golferName: booking.golferName, golferEmail: booking.golferEmail,
        courseName: booking.course.name,
        courseSlug: booking.course.slug,
        courseAddress: `${booking.course.address}, ${booking.course.city}, ${booking.course.state}`,
        date: booking.teeTime.date, time: booking.teeTime.time,
        players: booking.players, holes: booking.teeTime.holes, productLabel: booking.teeTime.product?.label ?? null, bookingId: booking.id,
        checkInToken: booking.checkInToken,
      });
      sent++;
    } catch (err) { console.error(`Reminder failed for ${booking.golferEmail}:`, err); }
  }

  // ── Membership renewal reminders ──
  // Paid memberships expiring within 30 days get one renewal email with their
  // payment link. renewalRemindedAt is the dedup — cleared when they pay.
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + 30);
  const expiring = await prisma.courseMembership.findMany({
    where: {
      status: 'active',
      // MEM-RENEW: a member on automatic renewal gets its reminder below, not a pay link.
      autoRenew: false,
      paymentStatus: { in: ['paid', 'paid_offline'] },
      renewalRemindedAt: null,
      expiresAt: { not: null, lte: cutoff, gte: now },
      payToken: { not: '' },
    },
    include: { tier: true, course: { select: { name: true, stripeAccountActive: true } }, golfer: { select: { email: true, firstName: true, lastName: true } } },
  });

  let renewalsSent = 0;
  for (const m of expiring) {
    if (!m.tier || m.tier.annualFeeCents <= 0 || !m.course.stripeAccountActive) continue;
    // Not yet payable (a monthly tier opens 10 days out): left unstamped, so it goes out the day the link works.
    if (paidUntilRenewal(m, m.tier.termMonths)) continue;
    // The account's email wins over the invite address (a self-joined member has no invite address).
    const to = m.golfer?.email || m.inviteEmail;
    if (!to) continue;
    try {
      await sendMembershipPaymentLinkEmail({
        name: m.inviteName || [m.golfer?.firstName, m.golfer?.lastName].filter(Boolean).join(' '),
        email: to,
        courseName: m.course.name,
        tierName: m.tier.name,
        // MP-3 B2a: column is cents; sendMembershipPaymentLinkEmail renders
        // dollars ($${annualFee.toFixed(2)}), unlike the booking emails which
        // take cents. Convert at the caller.
        annualFee: centsToDollarsOr0(m.tier.annualFeeCents),
        initiationFee: 0,
        payLink: `${process.env.NEXT_PUBLIC_URL}/membership/${m.id}?token=${m.payToken}`,
        isRenewal: true,
      });
      await prisma.courseMembership.update({ where: { id: m.id }, data: { renewalRemindedAt: new Date() } });
      renewalsSent++;
    } catch (err) {
      console.error(`Renewal reminder failed for membership ${m.id}:`, err);
    }
  }

  // ── MEM-RENEW: automatic renewals (lib/membership-autorenew) ──
  // The reminder (30 days ahead yearly, 7 monthly) first; a renewal is charged only after its full
  // notice has run. Declined: a pay link, and the one retry when the tier allows it.
  const link = (m: { id: string; payToken: string }) => `${process.env.NEXT_PUBLIC_URL}/membership/${m.id}?token=${m.payToken}`;
  let autoReminders = 0, autoRenewed = 0, autoDeclined = 0;
  for (const m of await remindersDue(now)) {
    const to = memberContact(m);
    if (!to.email || !m.expiresAt || !m.tier) continue;
    try {
      await sendAutoRenewReminderEmail({ name: to.name, email: to.email, courseName: m.course.name, tierName: m.tier.name, renewsOn: m.expiresAt, totalCents: renewalCents(m.tier).totalCents, manageLink: link(m) });
      await markReminded(m.id, m.expiresAt, renewalCents(m.tier).totalCents, now);
      autoReminders++;
    } catch (err) { console.error(JSON.stringify({ ev: 'membership.autorenew.reminder_fail', membershipId: m.id, error: err instanceof Error ? err.message : String(err) })); }
  }
  for (const m of await chargesDue(now)) {
    const r = await chargeRenewal(m.id, chargeOnConnectedAccount, now);
    const to = memberContact(m);
    if (r.status === 'paid') {
      autoRenewed++;
      if (to.email && m.tier) {
        try { await sendMembershipReceiptEmail({ name: to.name, email: to.email, courseName: m.course.name, tierName: m.tier.name, amountPaid: r.amountCents / 100, serviceFee: renewalCents(m.tier).feeCents / 100, expiresAt: r.expiresAt }); }
        catch (err) { console.error(JSON.stringify({ ev: 'membership.autorenew.receipt_fail', membershipId: m.id, error: err instanceof Error ? err.message : String(err) })); }
      }
    } else if (r.status === 'declined') {
      autoDeclined++;
      console.error(JSON.stringify({ ev: 'membership.autorenew.declined', membershipId: m.id, retry: r.retry, error: r.error }));
      if (to.email && m.tier) {
        try { await sendAutoRenewDeclinedEmail({ name: to.name, email: to.email, courseName: m.course.name, tierName: m.tier.name, totalCents: renewalCents(m.tier).totalCents, payLink: link(m), retryOn: r.retry ? new Date(now.getTime() + RETRY_DAYS * 86_400_000) : null }); }
        catch (err) { console.error(JSON.stringify({ ev: 'membership.autorenew.declined_email_fail', membershipId: m.id, error: err instanceof Error ? err.message : String(err) })); }
      }
    }
  }

  return NextResponse.json({ success: true, sent, total: tomorrowBookings.length, renewalsSent, autoReminders, autoRenewed, autoDeclined });
});
