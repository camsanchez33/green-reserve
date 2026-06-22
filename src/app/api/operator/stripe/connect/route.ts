import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getOperatorSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const from = req.nextUrl.searchParams.get('from') === 'onboarding' ? 'onboarding' : 'settings';
    const session = await getOperatorSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
    if (!course) return NextResponse.json({ error: 'No course' }, { status: 404 });

    // If already connected, return status
    if (course.stripeAccountActive) {
      return NextResponse.json({ connected: true, accountId: course.stripeAccountId });
    }

    if (!process.env.NEXT_PUBLIC_URL) {
      return NextResponse.json({ error: 'Server misconfigured: NEXT_PUBLIC_URL is not set.' }, { status: 500 });
    }

    // Create a Stripe Connect account link
    let accountId = course.stripeAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({ type: 'express' });
      accountId = account.id;
      await prisma.course.update({ where: { id: course.id }, data: { stripeAccountId: accountId } });
    }

    const refreshPage = from === 'onboarding' ? '/dashboard/onboarding' : '/dashboard/settings';
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.NEXT_PUBLIC_URL}${refreshPage}?stripe=refresh`,
      return_url: `${process.env.NEXT_PUBLIC_URL}/api/operator/stripe/callback?accountId=${accountId}&from=${from}`,
      type: 'account_onboarding',
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (e) {
    console.error('Stripe connect error:', e);
    const msg = e instanceof Error ? e.message : 'Unknown error creating Stripe Connect link.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
