import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scheduleMoneyFromWire, scheduleMoneyForCreate, scheduleToWire } from '@/lib/schedule-wire';
import { centsToDollarsOr0, dollarsToCentsOr0 } from '@/lib/money';
import { regenerateUpcoming } from '@/lib/tee-sheet-engine';
import { resolveAdminSession, requireRole, MANAGER_PLUS, SUPPORT_PLUS } from '@/lib/admin-session';
import { logSettingsChanged } from '@/lib/course-timeline';

// GET /api/admin/schedule?courseId=X
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2d: GET was session-only while POST/PATCH/DELETE here are MANAGER_PLUS — it exposes every rate a course charges.
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });
  const schedules = await prisma.teeTimeSchedule.findMany({ where: { courseId }, orderBy: { createdAt: 'asc' } });
  return NextResponse.json(schedules.map(scheduleToWire));
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json();
  const { courseId } = body;
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  const schedule = await prisma.teeTimeSchedule.create({
    data: {
      courseId,
      tierName: body.tierName || 'standard',
      daysOfWeek: body.daysOfWeek ?? [],
      startTime: body.startTime,
      endTime: body.endTime,
      intervalMinutes: Number(body.intervalMinutes) || 8,
      holes: Number(body.holes) || 18,
      // MP-3 B2d: editor sends dollars, columns are cents.
      ...scheduleMoneyForCreate(body),
      walkingAllowed: body.walkingAllowed !== false,
    },
  });

  // Generate the rolling window immediately, same as the operator self-serve flow.
  await regenerateUpcoming(courseId);

  await logSettingsChanged(courseId, [{ field: 'schedule', from: null, to: `${centsToDollarsOr0(schedule.greenFeeWeekdayCents)}/${centsToDollarsOr0(schedule.greenFeeWeekendCents)} added` }], session.name);

  return NextResponse.json(scheduleToWire(schedule));
}

export async function PATCH(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id, ...data } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const existing = await prisma.teeTimeSchedule.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.teeTimeSchedule.update({
    where: { id },
    data: {
      active: data.active !== undefined ? data.active : existing.active,
      tierName: data.tierName ?? existing.tierName,
      daysOfWeek: data.daysOfWeek ?? existing.daysOfWeek,
      startTime: data.startTime ?? existing.startTime,
      endTime: data.endTime ?? existing.endTime,
      intervalMinutes: data.intervalMinutes !== undefined ? Number(data.intervalMinutes) : existing.intervalMinutes,
      holes: data.holes !== undefined ? Number(data.holes) : existing.holes,
      // MP-3 B2d: only the money keys present in the body are converted; the
      // rest keep their existing cents values (Prisma leaves omitted fields).
      ...scheduleMoneyFromWire(data),
      walkingAllowed: data.walkingAllowed !== undefined ? data.walkingAllowed : existing.walkingAllowed,
    },
  });

  const feeChanges: { field: string; from: unknown; to: unknown }[] = [];
  // MP-3 B2d: compare cents to cents. Comparing an incoming dollar value against
  // a cents column would have logged a "change" on every single save.
  if (data.greenFeeWeekday !== undefined && dollarsToCentsOr0(data.greenFeeWeekday as number) !== existing.greenFeeWeekdayCents) feeChanges.push({ field: 'greenFeeWeekday', from: centsToDollarsOr0(existing.greenFeeWeekdayCents), to: centsToDollarsOr0(updated.greenFeeWeekdayCents) });
  if (data.greenFeeWeekend !== undefined && dollarsToCentsOr0(data.greenFeeWeekend as number) !== existing.greenFeeWeekendCents) feeChanges.push({ field: 'greenFeeWeekend', from: centsToDollarsOr0(existing.greenFeeWeekendCents), to: centsToDollarsOr0(updated.greenFeeWeekendCents) });
  if (data.cartFee !== undefined && dollarsToCentsOr0(data.cartFee as number) !== existing.cartFeeCents) feeChanges.push({ field: 'cartFee', from: centsToDollarsOr0(existing.cartFeeCents), to: centsToDollarsOr0(updated.cartFeeCents) });
  if (feeChanges.length > 0) await logSettingsChanged(existing.courseId, feeChanges, session.name);

  // MP-5a: an edited schedule used to leave the already-generated slots alone,
  // so changing the hours or the fee only took effect beyond the current
  // window — the sheet kept selling the old times at the old price.
  await regenerateUpcoming(existing.courseId);

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const existing = await prisma.teeTimeSchedule.findUnique({ where: { id }, select: { courseId: true } });
  if (!existing) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  await prisma.teeTimeSchedule.deleteMany({ where: { id } });
  await logSettingsChanged(existing.courseId, [{ field: 'schedule', from: 'removed', to: null }], session.name);

  // MP-5a: THE bug. Deleting a schedule left every slot it had already
  // generated on sale for up to eight days, so golfers could book tee times
  // the course had stopped offering. Booked and blocked slots survive the
  // rebuild — only unsold ones the schedule no longer justifies are removed.
  await regenerateUpcoming(existing.courseId);

  return NextResponse.json({ success: true });
}
