import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe, chargeOnConnectedAccount } from '@/lib/stripe';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { statementForPage, chargeStatement, statementCardTerms, statementLink, nextCharge } from '@/lib/member-statements';
import { sendStatementPaidEmail } from '@/lib/email';

// MEM-ACCT part 2: the member's statement pay link (/statement/[id]?token=…). Token-gated, no login.
// GET shows it. POST pays it by card; on a tier that charges automatically the member may tick a
// separate box to have this card charged for later statements (Cam 2026-10-30). POST
// { action: 'stop_card' } turns that off.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await statementForPage(id, req.nextUrl.searchParams.get('token') ?? '');
  if (!r) return NextResponse.json({ error: 'This statement link is not valid. Ask the course for a new one.' }, { status: 404 });
  const { st, lines } = r;
  const auto = st.membership.tier?.accountSettle === 'auto';
  return NextResponse.json({
    period: st.period, totalCents: st.totalCents, status: st.status === 'paid_offline' ? 'paid' : st.status, dueAt: st.dueAt, paidAt: st.paidAt,
    autoChargeAt: st.status === 'open' && st.membership.accountPaymentMethodId && auto ? nextCharge(st) : null,
    courseName: st.course.name, brandColor: st.course.brandColor, logoUrl: st.course.logoUrl,
    canPay: !!st.course.stripeAccountId && st.course.stripeAccountActive,
    offerSaveCard: auto, cardSaved: !!st.membership.accountPaymentMethodId, cardTerms: auto ? statementCardTerms(st.course.name) : '',
    lines: lines.map(l => ({ at: l.createdAt, note: l.note || l.kind, amountCents: l.amountCents })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await rateLimit(`statement-pay:${clientIp(req)}`, 100, 300)) || !(await rateLimit(`statement-pay:${id}`, 8, 600))) {
    return NextResponse.json({ error: 'Too many tries — wait a few minutes and try again.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({})) as { token?: unknown; paymentMethodId?: unknown; saveCard?: unknown; agree?: unknown; action?: unknown; expectedTotalCents?: unknown };
  const r = await statementForPage(id, String(body.token ?? ''));
  if (!r) return NextResponse.json({ error: 'This statement link is not valid. Ask the course for a new one.' }, { status: 404 });
  const { st } = r;
  const m = st.membership;

  if (body.action === 'stop_card') {
    await prisma.courseMembership.update({ where: { id: m.id }, data: { accountCustomerId: '', accountPaymentMethodId: '', accountCardConsentAt: null, accountCardTerms: '' } });
    await prisma.memberStatement.updateMany({ where: { membershipId: m.id, status: 'open' }, data: { autoChargeAt: null, autoRetryAt: null } });
    return NextResponse.json({ ok: true });
  }

  if (st.status !== 'open') return NextResponse.json({ error: 'This statement is already paid. Thank you!' }, { status: 409 });
  if (!st.course.stripeAccountId || !st.course.stripeAccountActive) return NextResponse.json({ error: 'This course can’t take card payments yet — please pay at the course.' }, { status: 422 });
  if (Number(body.expectedTotalCents) !== st.totalCents) return NextResponse.json({ error: 'The total changed since this page loaded — refresh to see it.' }, { status: 409 });
  const pm = String(body.paymentMethodId ?? '');
  if (!pm.startsWith('pm_')) return NextResponse.json({ error: 'Card details are missing — try again.' }, { status: 400 });
  const saveCard = body.saveCard === true && m.tier?.accountSettle === 'auto';
  if (saveCard && body.agree !== true) return NextResponse.json({ error: 'Tick the box to agree to future statements being charged to this card.' }, { status: 400 });

  let customerId: string;
  try {
    const customer = await stripe.customers.create({ email: m.golfer?.email || m.inviteEmail || undefined, name: m.inviteName || undefined, metadata: { membershipId: m.id, source: 'member_statement' } });
    await stripe.paymentMethods.attach(pm, { customer: customer.id });
    customerId = customer.id;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? `That card can’t be used — ${err.message}` : 'That card can’t be used — try another.' }, { status: 402 });
  }
  const paid = await chargeStatement(st.id, { customerId, paymentMethodId: pm, idempotencyKey: `statement-${st.id}-${pm}`, actor: 'golfer' }, chargeOnConnectedAccount);
  if (paid.status === 'declined') return NextResponse.json({ error: `Payment failed: ${paid.error}` }, { status: 402 });
  if (paid.status === 'skipped') return NextResponse.json({ error: paid.why === 'being paid now' ? 'This statement is being paid right now — wait a moment and refresh.' : 'This statement can’t be paid right now — refresh and look again.' }, { status: 409 });

  // The separate box: keep this card, and the exact words they agreed to, for later statements.
  if (saveCard) {
    await prisma.courseMembership.update({ where: { id: m.id }, data: { accountCustomerId: customerId, accountPaymentMethodId: pm, accountCardConsentAt: new Date(), accountCardTerms: statementCardTerms(st.course.name) } });
  }
  const email = m.golfer?.email || m.inviteEmail;
  if (email) after(sendStatementPaidEmail({ name: m.inviteName || [m.golfer?.firstName, m.golfer?.lastName].filter(Boolean).join(' '), email, courseName: st.course.name, period: st.period, amountCents: paid.amountCents, cardSaved: saveCard, link: statementLink(st) }).catch(console.error));
  return NextResponse.json({ ok: true, amountCents: paid.amountCents, cardSaved: saveCard });
}
