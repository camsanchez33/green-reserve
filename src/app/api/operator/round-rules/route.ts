import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { readRoundRules } from '@/lib/booking-rules';

// W2-6 slice 3: a round's own booking rules — group size, how far
// ahead the public can book — set on that round's Schedule tab. Blank = the
// course's rule. The owner's alone, like the course's own booking rules.
export async function PUT(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.productId !== 'string') return NextResponse.json({ error: 'Pick which round these rules are for.' }, { status: 400 });
  const [product, course] = await Promise.all([
    prisma.courseProduct.findFirst({ where: { id: body.productId, courseId: session.courseId }, select: { id: true } }),
    prisma.course.findUnique({ where: { id: session.courseId }, select: { minPlayers: true, maxPlayers: true, publicAdvanceDays: true } }),
  ]);
  if (!product || !course) return NextResponse.json({ error: 'That round isn’t on this course. Refresh and try again.' }, { status: 404 });
  const r = readRoundRules(body, course);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const updated = await prisma.courseProduct.update({
    where: { id: product.id },
    data: r.data,
    select: { id: true, minPlayers: true, maxPlayers: true, publicAdvanceDays: true },
  });
  return NextResponse.json(updated);
}
