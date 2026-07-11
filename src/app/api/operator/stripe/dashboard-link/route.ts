import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getOperatorSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Single-use Stripe Express login link — generated fresh per click, operator
// session required (not staff), own course's connected account only.
export async function POST() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.kind !== 'operator') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json({ error: 'No course' }, { status: 404 });
  if (!course.stripeAccountId || !course.stripeAccountActive) {
    return NextResponse.json({ error: 'Stripe is not connected yet' }, { status: 400 });
  }

  try {
    const link = await stripe.accounts.createLoginLink(course.stripeAccountId);
    return NextResponse.json({ url: link.url });
  } catch (err) {
    console.error('Stripe dashboard link error:', err);
    return NextResponse.json({ error: 'Could not open the Stripe dashboard. Try again shortly.' }, { status: 500 });
  }
}
