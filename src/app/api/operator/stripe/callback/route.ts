import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

// SD-11 (from the SD review): this was unauthenticated and un-try/caught — any
// visitor could make it call stripe.accounts.retrieve with a junk id (a 500
// and wasted quota). It could never attach an account to a course (updateMany
// only flips the flag on rows already holding that id), but it should not be
// callable by strangers at all. The signed-in operator's active course must be
// the one holding the account.
export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_URL || '';
  const accountId = req.nextUrl.searchParams.get('accountId');
  const page = req.nextUrl.searchParams.get('from') === 'onboarding' ? '/dashboard/onboarding' : '/dashboard/settings';
  if (!accountId) return NextResponse.redirect(`${base}${page}?stripe=error`);

  const session = await resolveDashboardSession();
  if (!session) return NextResponse.redirect(`${base}/dashboard/login`);
  if (session.isStaff) return NextResponse.redirect(`${base}/dashboard?stripe=error`);

  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { id: true, stripeAccountId: true } });
  if (!course || course.stripeAccountId !== accountId) return NextResponse.redirect(`${base}${page}?stripe=error`);

  try {
    const account = await stripe.accounts.retrieve(accountId);
    // card_payments capability must be active — charges_enabled/payouts_enabled alone
    // is not sufficient; without card_payments the account cannot accept card charges.
    const isActive = !!(account.charges_enabled && account.payouts_enabled && account.capabilities?.card_payments === 'active');
    await prisma.course.update({ where: { id: course.id }, data: { stripeAccountActive: isActive } });
    return NextResponse.redirect(`${base}${page}?stripe=${isActive ? 'success' : 'pending'}`);
  } catch (err) {
    console.error('Stripe callback error:', err);
    return NextResponse.redirect(`${base}${page}?stripe=error`);
  }
}
