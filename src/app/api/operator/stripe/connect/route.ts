import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { prisma } from '@/lib/prisma';

const CAPABILITIES = {
  card_payments: { requested: true },
  transfers: { requested: true },
} as const;

export async function GET(req: NextRequest) {
  try {
    const from = req.nextUrl.searchParams.get('from') === 'onboarding' ? 'onboarding' : 'settings';
    // SD-9: this was findFirst over the operator's courses with no ordering.
    // Settings resolves the ACTIVE course from the switcher cookie, so a
    // two-course operator clicking Connect on course B could attach the Stripe
    // account to course A. Same resolver as every other dashboard route now.
    const session = await resolveDashboardSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });

    const course = await prisma.course.findUnique({ where: { id: session.courseId } });
    if (!course) return NextResponse.json({ error: 'No course' }, { status: 404 });

    if (!process.env.NEXT_PUBLIC_URL) {
      return NextResponse.json({ error: 'Server misconfigured: NEXT_PUBLIC_URL is not set.' }, { status: 500 });
    }

    let accountId = course.stripeAccountId;

    if (!accountId) {
      const account = await stripe.accounts.create({ type: 'express', capabilities: CAPABILITIES });
      accountId = account.id;
      await prisma.course.update({ where: { id: course.id }, data: { stripeAccountId: accountId } });
    } else {
      // Retrieve to check real capability state — also serves as repair path for
      // accounts created before capabilities were requested.
      const account = await stripe.accounts.retrieve(accountId);
      const capActive = account.capabilities?.card_payments === 'active';
      const isFullyActive = capActive && account.charges_enabled && account.payouts_enabled;

      if (isFullyActive) {
        if (!course.stripeAccountActive) {
          await prisma.course.update({ where: { id: course.id }, data: { stripeAccountActive: true } });
        }
        return NextResponse.json({ connected: true, accountId });
      }

      // Request capabilities if not yet active (no-op if already requested/pending)
      if (!capActive) {
        await stripe.accounts.update(accountId, { capabilities: CAPABILITIES });
      }
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
