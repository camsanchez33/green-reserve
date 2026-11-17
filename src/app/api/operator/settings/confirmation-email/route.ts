import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { policyFrom, describePolicy, cardAtBooking, lateFeeTotalCents } from '@/lib/cancel-policy';
import { confirmationPartsOf, confirmationLines, CONFIRMATION_PART_SELECT } from '@/lib/confirmation-parts';
import { sendBookingConfirmation } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { FEE_AT_BOOKING_ON } from '@/lib/booking-fees';

// Settings data (Cam 2026-11-17, Settings → Booking → Confirmation email).
//   GET   what the live preview needs: the course's own parts, the lines the
//         email shows, and the policy wording, which comes from describePolicy()
//         (never written by the course).
//   POST  "Send me a test": the real confirmation template with a sample
//         booking, through getResend (sendBookingConfirmation), to the signed-in
//         person's own address only. 5 an hour per person.
// The parts themselves save through PATCH /api/operator/settings.

export const dynamic = 'force-dynamic';

const COURSE_SELECT = {
  name: true, slug: true, address: true, city: true, state: true,
  cancellationHours: true, lateCancellationFeeCents: true, lateFeeBasis: true, lateFeeTiming: true,
  noShowFeeCents: true, noShowFeeBasis: true, autoNoShowMinutes: true, checkInWindowHours: true,
  ...CONFIRMATION_PART_SELECT,
} as const;

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'settings.edit'); if (denied) return denied;
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: COURSE_SELECT });
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const policy = policyFrom(course);
  const described = describePolicy(policy);
  const parts = confirmationPartsOf(course);
  return NextResponse.json({
    courseName: course.name,
    parts,
    lines: confirmationLines(parts),
    policy: { headline: described.headline, lines: described.lines, cardAtBooking: cardAtBooking(policy) },
  });
}

/** The next Saturday as the tee sheet writes dates (YYYY-MM-DD). */
function sampleDate(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + (((6 - d.getUTCDay()) + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

export async function POST() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'settings.edit'); if (denied) return denied;
  // The address comes from the signed-in person's own row, never from the request.
  const me = session.isStaff
    ? await prisma.courseStaff.findUnique({ where: { id: session.staffId ?? '' }, select: { email: true, name: true } })
    : await prisma.courseOperator.findUnique({ where: { id: session.operatorId ?? '' }, select: { email: true, name: true } });
  if (!me?.email) return NextResponse.json({ error: 'Your login has no email address to send to.' }, { status: 400 });
  if (!(await rateLimit(`settings:test-email:${session.staffId ?? session.operatorId}`, 5, 3600))) {
    return NextResponse.json({ error: 'That’s 5 test emails this hour — try again later.' }, { status: 429 });
  }
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: COURSE_SELECT });
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const policy = policyFrom(course);
  const players = 4;
  const green = 4500 * players, cart = 2000 * players, fee = 150 * players;
  try {
    await sendBookingConfirmation({
      golferName: me.name || 'Golfer', golferEmail: me.email,
      courseName: course.name, courseSlug: course.slug,
      courseAddress: [course.address, course.city, course.state].filter(Boolean).join(', '),
      date: sampleDate(), time: '08:40', players, holes: 18, // written the way the tee sheet stores times, as real emails print them
      greenFeeTotal: green, cartFeeTotal: cart, accessFeeTotal: fee, totalAmount: green + cart + fee,
      bookingId: 'test', appliedRate: 'standard',
      cancellationFeeTotal: lateFeeTotalCents(policy, players), cancellationHours: policy.cancellationHours,
      noCard: !cardAtBooking(policy),
      feePaidAtBooking: FEE_AT_BOOKING_ON && fee > 0,
      policyLines: describePolicy(policy).lines,
      parts: confirmationPartsOf(course),
      testSend: true,
    });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'settings.test_email.fail', courseId: session.courseId, error: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: 'The test email didn’t send — try again in a minute.' }, { status: 502 });
  }
  return NextResponse.json({ sentTo: me.email });
}
