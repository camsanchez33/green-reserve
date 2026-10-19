import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { createSale, settleOpenSale, saleView, type SaleView } from '@/lib/shop-sales';
import { sendSms } from '@/lib/twilio';
import { normalizePhone } from '@/lib/golfer-otp';
import { sendShopSalePayLinkEmail, isPlaceholderEmail } from '@/lib/email';

// POS-2 (Cam 2026-10-19): walk-up pro-shop sales. Selling needs shop.sell and a
// current agreement; the course is always the session's.

async function gate(write: boolean) {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'shop.sell');
  if (denied) return { res: denied };
  if (write) {
    const agreementBlock = await requireAgreementCurrent(session.courseId); // AG-3 §3
    if (agreementBlock) return { res: agreementBlock };
  }
  return { session };
}

const LINES = { select: { name: true, unitPriceCents: true, quantity: true }, orderBy: { id: 'asc' as const } };

/** Today's sales and any still waiting on a pay link, newest first. */
export async function GET() {
  const g = await gate(false);
  if ('res' in g) return g.res;
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000);
  const sales = await prisma.shopSale.findMany({
    where: { courseId: g.session.courseId, OR: [{ createdAt: { gte: since } }, { status: { in: ['open', 'paying'] } }] },
    orderBy: { createdAt: 'desc' }, take: 200, include: { lines: LINES },
  });
  return NextResponse.json({ sales: sales.map(saleView) });
}

/** Text or email an open sale's pay link. Never throws; says what went wrong. */
async function sendLink(sale: SaleView, payToken: string, via: 'sms' | 'email', courseName: string): Promise<string | null> {
  const payUrl = `${process.env.NEXT_PUBLIC_URL}/pay/shop/${sale.id}?token=${payToken}`;
  try {
    if (via === 'sms') {
      if ((sale.customerPhone || '').replace(/\D/g, '').length < 10) return 'Add a mobile number to text the link.';
      await sendSms(normalizePhone(sale.customerPhone), `${courseName}: pay $${(sale.totalCents / 100).toFixed(2)} for your pro shop items here (Apple Pay, Google Pay or card): ${payUrl} Reply STOP to opt out.`);
    } else {
      if (!sale.customerEmail || isPlaceholderEmail(sale.customerEmail) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sale.customerEmail)) return 'Add an email address to send the link.';
      await sendShopSalePayLinkEmail({ email: sale.customerEmail, name: sale.customerName, courseName, totalCents: sale.totalCents, lines: sale.lines, payUrl });
    }
    return null;
  } catch (err) {
    return `The ${via === 'sms' ? 'text' : 'email'} didn’t send (${err instanceof Error ? err.message : 'unknown error'}).`;
  }
}

export async function POST(req: NextRequest) {
  const g = await gate(true);
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const pay = body.pay === 'cash' ? 'cash' : body.pay === 'link' ? 'link' : null;
  if (!pay) return NextResponse.json({ error: 'Choose cash or a pay link.' }, { status: 400 });
  const via = body.via === 'email' ? 'email' : 'sms';
  const course = await prisma.course.findUnique({ where: { id: g.session.courseId }, select: { name: true, stripeAccountId: true, stripeAccountActive: true } });
  if (!course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  if (pay === 'link' && (!course.stripeAccountId || !course.stripeAccountActive)) {
    return NextResponse.json({ error: 'Connect Stripe on Money → Payouts before sending pay links. Cash works now.' }, { status: 409 });
  }
  if (pay === 'link') {
    // Check the address before anything is created, so a typo doesn't leave an orphan sale.
    const phone = String(body.customerPhone ?? '');
    const email = String(body.customerEmail ?? '').trim();
    if (via === 'sms' && phone.replace(/\D/g, '').length < 10) return NextResponse.json({ error: 'Add a mobile number to text the link.' }, { status: 400 });
    if (via === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Add an email address to send the link.' }, { status: 400 });
  }
  const r = await createSale({
    courseId: g.session.courseId, lines: body.lines, pay, soldBy: g.session.email,
    customerName: body.customerName as string, customerPhone: body.customerPhone as string, customerEmail: body.customerEmail as string,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { payToken, ...sale } = r.value;
  if (pay === 'cash') return NextResponse.json({ sale });
  const sendError = await sendLink(sale, payToken, via, course.name);
  // The sale exists either way; staff can resend or take cash for it from the list.
  return NextResponse.json({ sale, sent: !sendError, ...(sendError ? { sendError } : {}) }, { status: sendError ? 207 : 200 });
}

export async function PATCH(req: NextRequest) {
  const g = await gate(true);
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Missing sale.' }, { status: 400 });
  if (body.action === 'void' || body.action === 'paid_cash') {
    const r = await settleOpenSale(g.session.courseId, id, body.action);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ sale: r.value });
  }
  if (body.action === 'resend') {
    const s = await prisma.shopSale.findFirst({ where: { id, courseId: g.session.courseId }, include: { lines: LINES, course: { select: { name: true } } } });
    if (!s) return NextResponse.json({ error: 'Sale not found.' }, { status: 404 });
    if (s.status !== 'open' || !s.payToken) return NextResponse.json({ error: 'Only an unpaid link sale can be sent again.' }, { status: 409 });
    const err = await sendLink(saleView(s), s.payToken, body.via === 'email' ? 'email' : 'sms', s.course.name);
    if (err) return NextResponse.json({ error: err }, { status: 502 });
    return NextResponse.json({ sent: true });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
