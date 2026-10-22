import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { paymentForPayPage, chargeEventPayment, holdProblem } from '@/lib/event-payments';
import { sendSignupConfirmation } from '@/lib/event-signup';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { formatTeeDay } from '@/lib/format';

// W2-9b: the organizer's side of an event pay link. Token-gated like the
// walk-up sale link (/api/shop-sale/[id]); no login.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await paymentForPayPage(id, req.nextUrl.searchParams.get('token') ?? '');
  if (!p) return NextResponse.json({ error: 'This pay link is not valid any more. Ask the course for a new one.' }, { status: 404 });
  const c = p.event.course;
  // W2-9d: a sign-up's payment — how long the spots are held, or why it can't be paid any more.
  const open = p.status === 'open' || p.status === 'paying';
  const holdNote = open && p.groupKey ? await holdProblem(p.groupKey) : null;
  const held = open && p.groupKey && !holdNote
    ? await prisma.courseEventPlayer.findFirst({ where: { groupKey: p.groupKey, status: 'held' }, orderBy: { holdUntil: 'asc' }, select: { holdUntil: true } })
    : null;
  return NextResponse.json({
    signup: !!p.groupKey, holdNote, holdUntil: held?.holdUntil ?? null,
    status: p.status === 'paying' ? 'open' : p.status, eventCancelled: p.event.status !== 'planned',
    label: p.label, amountCents: p.amountCents, feeCents: p.feeCents,
    eventName: p.event.name, dateLabel: formatTeeDay(p.event.date),
    courseName: c.name, brandColor: c.brandColor, logoUrl: c.logoUrl, photoUrl: c.heroImageUrl,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Per payment: one leaked link can't be used to test cards against the course's account.
  if (!(await rateLimit(`event-pay:${clientIp(req)}`, 100, 300)) || !(await rateLimit(`event-pay:payment:${id}`, 5, 600))) {
    return NextResponse.json({ error: 'Too many tries — wait a few minutes, or call the course.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({})) as { token?: unknown; paymentMethodId?: unknown; expectedTotalCents?: unknown };
  const r = await chargeEventPayment(id, String(body.token ?? ''), String(body.paymentMethodId ?? ''), Number(body.expectedTotalCents));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  // W2-9d: a sign-up that just paid gets its confirmation (the spot is theirs now).
  if (r.value.status === 'paid') await sendSignupConfirmation({ paymentId: id }).catch(err => console.error(JSON.stringify({ ev: 'event_signup.paid_email.fail', paymentId: id, error: err instanceof Error ? err.message : String(err) })));
  return NextResponse.json({ status: r.value.status });
}
