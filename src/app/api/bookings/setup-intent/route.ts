import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { rateLimit, evidentiaryIp } from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Creates (or reuses) a Stripe Customer and a SetupIntent so the booking page
// can save a card WITHOUT charging it. The resulting PaymentMethod gets reused
// later — by the cancellation-fee cron at the policy cutoff, and eventually by
// the check-in/pay-for-round flow — both off-session, which is why we ask
// Stripe to validate the card for off-session use right now while the golfer
// is present (best chance of clearing 3D Secure, if required).
// This endpoint is deliberately UNAUTHENTICATED — a golfer books without an
// account, so requiring a session here would break the product. What it is not
// allowed to be is uncapped: every call creates a Stripe Customer and a
// SetupIntent, so an unthrottled loop fills the Stripe dashboard with junk
// customers and runs up API usage, on an endpoint anyone can find. (Found by
// the CODEMAP CM-1 security audit, 2026-09-16, which also found that the code
// map was mislabelling this route as session-guarded and hiding it.)
//
// Fails OPEN, unlike the birdie: keys. Those gate paid AI spend, where refusing
// on a broken counter is the safe side. Here the cost of refusing is a golfer
// who cannot save a card and does not book — lost revenue beats junk records.
export async function POST(req: NextRequest) {
  const ip = evidentiaryIp(req);
  if (!(await rateLimit(`setup-intent:${ip}`, 10, 3600))) {
    return NextResponse.json({ error: 'Too many attempts. Wait a minute and try again.' }, { status: 429 });
  }

  const { email, name } = await req.json();
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }
  // Also capped per address, so one golfer's inbox cannot be used to mint
  // customers from a rotating set of IPs.
  if (!(await rateLimit(`setup-intent-email:${email.trim().toLowerCase()}`, 8, 3600))) {
    return NextResponse.json({ error: 'Too many attempts for this email. Wait a minute and try again.' }, { status: 429 });
  }

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
