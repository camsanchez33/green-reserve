// MP-5d. The one place a tee-time schedule is created, changed or removed, and
// the one place a slot is blocked — for the admin console AND the operator's
// own dashboard.
//
// Why this exists: MP-5a fixed the admin route so that editing or deleting a
// schedule rebuilds the rolling tee-sheet window (a deleted schedule used to
// leave its slots on sale for up to eight days). The operator route was a
// separate copy of the same code and did NOT get that fix, so the exact bug
// the admin no longer had was still live on /dashboard/schedules — the surface
// operators actually use. Two implementations of one rule will drift; this
// file is the rule, and both routes are thin callers.
//
// Scope: `scopeCourseId` is the tenant guard. The operator route passes its
// session's course so it can only ever touch its own rows; the admin passes
// nothing. `actor` names who made the change for the course timeline — the
// admin logs, the operator does not (unchanged behaviour on that side).

import { prisma } from './prisma';
import { scheduleMoneyFromWire, scheduleMoneyForCreate, scheduleToWire, teeTimeToWire } from './schedule-wire';
import { centsToDollarsOr0, dollarsToCentsOr0 } from './money';
import { regenerateUpcoming } from './tee-sheet-engine';
import { logSettingsChanged } from './course-timeline';

export type ScheduleScope = { scopeCourseId?: string; actor?: string };

/** Wire shape (dollars) — what every caller sends to a browser. */
export async function listSchedules(courseId: string) {
  const rows = await prisma.teeTimeSchedule.findMany({ where: { courseId }, orderBy: { createdAt: 'asc' } });
  return rows.map(scheduleToWire);
}

export async function createSchedule(courseId: string, body: Record<string, unknown>, opts: ScheduleScope = {}) {
  const schedule = await prisma.teeTimeSchedule.create({
    data: {
      courseId,
      tierName: (body.tierName as string) || 'standard',
      daysOfWeek: (body.daysOfWeek as number[]) ?? [],
      startTime: body.startTime as string,
      endTime: body.endTime as string,
      intervalMinutes: Number(body.intervalMinutes) || 8,
      holes: Number(body.holes) || 18,
      // The editor sends dollars; the columns are cents.
      ...scheduleMoneyForCreate(body),
      walkingAllowed: body.walkingAllowed !== false,
    },
  });

  // The window is rebuilt straight away so the new times are bookable now,
  // not after tonight's cron.
  await regenerateUpcoming(courseId);

  if (opts.actor) {
    await logSettingsChanged(courseId, [{
      field: 'schedule', from: null,
      to: `${centsToDollarsOr0(schedule.greenFeeWeekdayCents)}/${centsToDollarsOr0(schedule.greenFeeWeekendCents)} added`,
    }], opts.actor);
  }

  return scheduleToWire(schedule);
}

/** Returns null when the schedule does not exist (or is outside the scope). */
export async function updateSchedule(id: string, data: Record<string, unknown>, opts: ScheduleScope = {}) {
  const existing = await prisma.teeTimeSchedule.findFirst({
    where: opts.scopeCourseId ? { id, courseId: opts.scopeCourseId } : { id },
  });
  if (!existing) return null;

  const updated = await prisma.teeTimeSchedule.update({
    where: { id: existing.id },
    data: {
      active: data.active !== undefined ? Boolean(data.active) : existing.active,
      tierName: (data.tierName as string | undefined) ?? existing.tierName,
      daysOfWeek: (data.daysOfWeek as number[] | undefined) ?? existing.daysOfWeek,
      startTime: (data.startTime as string | undefined) ?? existing.startTime,
      endTime: (data.endTime as string | undefined) ?? existing.endTime,
      intervalMinutes: data.intervalMinutes !== undefined ? Number(data.intervalMinutes) : existing.intervalMinutes,
      holes: data.holes !== undefined ? Number(data.holes) : existing.holes,
      // Only the money keys present in the body are converted; the rest keep
      // their existing cents values (Prisma leaves omitted fields alone).
      ...scheduleMoneyFromWire(data),
      walkingAllowed: data.walkingAllowed !== undefined ? Boolean(data.walkingAllowed) : existing.walkingAllowed,
    },
  });

  if (opts.actor) {
    // Compare cents to cents — comparing an incoming dollar value against a
    // cents column would log a "change" on every save.
    const feeChanges: { field: string; from: unknown; to: unknown }[] = [];
    const money = (wire: string, centsCol: 'greenFeeWeekdayCents' | 'greenFeeWeekendCents' | 'cartFeeCents') => {
      if (data[wire] === undefined) return;
      if (dollarsToCentsOr0(data[wire] as number) === existing[centsCol]) return;
      feeChanges.push({ field: wire, from: centsToDollarsOr0(existing[centsCol]), to: centsToDollarsOr0(updated[centsCol]) });
    };
    money('greenFeeWeekday', 'greenFeeWeekdayCents');
    money('greenFeeWeekend', 'greenFeeWeekendCents');
    money('cartFee', 'cartFeeCents');
    if (data.active !== undefined && Boolean(data.active) !== existing.active) {
      feeChanges.push({ field: 'schedule', from: existing.active ? 'active' : 'paused', to: updated.active ? 'active' : 'paused' });
    }
    if (feeChanges.length > 0) await logSettingsChanged(existing.courseId, feeChanges, opts.actor);
  }

  // An edited (or paused) schedule used to leave the already-generated slots
  // alone, so the sheet kept selling the old times at the old price until the
  // window rolled past them.
  await regenerateUpcoming(existing.courseId);

  return scheduleToWire(updated);
}

/** Returns false when nothing matched (so the caller can 404). */
export async function deleteSchedule(id: string, opts: ScheduleScope = {}): Promise<boolean> {
  const existing = await prisma.teeTimeSchedule.findFirst({
    where: opts.scopeCourseId ? { id, courseId: opts.scopeCourseId } : { id },
    select: { id: true, courseId: true },
  });
  if (!existing) return false;

  await prisma.teeTimeSchedule.delete({ where: { id: existing.id } });

  if (opts.actor) {
    await logSettingsChanged(existing.courseId, [{ field: 'schedule', from: 'removed', to: null }], opts.actor);
  }

  // THE MP-5a bug, now closed on both surfaces: a deleted schedule's slots no
  // longer stay on sale. Booked and blocked slots survive the rebuild — only
  // unsold ones the schedule no longer justifies are removed.
  await regenerateUpcoming(existing.courseId);

  return true;
}

/**
 * Block or reopen a single slot. Blocking hides it from golfers and stops new
 * bookings; existing bookings on it are left exactly as they are (the sheet
 * still shows them). Returns null when the slot is outside the scope.
 */
export async function setTeeTimeBlocked(teeTimeId: string, blocked: boolean, opts: Pick<ScheduleScope, 'scopeCourseId'> = {}) {
  const existing = await prisma.teeTime.findFirst({
    where: opts.scopeCourseId ? { id: teeTimeId, courseId: opts.scopeCourseId } : { id: teeTimeId },
    select: { id: true },
  });
  if (!existing) return null;
  const row = await prisma.teeTime.update({
    where: { id: existing.id },
    data: { status: blocked ? 'blocked' : 'available' },
  });
  return teeTimeToWire(row);
}
