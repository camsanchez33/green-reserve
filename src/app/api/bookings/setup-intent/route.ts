import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';
import { stripe } from '@/lib/stripe';

// Creates (or reuses) a Stripe Customer and a SetupIntent so the booking page
// can save a card WITHOUT charging it. The resulting PaymentMethod gets reused
// later — by the cancellation-fee cron at the policy cutoff, and eventually by
// the check-in/pay-for-round flow — both off-session, which is why we ask
// Stripe to validate the card for off-session use right now while the golfer
// is present (best chance of clearing 3D Secure, if required).
export async function POST(req: NextRequest) {
  const { email, name } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  try {
    const golferSession = await getGolferSession();
    let customerId: string | null = null;

    if (golferSession) {
      const golfer = await prisma.golferAccount.findUnique({ where: { id: golferSession.golferId } });
      customerId = golfer?.stripeCustomerId || null;
    }

    if (!customerId) {
      const customer = await stripe.customers.create({ email, name: name || undefined });
      customerId = customer.id;
      if (golferSession) {
        await prisma.golferAccount.update({ where: { id: golferSession.golferId }, data: { stripeCustomerId: customerId } });
      }
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
    });

    return NextResponse.json({ clientSecret: setupIntent.client_secret, customerId });
  } catch (e) {
    console.error('Setup intent error:', e);
    const msg = e instanceof Error ? e.message : 'Could not prepare card setup.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
