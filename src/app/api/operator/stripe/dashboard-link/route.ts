import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { prisma } from '@/lib/prisma';

// Single-use Stripe Express login link — generated fresh per click, operator
// session required (not staff), own course's connected account only.
export async function POST() {
  // SD-9: findFirst with no ordering could open the WRONG course's Stripe
  // dashboard for a multi-course operator. Active course, like Settings.
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });

  const course = await prisma.course.findUnique({ where: { id: session.courseId } });
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
