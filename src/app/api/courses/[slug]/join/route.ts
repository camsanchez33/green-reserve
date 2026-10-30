import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { joinableTiers, myMembership, joinTier } from '@/lib/membership-join';

// MEM-JOIN (Cam 2026-10-30: "Join online", "Course decides per tier"): a live course's tiers
// that can be joined online, and where the signed-in golfer stands. Joining needs a signed-in
// golfer (their account is the member). 'instant' returns the dues pay link; 'request' waits
// for staff. Dues are paid on the existing /membership/[id] page, on the course's Stripe account.
async function liveCourse(slug: string) {
  return prisma.course.findFirst({ where: { slug, active: true, liveStatus: 'live', archivedAt: null }, select: { id: true, stripeAccountId: true, stripeAccountActive: true } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await liveCourse(slug);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  const golfer = await getGolferSession();
  const payable = course.stripeAccountActive && !!course.stripeAccountId;
  const [tiers, mine] = await Promise.all([
    payable ? joinableTiers(course.id) : Promise.resolve([]),
    golfer?.email ? myMembership(course.id, golfer.golferId, golfer.email) : Promise.resolve(null),
  ]);
  return NextResponse.json({
    tiers,
    signedIn: !!golfer,
    mine: mine ? { status: mine.status, tierName: mine.tier?.name ?? '', payUrl: mine.status === 'awaiting_payment' && mine.payToken ? `/membership/${mine.id}?token=${mine.payToken}` : null } : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const golfer = await getGolferSession();
  if (!golfer?.email) return NextResponse.json({ error: 'Sign in to join — the membership goes on your account.' }, { status: 401 });
  if (!(await rateLimit(`join:${golfer.golferId}`, 10, 3600))) return NextResponse.json({ error: 'Too many tries — wait a while and try again.' }, { status: 429 });
  const course = await liveCourse(slug);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  if (!course.stripeAccountActive || !course.stripeAccountId) return NextResponse.json({ error: 'This course isn’t taking payments online yet.' }, { status: 409 });
  const body = await req.json().catch(() => ({})) as { tierId?: unknown };
  const who = await prisma.golferAccount.findUnique({ where: { id: golfer.golferId }, select: { firstName: true, lastName: true, phone: true } });
  const r = await joinTier(course.id, { id: golfer.golferId, email: golfer.email, name: `${who?.firstName ?? ''} ${who?.lastName ?? ''}`.trim(), phone: who?.phone ?? '' }, typeof body.tierId === 'string' ? body.tierId : '');
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ status: r.status, payUrl: r.status === 'awaiting_payment' ? `/membership/${r.membershipId}?token=${r.payToken}` : null });
}
