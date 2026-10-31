import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { createSale, findSales, voidCashSale, settleOpenSale, saleView, reconcileStuckSale, cancelSaleIntent, whyNotOpen, refundSale, sendShopRefund, reverseShopRefundTax, hasDiscount, SALE_INCLUDE, type SaleView } from '@/lib/shop-sales';
import { rateLimit } from '@/lib/rate-limit';
import { ringUpCash } from '@/lib/register';
import { startReaderPayment, readerSaleStatus, cancelReaderPayment, simulateTap } from '@/lib/card-reader';
import { sendSms } from '@/lib/twilio';
import { normalizePhone } from '@/lib/golfer-otp';
import { sendShopSalePayLinkEmail, sendShopReceiptEmail, isPlaceholderEmail } from '@/lib/email';

// POS-2 (Cam 2026-10-19): walk-up pro-shop sales. Selling needs shop.sell;
// recording cash also needs sheet.counter_payment (the same power as marking a
// round paid at the counter). Only card pay links need a current agreement —
// cash is never blocked. The course is always the session's.
// POS-3 (Cam 2026-10-24): a discount needs shop.discount; a refund needs
// money.refund (cash recorded, card through Stripe) — or, for a return by item,
// shop.return (Cam 2026-10-31); receipts go to whoever
// asks, by email or text.
// POS-3 R3: pay 'reader' sends the sale to the course's card reader (shop.sell,
// a current agreement and Stripe, as for a pay link); the register then asks
// reader_status until it is paid, declined or cancelled.
// MEM-ACCT 1b (Cam 2026-10-31): pay 'account' puts the items on a member's account (their
// monthly statement) — sheet.counter_payment like cash, and like cash never waits on Stripe.

async function gate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'shop.sell');
  if (denied) return { res: denied };
  return { session };
}

/** Today's sales and any still waiting on a pay link, newest first. */
export async function GET(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  // Dead end 15: a past day, or a search across 90 days (the register's history).
  const day = req.nextUrl.searchParams.get('day') ?? '';
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (day || q) {
    const r = await findSales(g.session.courseId, { day: day || undefined, q });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ sales: r.value });
  }
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000);
  // A card payment whose request never finished is settled from Stripe here.
  const stuck = await prisma.shopSale.findMany({ where: { courseId: g.session.courseId, status: 'paying' }, select: { id: true }, take: 10 });
  for (const s of stuck) {
    try { await reconcileStuckSale(g.session.courseId, s.id); }
    catch (err) { console.error(JSON.stringify({ ev: 'shop_sale.reconcile.fail', saleId: s.id, error: err instanceof Error ? err.message : String(err) })); }
  }
  const sales = await prisma.shopSale.findMany({
    // PRICE-3: a golfer's unpaid online pack sale isn't the counter's to chase — listed only while recent.
    where: { courseId: g.session.courseId, OR: [{ createdAt: { gte: since } }, { status: { in: ['open', 'paying'] }, NOT: { status: 'open', soldBy: 'online' } }] },
    orderBy: { createdAt: 'desc' }, take: 200, include: SALE_INCLUDE,
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
      await sendSms(to, `${courseName}: pay $${(sale.totalCents / 100).toFixed(2)} for your pro shop items here (Apple Pay, Google Pay or card): ${payUrl} Reply STOP to opt out.`, { kind: 'shop_pay_link_text', courseId });
    } else {
      if (!sale.customerEmail || isPlaceholderEmail(sale.customerEmail) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sale.customerEmail)) return 'Add an email address to send the link.';
      await sendShopSalePayLinkEmail({ courseId, email: sale.customerEmail, name: sale.customerName, courseName, totalCents: sale.totalCents, taxCents: sale.taxCents, lines: sale.lines, payUrl, discountCents: sale.discountCents, discountNote: sale.discountNote });
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
  const pay = body.pay === 'cash' ? 'cash' : body.pay === 'link' ? 'link' : body.pay === 'reader' ? 'reader' : body.pay === 'account' ? 'account' : null;
  if (!pay) return NextResponse.json({ error: 'Choose cash, the card reader or a pay link.' }, { status: 400 });
  const readerId = typeof body.readerId === 'string' ? body.readerId : '';
  if (pay === 'reader' && !readerId) return NextResponse.json({ error: 'Pick a card reader.' }, { status: 400 });
  if (pay === 'cash' || pay === 'account') {
    const denied = requirePermission(g.session, 'sheet.counter_payment');
    if (denied) return denied;
  } else {
    const agreementBlock = await requireAgreementCurrent(g.session.courseId); // AG-3 §3
    if (agreementBlock) return agreementBlock;
  }
  if (hasDiscount(body.discount as never)) {
    const denied = requirePermission(g.session, 'shop.discount');
    if (denied) return denied;
  }
  // POS-3 R2: green fees at the register — today's groups and walk-ins, paid in cash with the items.
  const bookingIds = Array.isArray(body.bookingIds) ? body.bookingIds.filter((x): x is string => typeof x === 'string') : [];
  const walkIns = Array.isArray(body.walkIns) ? body.walkIns as Record<string, unknown>[] : [];
  if (bookingIds.length || walkIns.length) {
    if (pay === 'account') return NextResponse.json({ error: 'Put a round on account from its tee time on the tee sheet; the register puts items on account.' }, { status: 400 });
    if (pay !== 'cash') return NextResponse.json({ error: 'Rounds are paid in cash at the register for now — send a pay link from the tee sheet instead.' }, { status: 400 });
    if (walkIns.length) { const denied = requirePermission(g.session, 'sheet.walkin'); if (denied) return denied; }
    const r = await ringUpCash(g.session.courseId, {
      lines: Array.isArray(body.lines) ? body.lines : [], discount: body.discount as never, cashTenderedCents: body.cashTenderedCents, expectedItemsCents: body.expectedItemsCents,
      taxCalculationId: typeof body.taxCalculationId === 'string' ? body.taxCalculationId : undefined,
      bookingIds,
      walkIns: walkIns.map(w => ({ teeTimeId: String(w.teeTimeId ?? ''), golferName: String(w.golferName ?? ''), golferPhone: String(w.golferPhone ?? ''), golferEmail: String(w.golferEmail ?? ''), players: Number(w.players), cartSelected: w.cartSelected === true, rate: typeof w.rate === 'string' ? w.rate : undefined })),
      soldBy: g.session.email, actor: { type: 'staff', id: g.session.staffId ?? g.session.operatorId },
      customerName: body.customerName as string, customerPhone: body.customerPhone as string, customerEmail: body.customerEmail as string,
    });
    // Rounds already settled when the items failed: the page takes them out of the sale.
    if (!r.ok) return NextResponse.json({ error: r.error, ...('settled' in r ? { settled: r.settled } : {}) }, { status: r.status });
    return NextResponse.json(r.value);
  }
  const via = body.via === 'email' ? 'email' : 'sms';
  const course = await prisma.course.findUnique({ where: { id: g.session.courseId }, select: { name: true, stripeAccountId: true, stripeAccountActive: true } });
  if (!course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  if ((pay === 'link' || pay === 'reader') && (!course.stripeAccountId || !course.stripeAccountActive)) {
    return NextResponse.json({ error: `Connect Stripe on Money → Payouts before ${pay === 'reader' ? 'taking cards' : 'sending pay links'}. Cash works now.` }, { status: 409 });
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
    taxCalculationId: typeof body.taxCalculationId === 'string' ? body.taxCalculationId : undefined,
    discount: body.discount as never, cashTenderedCents: pay === 'cash' ? body.cashTenderedCents : undefined,
    expectedItemsCents: pay === 'cash' || pay === 'account' ? body.expectedItemsCents : undefined,
    membershipId: pay === 'account' && typeof body.membershipId === 'string' ? body.membershipId : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { payToken, ...sale } = r.value;
  if (pay === 'cash' || pay === 'account') return NextResponse.json({ sale });
  if (pay === 'reader') {
    const started = await startReaderPayment(g.session.courseId, sale.id, readerId);
    // The sale exists either way: the register offers the reader again, cash, or void.
    if (!started.ok) return NextResponse.json({ sale, readerError: started.error }, { status: 207 });
    return NextResponse.json({ sale, reader: 'waiting' });
  }
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
  if (body.action === 'reader_start') {
    const agreementBlock = await requireAgreementCurrent(g.session.courseId); // AG-3 §3: card payments
    if (agreementBlock) return agreementBlock;
    const r = await startReaderPayment(g.session.courseId, id, typeof body.readerId === 'string' ? body.readerId : '');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r.value);
  }
  if (body.action === 'reader_status' || body.action === 'reader_cancel') {
    const r = body.action === 'reader_status' ? await readerSaleStatus(g.session.courseId, id) : await cancelReaderPayment(g.session.courseId, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r.value);
  }
  if (body.action === 'reader_simulate') {
    const r = await simulateTap(g.session.courseId, id, body.card === 'declined' ? 'declined' : 'ok');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ tapped: true });
  }
  if (body.action === 'resend') {
    const agreementBlock = await requireAgreementCurrent(g.session.courseId); // AG-3 §3
    if (agreementBlock) return agreementBlock;
    const s = await prisma.shopSale.findFirst({ where: { id, courseId: g.session.courseId }, include: { ...SALE_INCLUDE, course: { select: { name: true } } } });
    if (!s) return NextResponse.json({ error: 'Sale not found.' }, { status: 404 });
    if (s.status !== 'open' || !s.payToken) return NextResponse.json({ error: 'Only an unpaid link sale can be sent again.' }, { status: 409 });
    const err = await sendLink(g.session.courseId, saleView(s), s.payToken, body.via === 'email' ? 'email' : 'sms', s.course.name);
    if (err) return NextResponse.json({ error: err }, { status: 502 });
    return NextResponse.json({ sent: true });
  }
  // Dead end 23 (Cam 2026-10-29: "Same day, before close-out", anyone with the shop permission).
  if (body.action === 'void_cash') {
    // MEM-ACCT 1b: taking a sale off a member's account needs the power that put it on.
    const acct = await prisma.shopSale.findFirst({ where: { id, courseId: g.session.courseId, status: 'paid_account' }, select: { id: true } });
    if (acct) { const denied = requirePermission(g.session, 'sheet.counter_payment'); if (denied) return denied; }
    const r = await voidCashSale(g.session.courseId, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ sale: r.value });
  }
  if (body.action === 'refund') {
    // Launch walk (Cam 2026-10-31): a return by item needs Return items or Issue refunds; a typed amount, Issue refunds.
    const byItem = Array.isArray(body.lines) && body.lines.length > 0;
    const denied = byItem && can(g.session, 'shop.return') ? null : requirePermission(g.session, 'money.refund');
    if (denied) return denied;
    const r = await refundSale(g.session.courseId, id, { amountCents: body.amountCents, reason: body.reason, restock: body.restock, lines: body.lines }, g.session.email);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r.value);
  }
  if (body.action === 'refund_retry') {
    const denied = can(g.session, 'shop.return') ? null : requirePermission(g.session, 'money.refund');
    if (denied) return denied;
    const refundId = typeof body.refundId === 'string' ? body.refundId : '';
    const owned = await prisma.shopSaleRefund.findFirst({ where: { id: refundId, saleId: id, courseId: g.session.courseId }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: 'Refund not found.' }, { status: 404 });
    const r = await sendShopRefund(g.session.courseId, refundId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    if (r.value.status === 'done') await reverseShopRefundTax(refundId); // never throws; the hourly cron retries
    const sale = await prisma.shopSale.findUniqueOrThrow({ where: { id }, include: SALE_INCLUDE });
    return NextResponse.json({ status: r.value.status, sale: saleView(sale) });
  }
  if (body.action === 'receipt') {
    const s = await prisma.shopSale.findFirst({ where: { id, courseId: g.session.courseId }, include: { ...SALE_INCLUDE, course: { select: { name: true, timezone: true } } } });
    if (!s) return NextResponse.json({ error: 'Sale not found.' }, { status: 404 });
    if (s.status !== 'paid_cash' && s.status !== 'paid_card' && s.status !== 'paid_account') return NextResponse.json({ error: 'A receipt is for a paid sale.' }, { status: 409 });
    if (!(await rateLimit(`shop-receipt:course:${g.session.courseId}`, 120, 3600))) return NextResponse.json({ error: 'Too many receipts this hour — try again later.' }, { status: 429 });
    if (!(await rateLimit(`shop-receipt:sale:${id}`, 5, 3600))) return NextResponse.json({ error: 'This receipt has been sent 5 times this hour.' }, { status: 429 });
    const via = body.via === 'sms' ? 'sms' : 'email';
    const to = String(body.to ?? '').trim() || (via === 'sms' ? s.customerPhone : s.customerEmail);
    const v = saleView(s);
    const paidWith = s.status === 'paid_card' ? 'Card' : s.status === 'paid_account' ? 'On account' : 'Cash';
    const paidAt = (s.paidAt ?? s.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: s.course.timezone || 'America/New_York' });
    try {
      if (via === 'sms') {
        if (to.replace(/\D/g, '').length < 10) return NextResponse.json({ error: 'Enter a mobile number for the receipt.' }, { status: 400 });
        const phone = normalizePhone(to);
        if (!phone.startsWith('+1')) return NextResponse.json({ error: 'Receipts can only be texted to US and Canadian numbers — email it instead.' }, { status: 400 });
        const items = v.lines.reduce((n, l) => n + l.quantity, 0);
        await sendSms(phone, `${s.course.name} receipt: ${items} item${items === 1 ? '' : 's'}, $${(s.totalCents / 100).toFixed(2)} ${s.status === 'paid_account' ? 'on your account' : `paid by ${paidWith.toLowerCase()}`}${s.refundedCents ? `, $${(s.refundedCents / 100).toFixed(2)} refunded` : ''}. Ref ${s.id.slice(-8).toUpperCase()}. Thank you! Reply STOP to opt out.`, { kind: 'shop_receipt_text', courseId: g.session.courseId });
      } else {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || isPlaceholderEmail(to)) return NextResponse.json({ error: 'Enter an email address for the receipt.' }, { status: 400 });
        await sendShopReceiptEmail({ email: to.toLowerCase(), name: s.customerName, courseName: s.course.name, courseId: g.session.courseId, saleId: s.id, lines: v.lines,
          discountCents: s.discountCents, discountNote: s.discountNote, taxCents: s.taxCents, totalCents: s.totalCents, paidWith, paidAt, cashTenderedCents: s.cashTenderedCents, refundedCents: s.refundedCents });
      }
    } catch (err) {
      return NextResponse.json({ error: `The receipt didn’t send (${err instanceof Error ? err.message : 'unknown error'}). Try again.` }, { status: 502 });
    }
    // Keep the address the customer gave, so a later receipt or refund note can reach them.
    await prisma.shopSale.update({ where: { id }, data: { receiptSentAt: new Date(), ...(via === 'sms' && !s.customerPhone ? { customerPhone: to.slice(0, 30) } : {}), ...(via === 'email' && !s.customerEmail ? { customerEmail: to.toLowerCase().slice(0, 200) } : {}) } });
    return NextResponse.json({ sent: via });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
