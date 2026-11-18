import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { readBookingLook } from '@/lib/booking-look';
import { saveBookingLook } from '@/lib/booking-look-save';

// Booking page look (Cam 2026-11-18, Settings → Your course → Booking Page): Light or Dark
// plus one of four preset accents (never red). Gated by settings.edit like the rest of
// Settings; each changed field is written to CourseSettingChange in the same transaction.
// Not in the generic PATCH /api/operator/settings allowlist, so this is the only writer.

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'settings.edit'); if (denied) return denied;
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock;
  const body = await req.json().catch(() => null);
  const input = readBookingLook(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  // The actor comes from the signed-in login's own row, never from the request.
  const me = session.isStaff
    ? await prisma.courseStaff.findUnique({ where: { id: session.staffId ?? '' }, select: { name: true } })
    : await prisma.courseOperator.findUnique({ where: { id: session.operatorId ?? '' }, select: { name: true } });
  const actor = session.isStaff
    ? { type: 'staff' as const, id: session.staffId ?? '', name: me?.name ?? '' }
    : { type: 'operator' as const, id: session.operatorId ?? '', name: me?.name ?? '' };
  const saved = await saveBookingLook(session.courseId, input.data, actor);
  if (!saved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ bookingLook: saved.look, bookingAccent: saved.accent });
}
