import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dollarsToCents, dollarsToCentsOr0 } from '@/lib/money';
import { tierToWire } from '@/lib/tier-wire';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tiers = await prisma.membershipTier.findMany({
    where: { courseId: session.courseId },
    include: { _count: { select: { memberships: { where: { status: 'active' } } } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(tiers.map(tierToWire));
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, color, greenFeeWeekday, greenFeeWeekend, cartFeeWeekday, cartFeeWeekend,
          discountPct, advanceBookingDays, guestPassesPerYear, annualFee, initiationFee, termMonths, notes } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Tier name is required' }, { status: 400 });

  // Validate: must have either flat rates OR a discount %, not both
  const hasFlat = greenFeeWeekday != null || greenFeeWeekend != null;
  const hasPct  = discountPct != null;
  if (hasFlat && hasPct) {
    return NextResponse.json({ error: 'Use either flat rates or a discount %, not both' }, { status: 400 });
  }

  const tier = await prisma.membershipTier.create({
    data: {
      courseId: session.courseId,
      name: name.trim(),
      color: color || '#1b4332',
      // MP-3 B2a: the wire stays dollars (that is what the form collects); the
      // column is integer cents. This route is the only place the unit changes.
      greenFeeWeekdayCents: dollarsToCents(greenFeeWeekday),
      greenFeeWeekendCents: dollarsToCents(greenFeeWeekend),
      cartFeeWeekdayCents:  dollarsToCents(cartFeeWeekday),
      cartFeeWeekendCents:  dollarsToCents(cartFeeWeekend),
      discountPct:        discountPct        != null ? Number(discountPct)        : null,
      advanceBookingDays: advanceBookingDays != null ? Number(advanceBookingDays) : 14,
      guestPassesPerYear: guestPassesPerYear != null ? Number(guestPassesPerYear) : 0,
      annualFeeCents:     dollarsToCentsOr0(annualFee),
      initiationFeeCents: dollarsToCentsOr0(initiationFee),
      termMonths:         termMonths         != null ? Number(termMonths)         : 12,
      notes: notes || '',
    },
  });
  return NextResponse.json(tierToWire(tier), { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing tier id' }, { status: 400 });

  const tier = await prisma.membershipTier.findUnique({ where: { id } });
  if (!tier || tier.courseId !== session.courseId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.membershipTier.update({
    where: { id },
    data: {
      name:               updates.name               ?? tier.name,
      color:              updates.color              ?? tier.color,
      greenFeeWeekdayCents: updates.greenFeeWeekday !== undefined ? dollarsToCents(updates.greenFeeWeekday) : tier.greenFeeWeekdayCents,
      greenFeeWeekendCents: updates.greenFeeWeekend !== undefined ? dollarsToCents(updates.greenFeeWeekend) : tier.greenFeeWeekendCents,
      cartFeeWeekdayCents:  updates.cartFeeWeekday  !== undefined ? dollarsToCents(updates.cartFeeWeekday)  : tier.cartFeeWeekdayCents,
      cartFeeWeekendCents:  updates.cartFeeWeekend  !== undefined ? dollarsToCents(updates.cartFeeWeekend)  : tier.cartFeeWeekendCents,
      discountPct:        updates.discountPct        !== undefined ? (updates.discountPct     != null ? Number(updates.discountPct)     : null) : tier.discountPct,
      advanceBookingDays: updates.advanceBookingDays != null ? Number(updates.advanceBookingDays) : tier.advanceBookingDays,
      guestPassesPerYear: updates.guestPassesPerYear != null ? Number(updates.guestPassesPerYear) : tier.guestPassesPerYear,
      annualFeeCents:     updates.annualFee     != null ? dollarsToCentsOr0(updates.annualFee)     : tier.annualFeeCents,
      initiationFeeCents: updates.initiationFee != null ? dollarsToCentsOr0(updates.initiationFee) : tier.initiationFeeCents,
      termMonths:         updates.termMonths         != null ? Number(updates.termMonths)         : tier.termMonths,
      notes:              updates.notes              ?? tier.notes,
      active:             updates.active             !== undefined ? updates.active : tier.active,
    },
  });
  return NextResponse.json(tierToWire(updated));
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const tier = await prisma.membershipTier.findUnique({ where: { id } });
  if (!tier || tier.courseId !== session.courseId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Check if tier has active members
  const count = await prisma.courseMembership.count({ where: { tierId: id, status: 'active' } });
  if (count > 0) {
    return NextResponse.json({ error: `This tier has ${count} active member${count === 1 ? '' : 's'}. Reassign or remove them first.` }, { status: 409 });
  }

  await prisma.membershipTier.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
