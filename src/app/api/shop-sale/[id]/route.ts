import { NextRequest, NextResponse } from 'next/server';
import { saleForPayPage, chargeSale } from '@/lib/shop-sales';
import { rateLimit, clientIp } from '@/lib/rate-limit';

// POS-2: the customer's side of a walk-up sale's pay link. Token-gated like the
// round pay link (/api/checkin/[bookingId]); no login.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const sale = await saleForPayPage(id, token);
  if (!sale) return NextResponse.json({ error: 'This pay link is not valid any more. Ask the pro shop for a new one.' }, { status: 404 });
  return NextResponse.json({
    status: sale.status === 'paying' ? 'open' : sale.status, totalCents: sale.totalCents,
    courseName: sale.course.name, brandColor: sale.course.brandColor, logoUrl: sale.course.logoUrl,
    lines: sale.lines,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Per sale: one leaked link can't be used to test cards against the course's
  // Stripe account. The IP ceiling is the check-in page's: a clubhouse wifi full
  // of customers must not lock each other out.
  if (!(await rateLimit(`shop-sale-pay:${clientIp(req)}`, 100, 300)) || !(await rateLimit(`shop-sale-pay:sale:${id}`, 5, 600))) {
    return NextResponse.json({ error: 'Too many tries — wait a few minutes, or pay at the pro shop.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({})) as { token?: unknown; paymentMethodId?: unknown; expectedTotalCents?: unknown };
  const r = await chargeSale(id, String(body.token ?? ''), String(body.paymentMethodId ?? ''), Number(body.expectedTotalCents));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ status: r.value.status });
}
