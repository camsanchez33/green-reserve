// ADMIN-C Money → Disputes (PR2b): the evidence pack for one disputed booking.
// Only what GreenReserve actually recorded — when and how it was booked, the
// terms the golfer ticked, the card saved, the fee terms stored on the booking,
// every email and text we sent about it, what happened at the course, and every
// payment. Nothing is reconstructed or paraphrased: a fee term the booking did
// not record is left out rather than guessed. The owner uploads the file to
// Stripe's dispute form (Stripe only takes a response on its own site).
import { prisma } from './prisma';
import { LATE_FEE_TIMINGS } from './cancel-policy';

export type EvidenceInput = {
  bookingId: string; courseName: string; timezone: string;
  golferName: string; golferEmail: string; golferPhone: string;
  players: number; teeDate: string; teeTime: string;
  createdAt: Date; source: string;
  termsAcceptedAt: Date | null; termsVersion: string | null;
  cardSaved: boolean;
  policy: { cancellationHours: number | null; lateFeeTiming: string | null; lateFeeCents: number; noShowFeeCents: number; autoNoShowMinutes: number | null };
  sent: { at: Date; channel: string; kind: string; status: string }[];
  events: { at: Date; type: string; actor: string; amountCents: number | null }[];
  payments: { at: Date; kind: string; amountCents: number; detail: string }[];
  dispute: { amountCents: number; detail: string; openedAt: Date } | null;
};

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const KIND: Record<string, string> = { booking_confirmation: 'Booking confirmation', booking_reminder: 'Reminder' };
const EVENT: Record<string, string> = {
  booking_created: 'Booked', booking_cancelled: 'Cancelled', checked_in: 'Checked in', no_show_marked: 'Marked no-show',
  no_show_cleared: 'No-show cleared', fee_charged: 'Fee charged', fee_refunded: 'Fee refunded', booking_moved: 'Moved to another tee time', price_changed: 'Price changed at the counter',
};

/** The pack as plain text, one fact per line, times in the course's own time zone. */
export function evidenceText(e: EvidenceInput): string {
  const at = (d: Date) => d.toLocaleString('en-US', { timeZone: e.timezone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const out: string[] = [];
  const h = (t: string) => { out.push('', t, '-'.repeat(t.length)); };
  out.push(`Dispute evidence — booking ${e.bookingId}`, `${e.courseName}, prepared by GreenReserve (greenreserve.app)`);
  if (e.dispute) out.push(`Disputed: ${money(e.dispute.amountCents)}, opened ${at(e.dispute.openedAt)}. ${e.dispute.detail}`);

  h('The booking');
  out.push(`Golfer: ${e.golferName} <${e.golferEmail}>${e.golferPhone ? `, ${e.golferPhone}` : ''}`);
  out.push(`Round: ${e.teeDate} at ${e.teeTime}, ${e.players} player${e.players === 1 ? '' : 's'}, ${e.courseName}`);
  out.push(`Booked: ${at(e.createdAt)} ${e.source === 'online' ? 'by the golfer on greenreserve.app' : `by the course (${e.source.replace('_', ' ')})`}`);
  out.push(e.termsAcceptedAt
    ? `Terms: the golfer ticked "I agree" to the booking terms and the course's cancellation policy at ${at(e.termsAcceptedAt)}${e.termsVersion ? ` (terms version ${e.termsVersion})` : ''}.`
    : 'Terms: no recorded agreement on this booking (booked before agreement was recorded, or by the course).');
  out.push(e.cardSaved ? 'Card: the golfer saved their card at booking, for charges under the policy below.' : 'Card: no card was saved at booking.');

  h('Fee terms recorded on the booking');
  const p = e.policy;
  let any = false;
  // Mirrors describePolicy(): a cancellation window only exists when there is a
  // late fee — with none, the golfer was told they could cancel any time.
  if (p.lateFeeCents > 0) {
    if (p.cancellationHours !== null) out.push(`Free cancellation until ${p.cancellationHours} hours before the tee time.`);
    // A booking from before timings were recorded holds at the cutoff (holdsAtCutoff()).
    const timingKey = p.lateFeeTiming ?? 'hold_at_cutoff';
    const timing = LATE_FEE_TIMINGS.find(t => t.key === timingKey)?.label;
    out.push(`Late-cancellation fee: ${money(p.lateFeeCents)}${timing ? ` — ${timing.toLowerCase()}` : ''}.`); any = true;
  }
  // Under "cancel late or don't show" with no separate no-show fee, the no-show
  // amount IS the late fee (noShowTotalCents) — one fee, already named above.
  const sameFee = p.lateFeeTiming === 'late_cancel_or_no_show' && p.noShowFeeCents === p.lateFeeCents;
  if (p.noShowFeeCents > 0 && !sameFee) { out.push(`No-show fee: ${money(p.noShowFeeCents)}.`); any = true; }
  if (p.autoNoShowMinutes !== null) { out.push(`A group not checked in ${p.autoNoShowMinutes} minutes after its tee time is marked a no-show.`); any = true; }
  if (!any) out.push('No fee terms were recorded on this booking.');

  h('What we sent the golfer');
  if (e.sent.length === 0) out.push('Nothing recorded.');
  for (const s of e.sent) out.push(`${at(s.at)} — ${KIND[s.kind] ?? s.kind.replace(/_/g, ' ')} (${s.channel}), ${s.status === 'sent' ? 'accepted for delivery' : s.status === 'skipped' ? 'not sent, no inbox' : 'failed to send'}`);

  h('What happened');
  if (e.events.length === 0) out.push('Nothing recorded.');
  for (const ev of e.events) out.push(`${at(ev.at)} — ${EVENT[ev.type] ?? ev.type.replace(/_/g, ' ')}${ev.amountCents ? `, ${money(ev.amountCents)}` : ''} (by ${ev.actor})`);

  h('Payments');
  if (e.payments.length === 0) out.push('Nothing recorded.');
  for (const pm of e.payments) out.push(`${at(pm.at)} — ${pm.kind.replace(/_/g, ' ')} ${money(pm.amountCents)}${pm.detail ? ` · ${pm.detail}` : ''}`);
  return out.join('\n') + '\n';
}

/** Everything the pack needs for one booking, or null when it doesn't exist. */
export async function loadEvidence(bookingId: string): Promise<EvidenceInput | null> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, golferName: true, golferEmail: true, golferPhone: true, players: true, createdAt: true, source: true,
      termsAcceptedAt: true, termsVersion: true, stripePaymentMethodId: true,
      cancellationHoursAtBooking: true, lateFeeTimingAtBooking: true, cancellationFeeTotal: true, noShowFeeTotal: true, autoNoShowMinutesAtBooking: true,
      course: { select: { name: true, timezone: true } }, teeTime: { select: { date: true, time: true } },
      paymentEvents: { select: { createdAt: true, kind: true, amountCents: true, detail: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!b) return null;
  const [sent, events] = await Promise.all([
    prisma.sentMessage.findMany({ where: { bookingId }, select: { createdAt: true, channel: true, kind: true, status: true }, orderBy: { createdAt: 'asc' } }),
    prisma.bookingEvent.findMany({ where: { bookingId }, select: { occurredAt: true, type: true, actorType: true, amountCents: true }, orderBy: { occurredAt: 'asc' } }),
  ]);
  const opened = b.paymentEvents.filter(p => p.kind === 'dispute_opened').at(-1);
  return {
    bookingId: b.id, courseName: b.course.name, timezone: b.course.timezone || 'America/New_York',
    golferName: b.golferName, golferEmail: b.golferEmail, golferPhone: b.golferPhone,
    players: b.players, teeDate: b.teeTime.date, teeTime: b.teeTime.time,
    createdAt: b.createdAt, source: b.source,
    termsAcceptedAt: b.termsAcceptedAt, termsVersion: b.termsVersion,
    cardSaved: !!b.stripePaymentMethodId,
    policy: {
      cancellationHours: b.cancellationHoursAtBooking, lateFeeTiming: b.lateFeeTimingAtBooking,
      lateFeeCents: b.cancellationFeeTotal, noShowFeeCents: b.noShowFeeTotal, autoNoShowMinutes: b.autoNoShowMinutesAtBooking,
    },
    sent: sent.map(s => ({ at: s.createdAt, channel: s.channel, kind: s.kind, status: s.status })),
    events: events.map(e => ({ at: e.occurredAt, type: e.type, actor: e.actorType, amountCents: e.amountCents })),
    payments: b.paymentEvents.map(p => ({ at: p.createdAt, kind: p.kind, amountCents: p.amountCents, detail: p.detail })),
    dispute: opened ? { amountCents: opened.amountCents, detail: opened.detail, openedAt: opened.createdAt } : null,
  };
}
