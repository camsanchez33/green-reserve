import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { bookedOn, closeDay, reopenDay } from '@/lib/blackouts';

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'schedule.view'); if (denied) return denied; } // SP-A
  const date = req.nextUrl.searchParams.get('date');
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Pick a date.' }, { status: 400 });
    return NextResponse.json(await bookedOn(session.courseId, date));
  }
  return NextResponse.json(await prisma.blackout.findMany({ where: { courseId: session.courseId }, select: { id: true, date: true, reason: true } }));
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'schedule.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const { date, reason } = await req.json();
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Pick a date.' }, { status: 400 });
  // Review (B-7): a booked tee time cannot be deleted — it is blocked in place, bookings kept (lib/blackouts).
  // WX-1: cancelling every booking lives on the Tee Sheet's Weather button; closing here never cancels anyone.
  return NextResponse.json(await closeDay(session.courseId, date, String(reason || '')));
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'schedule.edit'); if (denied) return denied; } // SP-A
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const { id } = await req.json();
  // Verify ownership before deleting — never trust a bare ID from the client (lib/blackouts reopenDay).
  const r = await reopenDay(session.courseId, String(id ?? ''));
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, ...r });
}
