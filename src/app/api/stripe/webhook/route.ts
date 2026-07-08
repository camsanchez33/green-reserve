import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

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

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    const isActive = account.charges_enabled && account.payouts_enabled &&
      account.capabilities?.card_payments === 'active';
    await prisma.course.updateMany({
      where: { stripeAccountId: account.id },
      data: { stripeAccountActive: isActive },
    });
  }

  return NextResponse.json({ received: true });
}
