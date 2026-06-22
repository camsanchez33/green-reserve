import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId');
  const page = req.nextUrl.searchParams.get('from') === 'onboarding' ? '/dashboard/onboarding' : '/dashboard/settings';
  if (!accountId) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}${page}?stripe=error`);

  const account = await stripe.accounts.retrieve(accountId);
  const isActive = account.charges_enabled && account.payouts_enabled;

  await prisma.course.updateMany({
    where: { stripeAccountId: accountId },
    data: { stripeAccountActive: isActive },
  });

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}${page}?stripe=${isActive ? 'success' : 'pending'}`);
}
