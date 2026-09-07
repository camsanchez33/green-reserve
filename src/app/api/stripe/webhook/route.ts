import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { findBookingByStripeId, recordPaymentEvent } from '@/lib/refund-booking';

// MP-6b: this handled exactly ONE event type (account.updated), so the first
// chargeback was invisible until the bank letter, and a refund issued from the
// Stripe dashboard never reached the ledger. Charges live on the courses'
// connected accounts, so this endpoint must be registered in Stripe as a
// CONNECT webhook ("listen to events on connected accounts") for the charge,
// refund and dispute events to arrive at all — `event.account` is set on those.

const piOf = (v: string | Stripe.PaymentIntent | null | undefined) => (typeof v === 'string' ? v : v?.id ?? '');

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Webhook signature invalid: ${msg}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        const isActive = account.charges_enabled && account.payouts_enabled &&
          account.capabilities?.card_payments === 'active';
        await prisma.course.updateMany({ where: { stripeAccountId: account.id }, data: { stripeAccountActive: isActive } });
        break;
      }

      // A refund that we did not issue (Stripe dashboard, a dispute settlement)
      // — or one we did, arriving a second time. Dedupe on the refund id.
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const booking = await findBookingByStripeId(piOf(charge.payment_intent));
        if (!booking) break;
        const refunds = charge.refunds?.data ?? [];
        for (const r of refunds) {
          const seen = await prisma.paymentEvent.findFirst({ where: { stripeId: r.id }, select: { id: true } });
          if (seen) continue;
          await recordPaymentEvent({
            bookingId: booking.id, kind: 'refund', amountCents: r.amount, stripeId: r.id, actor: 'stripe',
            detail: `Refund recorded from Stripe (${r.reason ?? 'no reason given'})`,
          });
        }
        // Fully refunded round charge → the booking's paymentStatus says so.
        if (charge.refunded && piOf(charge.payment_intent) === booking.roundPaymentIntentId) {
          await prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'refunded' } });
        }
        break;
      }

      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed': {
        const dispute = event.data.object as Stripe.Dispute;
        const booking = await findBookingByStripeId(piOf(dispute.payment_intent));
        if (!booking) break;
        const closed = event.type === 'charge.dispute.closed';
        const kind = closed ? 'dispute_closed' : 'dispute_opened';
        // One row per (dispute, state) — Stripe retries deliveries.
        const marker = `${dispute.id}:${closed ? 'closed' : 'open'}`;
        const seen = await prisma.paymentEvent.findFirst({ where: { stripeId: marker }, select: { id: true } });
        if (seen && !closed) break; // an update on an already-recorded open dispute
        if (!seen) {
          await recordPaymentEvent({
            bookingId: booking.id, kind, amountCents: dispute.amount, stripeId: marker, actor: 'stripe',
            detail: closed ? `Dispute ${dispute.status}` : `Dispute opened: ${dispute.reason}${dispute.evidence_details?.due_by ? ` · evidence due ${new Date(dispute.evidence_details.due_by * 1000).toISOString().slice(0, 10)}` : ''}`,
          });
        }
        break;
      }

      // The card was tried (check-in, late fee, retry) and declined. The
      // check-in path already stamps checkInFailReason; this makes the ledger
      // complete for charges made outside it.
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const booking = await findBookingByStripeId(pi.id);
        if (!booking) break;
        const marker = `${pi.id}:failed:${pi.last_payment_error?.code ?? 'unknown'}`;
        const seen = await prisma.paymentEvent.findFirst({ where: { stripeId: marker }, select: { id: true } });
        if (seen) break;
        await recordPaymentEvent({
          bookingId: booking.id, kind: 'charge_failed', amountCents: pi.amount, stripeId: marker, actor: 'stripe',
          detail: pi.last_payment_error?.message ?? 'Card declined',
        });
        break;
      }

      default:
        // Unhandled types are acknowledged so Stripe stops retrying them.
        break;
    }
  } catch (err) {
    // A handler bug must not make Stripe retry forever; log with the event id
    // so it can be replayed from the dashboard.
    console.error(JSON.stringify({ ev: 'webhook.handler.fail', eventId: event.id, type: event.type, error: err instanceof Error ? err.message : String(err) }));
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
