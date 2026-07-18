import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // We don't log raw Stripe webhook receipts anywhere, so this is a proxy
  // signal, not a real log: the most recently updated course that has a
  // Stripe account attached. Good enough for a 30-second sanity check, not
  // precise — a real webhook-received timestamp needs a schema change.
  const lastStripeTouch = await prisma.course.findFirst({
    where: { stripeAccountId: { not: '' } },
    orderBy: { updatedAt: 'desc' },
    select: { name: true, updatedAt: true },
  });

  return NextResponse.json({
    lastStripeTouch: lastStripeTouch
      ? { courseName: lastStripeTouch.name, updatedAt: lastStripeTouch.updatedAt.toISOString() }
      : null,
  });
}
