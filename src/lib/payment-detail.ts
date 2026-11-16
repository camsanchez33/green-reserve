// Revenue → Payments (Cam 2026-11-15, the approved mockup): one payment's side card, read when the row is
// opened (the list is ledger ?rows=1). Who, what it was for, how it was paid (and the card's brand and
// last four, read from Stripe for this one payment only), the money given back on it with the reasons,
// and which receipt and refund actions apply — the page uses the existing routes for those, with their
// own permissions. Read-only; the session's course only.
import { prisma } from './prisma';
import { stripe } from './stripe';
import { describeMoves, moveLabel, methodLabel } from './ledger-view';

export type PaymentLine = { label: string; cents: number };
export type PaymentDetail = {
  id: string; at: string; what: string; label: string; direction: string;
  amountCents: number; greenReserveCents: number; method: string; methodLabel: string;
  who: string; href: string | null;
  card: { brand: string; last4: string; present: boolean } | null;
  lines: PaymentLine[];
  /**
   * Money given back on the same booking (same kind), sale (its items) or event payment, with the reason: a refund,
   * a dispute taking money back, or a dispute won returning it (amount positive). A booking with several payments
   * lists the same refunds on each — never add them up across cards.
   */
  refunds: { id: string; at: string; amountCents: number; reason: string; by: string; kind: 'refund' | 'dispute' | 'dispute_won'; inStripeDirectly: boolean }[];
  bookingId: string | null; saleId: string | null; eventPaymentId: string | null; membershipId: string | null;
  /** Which existing receipt applies: a shop sale's (shop-sales ?receipt=) or a round's (bookings send_receipt). */
  receipt: { kind: 'shop'; saleId: string } | { kind: 'booking'; bookingId: string } | null;
};

const SELECT = { id: true, at: true, what: true, direction: true, method: true, account: true, amountCents: true, platformFeeCents: true, stripeId: true, bookingId: true, saleId: true, membershipId: true, eventPaymentId: true, actor: true, note: true } as const;

/** Pure: a round's lines from the booking (GreenReserve's fee is never one of the course's lines). */
export function bookingLines(b: { players: number; greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; shopItems: { name: string; unitPriceCents: number; quantity: number }[]; shopTaxCents: number | null }): PaymentLine[] {
  const out: PaymentLine[] = [];
  if (b.greenFeeTotal) out.push({ label: `Green fee × ${b.players}`, cents: b.greenFeeTotal });
  if (b.cartFeeTotal) out.push({ label: 'Cart', cents: b.cartFeeTotal });
  if (b.rangeBallsTotal) out.push({ label: 'Range balls', cents: b.rangeBallsTotal });
  for (const s of b.shopItems) out.push({ label: s.quantity > 1 ? `${s.name} × ${s.quantity}` : s.name, cents: s.unitPriceCents * s.quantity });
  if (b.shopTaxCents) out.push({ label: 'Sales tax', cents: b.shopTaxCents });
  return out;
}

async function cardOf(stripeAccount: string, pi: string): Promise<PaymentDetail['card']> {
  try {
    // Optional detail: one quick try, no retry, so a slow Stripe never holds the card up.
    const intent = await stripe.paymentIntents.retrieve(pi, { expand: ['latest_charge'] }, { stripeAccount, timeout: 8_000, maxNetworkRetries: 0 });
    const ch = intent.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    const d = ch?.payment_method_details;
    if (d?.card) return { brand: d.card.brand ?? '', last4: d.card.last4 ?? '', present: false };
    if (d?.card_present) return { brand: d.card_present.brand ?? '', last4: d.card_present.last4 ?? '', present: true };
    return null;
  } catch (err) {
    console.error(JSON.stringify({ ev: 'payment_detail.card_read.fail', error: err instanceof Error ? err.message : String(err) }));
    return null;
  }
}

export async function paymentDetail(courseId: string, moveId: string): Promise<PaymentDetail | null> {
  const m = await prisma.moneyMove.findFirst({ where: { id: moveId, courseId }, select: SELECT });
  if (!m) return null;
  const [d] = await describeMoves(courseId, [m]);
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { stripeAccountId: true, stripeAccountActive: true } });

  // What it was for.
  let lines: PaymentLine[] = [];
  let receipt: PaymentDetail['receipt'] = null;
  // A round paid at the register has both ids: it is the round (the sale's items are their own 'shop' row).
  const isRound = m.what === 'round' && !!m.bookingId;
  if (m.saleId && !isRound) {
    const s = await prisma.shopSale.findFirst({ where: { id: m.saleId, courseId }, select: { status: true, taxCents: true, discountCents: true, discountNote: true, lines: { select: { name: true, unitPriceCents: true, quantity: true, bookingId: true } } } });
    if (s) {
      lines = s.lines.filter(l => !l.bookingId).map(l => ({ label: l.quantity > 1 ? `${l.name} × ${l.quantity}` : l.name, cents: l.unitPriceCents * l.quantity }));
      if (s.discountCents) lines.push({ label: s.discountNote ? `Discount · ${s.discountNote}` : 'Discount', cents: -s.discountCents });
      if (s.taxCents) lines.push({ label: 'Sales tax', cents: s.taxCents });
      if (['paid_cash', 'paid_card', 'paid_account'].includes(s.status)) receipt = { kind: 'shop', saleId: m.saleId };
    }
  } else if (isRound) {
    const b = await prisma.booking.findFirst({ where: { id: m.bookingId!, courseId }, select: { players: true, greenFeeTotal: true, cartFeeTotal: true, rangeBallsTotal: true, shopTaxCents: true, paymentStatus: true, shopItems: { select: { name: true, unitPriceCents: true, quantity: true } } } });
    if (b) {
      lines = bookingLines(b);
      if (['paid', 'paid_offline', 'on_account'].includes(b.paymentStatus)) receipt = { kind: 'booking', bookingId: m.bookingId! };
    }
  } else if (m.eventPaymentId) {
    const e = await prisma.courseEventPayment.findFirst({ where: { id: m.eventPaymentId, courseId }, select: { label: true, amountCents: true } });
    if (e) lines = [{ label: e.label, cents: e.amountCents }];
  }
  if (!lines.length) lines = [{ label: moveLabel(m.what) + (m.note ? ` · ${m.note}` : ''), cents: m.amountCents - m.platformFeeCents }];

  // Money given back on the same thing.
  // A booking carries several kinds of money (a hold given back at check-in is not a refund of the round): same kind only.
  const link = isRound ? { bookingId: m.bookingId!, what: m.what } : m.saleId ? { saleId: m.saleId, what: m.what } : m.eventPaymentId ? { eventPaymentId: m.eventPaymentId } : m.bookingId ? { bookingId: m.bookingId, what: m.what } : null;
  // Money out on it, plus a dispute won (the webhook writes it as money back in, "<dispute>:reinstated").
  const back = m.direction === 'in' && link
    ? await prisma.moneyMove.findMany({ where: { courseId, ...link, OR: [{ direction: 'out' }, { direction: 'in', stripeId: { endsWith: ':reinstated' } }], NOT: { id: m.id } }, orderBy: { at: 'asc' }, select: { id: true, at: true, direction: true, amountCents: true, note: true, actor: true, stripeId: true } })
    : [];

  // Only a course-account card payment is on the course's Stripe account (GreenReserve's own fee row is not).
  const card = m.direction === 'in' && m.account === 'course' && (m.method === 'card' || m.method === 'card_present') && m.stripeId?.startsWith('pi_') && course?.stripeAccountActive && course.stripeAccountId
    ? await cardOf(course.stripeAccountId, m.stripeId) : null;

  return {
    id: m.id, at: m.at.toISOString(), what: m.what, label: moveLabel(m.what), direction: m.direction,
    amountCents: m.amountCents, greenReserveCents: m.platformFeeCents, method: m.method, methodLabel: methodLabel(m.method),
    who: d?.who ?? '', href: d?.href ?? null, card, lines,
    refunds: back.map(o => {
      const dispute = !!o.stripeId?.includes(':');
      const kind = o.direction === 'in' ? 'dispute_won' as const : dispute ? 'dispute' as const : 'refund' as const;
      return { id: o.id, at: o.at.toISOString(), amountCents: o.direction === 'in' ? o.amountCents : -o.amountCents, reason: o.note, by: o.actor, kind, inStripeDirectly: kind === 'refund' && o.actor === 'stripe' };
    }),
    bookingId: m.bookingId, saleId: m.saleId, eventPaymentId: m.eventPaymentId, membershipId: m.membershipId,
    receipt,
  };
}
