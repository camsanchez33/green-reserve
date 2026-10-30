import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { holdingsFor, buyPackOnline } from '@/lib/round-packs';

// PRICE-3 (Cam 2026-10-30: round packs sold "online + counter"): a live course's packs for
// sale online, and the signed-in golfer's own rounds left here. Buying needs a signed-in
// golfer — their account email is the holder — and is a walk-up sale paid on its pay link
// (/pay/shop/[id], a direct charge on the course's Stripe account), exactly like a sale the
// register texts out. No GreenReserve fee on the sale: the $1.50 a player is charged on each
// round as it is used, like any booking.
async function liveCourse(slug: string) {
  return prisma.course.findFirst({ where: { slug, active: true, liveStatus: 'live', archivedAt: null }, select: { id: true, stripeAccountId: true, stripeAccountActive: true } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await liveCourse(slug);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  const golfer = await getGolferSession();
  const [packs, mine] = await Promise.all([
    course.stripeAccountActive && course.stripeAccountId
      ? prisma.roundPack.findMany({ where: { courseId: course.id, active: true, sellOnline: true }, orderBy: { priceCents: 'asc' }, select: { id: true, name: true, rounds: true, priceCents: true, coversCart: true, guests: true, validDays: true } })
      : Promise.resolve([]),
    golfer?.email ? holdingsFor(course.id, golfer.email) : Promise.resolve([]),
  ]);
  return NextResponse.json({ packs, mine: mine.map(h => ({ name: h.name, left: h.left, expiresAt: h.expiresAt })), signedIn: !!golfer }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const golfer = await getGolferSession();
  if (!golfer?.email) return NextResponse.json({ error: 'Sign in to buy a round pack — the rounds go on your account.' }, { status: 401 });
  if (!(await rateLimit(`pack-buy:${golfer.golferId}`, 10, 3600))) return NextResponse.json({ error: 'Too many tries — wait a while and try again.' }, { status: 429 });
  const course = await liveCourse(slug);
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  if (!course.stripeAccountActive || !course.stripeAccountId) return NextResponse.json({ error: 'This course isn’t taking payments online yet.' }, { status: 409 });
  const body = await req.json().catch(() => ({})) as { packId?: unknown };
  const packId = typeof body.packId === 'string' ? body.packId : '';
  const who = await prisma.golferAccount.findUnique({ where: { id: golfer.golferId }, select: { firstName: true, lastName: true, phone: true } });
  const sale = await buyPackOnline(course.id, packId, { email: golfer.email, name: `${who?.firstName ?? ''} ${who?.lastName ?? ''}`.trim(), phone: who?.phone ?? '' });
  if (!sale.ok) return NextResponse.json({ error: sale.error }, { status: sale.status });
  return NextResponse.json({ payUrl: `/pay/shop/${sale.saleId}?token=${sale.payToken}` });
}
