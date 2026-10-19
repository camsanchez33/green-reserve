import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { createSale, settleOpenSale, saleView, reconcileStuckSale, cancelSaleIntent, whyNotOpen, type SaleView } from '@/lib/shop-sales';
import { rateLimit } from '@/lib/rate-limit';
import { sendSms } from '@/lib/twilio';
import { normalizePhone } from '@/lib/golfer-otp';
import { sendShopSalePayLinkEmail, isPlaceholderEmail } from '@/lib/email';

// POS-2 (Cam 2026-10-19): walk-up pro-shop sales. Selling needs shop.sell;
// recording cash also needs sheet.counter_payment (the same power as marking a
// round paid at the counter). Only card pay links need a current agreement —
// cash is never blocked. The course is always the session's.

async function gate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'shop.sell');
  if (denied) return { res: denied };
  return { session };
}

const LINES = { select: { name: true, unitPriceCents: true, quantity: true }, orderBy: { id: 'asc' as const } };

/** Today's sales and any still waiting on a pay link, newest first. */
export async function GET() {
  const g = await gate();
  if ('res' in g) return g.res;
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000);
  // A card payment whose request never finished is settled from Stripe here.
  const stuck = await prisma.shopSale.findMany({ where: { courseId: g.session.courseId, status: 'paying' }, select: { id: true }, take: 10 });
  for (const s of stuck) {
    try { await reconcileStuckSale(g.session.courseId, s.id); }
    catch (err) { console.error(JSON.stringify({ ev: 'shop_sale.reconcile.fail', saleId: s.id, error: err instanceof Error ? err.message : String(err) })); }
  }
  const sales = await prisma.shopSale.findMany({
    where: { courseId: g.session.courseId, OR: [{ createdAt: { gte: since } }, { status: { in: ['open', 'paying'] } }] },
    orderBy: { createdAt: 'desc' }, take: 200, include: { lines: LINES },
  });
  return NextResponse.json({ sales: sales.map(saleView) });
}

/** Text or email an open sale's pay link. Never throws; says what went wrong. */
async function sendLink(courseId: string, sale: SaleView, payToken: string, via: 'sms' | 'email', courseName: string): Promise<string | null> {
  // Security review: links cost us a text each; a staff login can't send unlimited.
  if (!(await rateLimit(`shop-link:course:${courseId}`, 60, 3600))) return 'Too many pay links this hour — take cash, or try again later.';
  if (!(await rateLimit(`shop-link:sale:${sale.id}`, 5, 3600))) return 'This sale’s link has been sent 5 times this hour — take cash instead.';
  const payUrl = `${process.env.NEXT_PUBLIC_URL}/pay/shop/${sale.id}?token=${payToken}`;
  try {
    if (via === 'sms') {
      if ((sale.customerPhone || '').replace(/\D/g, '').length < 10) return 'Add a mobile number to text the link.';
      const to = normalizePhone(sale.customerPhone);
      if (!to.startsWith('+1')) return 'Pay links can only be texted to US and Canadian numbers — email it instead.';
      await sendSms(to, `${courseName}: pay $${(sale.totalCents / 100).toFixed(2)} for your pro shop items here (Apple Pay, Google Pay or card): ${payUrl} Reply STOP to opt out.`);
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
  const g = await gate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const pay = body.pay === 'cash' ? 'cash' : body.pay === 'link' ? 'link' : null;
  if (!pay) return NextResponse.json({ error: 'Choose cash or a pay link.' }, { status: 400 });
  if (pay === 'cash') {
    const denied = requirePermission(g.session, 'sheet.counter_payment');
    if (denied) return denied;
  } else {
    const agreementBlock = await requireAgreementCurrent(g.session.courseId); // AG-3 §3
    if (agreementBlock) return agreementBlock;
  }
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
  const sendError = await sendLink(g.session.courseId, sale, payToken, via, course.name);
  // The sale exists either way; staff can resend or take cash for it from the list.
  return NextResponse.json({ sale, sent: !sendError, ...(sendError ? { sendError } : {}) }, { status: sendError ? 207 : 200 });
}

export async function PATCH(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Missing sale.' }, { status: 400 });
  if (body.action === 'void' || body.action === 'paid_cash') {
    if (body.action === 'paid_cash') {
      const denied = requirePermission(g.session, 'sheet.counter_payment');
      if (denied) return denied;
    }
    // Only an open sale: never stop the card payment of a customer paying right
    // now. A stale 'paying' claim is settled from Stripe first.
    try { await reconcileStuckSale(g.session.courseId, id); }
    catch (err) { console.error(JSON.stringify({ ev: 'shop_sale.reconcile.fail', saleId: id, error: err instanceof Error ? err.message : String(err) })); }
    const current = await prisma.shopSale.findFirst({ where: { id, courseId: g.session.courseId }, select: { status: true } });
    if (!current) return NextResponse.json({ error: 'Sale not found.' }, { status: 404 });
    if (current.status !== 'open') return NextResponse.json({ error: whyNotOpen(current.status) }, { status: 409 });
    // A sale with a card payment started: stop that payment first, so it can
    // never go through after the sale is voided or taken in cash.
    try {
      const blocked = await cancelSaleIntent(g.session.courseId, id);
      if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
    } catch (err) {
      return NextResponse.json({ error: `Couldn’t stop the card payment link (${err instanceof Error ? err.message : 'Stripe error'}). Nothing was changed — try again.` }, { status: 502 });
    }
    const r = await settleOpenSale(g.session.courseId, id, body.action);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ sale: r.value });
  }
  if (body.action === 'resend') {
    const agreementBlock = await requireAgreementCurrent(g.session.courseId); // AG-3 §3
    if (agreementBlock) return agreementBlock;
    const s = await prisma.shopSale.findFirst({ where: { id, courseId: g.session.courseId }, include: { lines: LINES, course: { select: { name: true } } } });
    if (!s) return NextResponse.json({ error: 'Sale not found.' }, { status: 404 });
    if (s.status !== 'open' || !s.payToken) return NextResponse.json({ error: 'Only an unpaid link sale can be sent again.' }, { status: 409 });
    const err = await sendLink(g.session.courseId, saleView(s), s.payToken, body.via === 'email' ? 'email' : 'sms', s.course.name);
    if (err) return NextResponse.json({ error: err }, { status: 502 });
    return NextResponse.json({ sent: true });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
