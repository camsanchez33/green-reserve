import { NextRequest, NextResponse, after } from 'next/server';
import { termOf, passOnSale } from '@/lib/season-pass';
import { todayIn } from '@/lib/course-time';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { requireRegisterOpen } from '@/lib/register-open';
import { amountsDue } from '@/lib/membership-dues';
import { paidUntilRenewal } from '@/lib/membership-renewal';
import { payDuesByCard } from '@/lib/dues-payment';
import { startDuesOnReader, duesReaderStatus, cancelDuesOnReader } from '@/lib/dues-reader';
import { simulateReaderTap } from '@/lib/card-reader';
import { afterDuesPaid } from '@/lib/member-welcome';

// Memberships item 1 (Cam 2026-11-16): staff take a membership's dues at the course — "Card reader, Cash or Type a
// card (Stripe's own fields)". Cash stays the members route's mark_paid (register open, counted in the close-out).
//   GET  ?id=          what is due: the dues, the 1% GreenReserve fee a card pays on top, and the reader's state
//   POST {id, how: 'card', paymentMethodId, expectedTotalCents}   a typed card (lib/dues-payment, the pay link's path)
//   POST {id, how: 'reader', readerId}                            on the card reader (lib/dues-reader; register open)
//   PATCH {id, action: 'status' | 'cancel' | 'simulate'}          the reader payment
// Taking dues is members.edit, as cash (mark_paid) is; a card payment needs a current agreement. Course = the session's.

async function gate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'members.edit');
  if (denied) return { res: denied };
  return { session, actor: session.email ?? '' };
}

export async function GET(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const m = await prisma.courseMembership.findFirst({ where: { id, courseId: g.session.courseId }, include: { tier: true, course: { select: { stripeAccountId: true, stripeAccountActive: true, timezone: true } } } });
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const due = amountsDue(m);
  const term = termOf(m.tier);
  return NextResponse.json({
    status: m.status,
    paid: paidUntilRenewal(m, term),
    duesCents: due.duesCents, annualCents: due.annualCents, initiationCents: due.initiationCents,
    /** Cash pays the dues alone; a card (typed or on the reader) pays dues + GreenReserve's 1%. */
    cashCents: due.duesCents, feeCents: due.feeCents, cardTotalCents: due.totalCents,
    termMonths: m.tier?.termMonths ?? 12,
    // Memberships item 4: a season pass's dates (it ends on the last), and whether it can still be bought.
    pass: term.kind === 'pass' ? { startsOn: term.startsOn, endsOn: term.endsOn } : null,
    onSale: passOnSale(term, todayIn(m.course.timezone)),
    cardsReady: !!(m.course.stripeAccountActive && m.course.stripeAccountId),
    onReader: !!m.duesReaderId,
  });
}

export async function POST(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const agreementBlock = await requireAgreementCurrent(g.session.courseId); // AG-3 §3: card payments
  if (agreementBlock) return agreementBlock;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Pick a member.' }, { status: 400 });
  const before = await prisma.courseMembership.findFirst({ where: { id, courseId: g.session.courseId }, select: { id: true } });
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (body.how === 'card') {
    const r = await payDuesByCard({ membershipId: id, courseId: g.session.courseId, paymentMethodId: body.paymentMethodId, expectedTotalCents: body.expectedTotalCents, by: 'staff' });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    after(afterDuesPaid(id, { amountCents: r.chargedCents, feeCents: r.feeCents, firstPayment: r.firstPayment }).catch(err => console.error('Dues receipt email error:', err)));
    return NextResponse.json({ status: 'paid', amountPaidCents: r.chargedCents, expiresAt: r.expiresAt });
  }
  if (body.how === 'reader') {
    const readerId = typeof body.readerId === 'string' ? body.readerId : '';
    if (!readerId) return NextResponse.json({ error: 'Pick a card reader.' }, { status: 400 });
    // DRAWER-1: the card reader is the register's — dues go on it only while the register is open.
    { const closed = await requireRegisterOpen(g.session.courseId); if (closed) return NextResponse.json({ error: closed, registerClosed: true }, { status: 409 }); }
    const r = await startDuesOnReader(g.session.courseId, id, readerId, g.actor);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r.value);
  }
  return NextResponse.json({ error: 'Say how the dues are being paid.' }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Pick a member.' }, { status: 400 });
  if (body.action === 'simulate') {
    const m = await prisma.courseMembership.findFirst({ where: { id, courseId: g.session.courseId }, select: { duesReaderId: true } });
    if (!m?.duesReaderId) return NextResponse.json({ error: 'These dues aren’t on a card reader.' }, { status: 409 });
    const r = await simulateReaderTap(g.session.courseId, m.duesReaderId, body.card === 'declined' ? 'declined' : 'ok');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ tapped: true });
  }
  if (body.action !== 'status' && body.action !== 'cancel') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const r = body.action === 'status' ? await duesReaderStatus(g.session.courseId, id, g.actor) : await cancelDuesOnReader(g.session.courseId, id, g.actor);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  // This look recorded the payment (only one look does): the receipt, and the welcome for a member added at the counter.
  const rec = r.value.recorded;
  if (rec) after(afterDuesPaid(id, rec).catch(err => console.error('Dues receipt email error:', err)));
  const { recorded: _recorded, ...out } = r.value;
  return NextResponse.json(out);
}
