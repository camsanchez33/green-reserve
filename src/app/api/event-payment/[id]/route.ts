import { NextRequest, NextResponse } from 'next/server';
import { paymentForPayPage, chargeEventPayment } from '@/lib/event-payments';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { formatTeeDay } from '@/lib/format';

// W2-9b: the organizer's side of an event pay link. Token-gated like the
// walk-up sale link (/api/shop-sale/[id]); no login.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await paymentForPayPage(id, req.nextUrl.searchParams.get('token') ?? '');
  if (!p) return NextResponse.json({ error: 'This pay link is not valid any more. Ask the course for a new one.' }, { status: 404 });
  const c = p.event.course;
  return NextResponse.json({
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
  return NextResponse.json({ status: r.value.status });
}
