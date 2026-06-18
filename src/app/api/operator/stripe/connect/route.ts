import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getOperatorSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json({ error: 'No course' }, { status: 404 });

  // If already connected, return status
  if (course.stripeAccountActive) {
    return NextResponse.json({ connected: true, accountId: course.stripeAccountId });
  }

  // Create a Stripe Connect account link
  let accountId = course.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({ type: 'express' });
    accountId = account.id;
    await prisma.course.update({ where: { id: course.id }, data: { stripeAccountId: accountId } });
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.NEXT_PUBLIC_URL}/dashboard/settings?stripe=refresh`,
    return_url: `${process.env.NEXT_PUBLIC_URL}/api/operator/stripe/callback?accountId=${accountId}`,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: accountLink.url });
}
