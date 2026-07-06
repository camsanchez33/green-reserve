import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tiers = await prisma.membershipTier.findMany({
    where: { courseId: session.courseId },
    include: { _count: { select: { memberships: { where: { status: 'active' } } } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(tiers);
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
      greenFeeWeekday:    greenFeeWeekday    != null ? Number(greenFeeWeekday)    : null,
      greenFeeWeekend:    greenFeeWeekend    != null ? Number(greenFeeWeekend)    : null,
      cartFeeWeekday:     cartFeeWeekday     != null ? Number(cartFeeWeekday)     : null,
      cartFeeWeekend:     cartFeeWeekend     != null ? Number(cartFeeWeekend)     : null,
      discountPct:        discountPct        != null ? Number(discountPct)        : null,
      advanceBookingDays: advanceBookingDays != null ? Number(advanceBookingDays) : 14,
      guestPassesPerYear: guestPassesPerYear != null ? Number(guestPassesPerYear) : 0,
      annualFee:          annualFee          != null ? Number(annualFee)          : 0,
      initiationFee:      initiationFee      != null ? Number(initiationFee)      : 0,
      termMonths:         termMonths         != null ? Number(termMonths)         : 12,
      notes: notes || '',
    },
  });
  return NextResponse.json(tier, { status: 201 });
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
      greenFeeWeekday:    updates.greenFeeWeekday    !== undefined ? (updates.greenFeeWeekday != null ? Number(updates.greenFeeWeekday) : null) : tier.greenFeeWeekday,
      greenFeeWeekend:    updates.greenFeeWeekend    !== undefined ? (updates.greenFeeWeekend != null ? Number(updates.greenFeeWeekend) : null) : tier.greenFeeWeekend,
      cartFeeWeekday:     updates.cartFeeWeekday     !== undefined ? (updates.cartFeeWeekday  != null ? Number(updates.cartFeeWeekday)  : null) : tier.cartFeeWeekday,
      cartFeeWeekend:     updates.cartFeeWeekend     !== undefined ? (updates.cartFeeWeekend  != null ? Number(updates.cartFeeWeekend)  : null) : tier.cartFeeWeekend,
      discountPct:        updates.discountPct        !== undefined ? (updates.discountPct     != null ? Number(updates.discountPct)     : null) : tier.discountPct,
      advanceBookingDays: updates.advanceBookingDays != null ? Number(updates.advanceBookingDays) : tier.advanceBookingDays,
      guestPassesPerYear: updates.guestPassesPerYear != null ? Number(updates.guestPassesPerYear) : tier.guestPassesPerYear,
      annualFee:          updates.annualFee          != null ? Number(updates.annualFee)          : tier.annualFee,
      initiationFee:      updates.initiationFee      != null ? Number(updates.initiationFee)      : tier.initiationFee,
      termMonths:         updates.termMonths         != null ? Number(updates.termMonths)         : tier.termMonths,
      notes:              updates.notes              ?? tier.notes,
      active:             updates.active             !== undefined ? updates.active : tier.active,
    },
  });
  return NextResponse.json(updated);
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
