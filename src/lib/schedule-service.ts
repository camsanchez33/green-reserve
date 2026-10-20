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
import { findScheduleConflict } from './schedule-conflict';
import { checkPeriods } from './schedule-plans';

export type ScheduleScope = { scopeCourseId?: string; actor?: string };

/** L2: the save was refused because two active schedules would put one nine in two places at once. */
export class ScheduleConflictError extends Error {
  constructor(message: string) { super(message); this.name = 'ScheduleConflictError'; }
}

/** L2: a productId that is not one of this course's products. */
export class ScheduleProductError extends Error {
  constructor(message: string) { super(message); this.name = 'ScheduleProductError'; }
}

/** Wire shape (dollars) — what every caller sends to a browser. */
export async function listSchedules(courseId: string) {
  const rows = await prisma.teeTimeSchedule.findMany({
    where: { courseId }, orderBy: { createdAt: 'asc' },
    include: { product: { select: { label: true, holes: true } } },
  });
  return rows.map(r => {
    const { product, ...rest } = r;
    return { ...scheduleToWire(rest), productLabel: product?.label ?? null, productHoles: product?.holes ?? null };
  });
}

/** L2: resolve + validate the product a schedule is scoped to. Returns null for the simple (unscoped) case. */
async function resolveProduct(courseId: string, productId: unknown) {
  if (productId === undefined || productId === null || productId === '') {
    // On a course that sells rounds, an unscoped schedule would generate an
    // unlabelled slot on top of every round's — refuse it here, not just in the editor.
    const rounds = await prisma.courseProduct.count({ where: { courseId, active: true } });
    if (rounds > 0) throw new ScheduleProductError('This course sells more than one round — pick which one this schedule is for.');
    return null;
  }
  const product = await prisma.courseProduct.findFirst({ where: { id: String(productId), courseId }, select: { id: true, holes: true } });
  if (!product) throw new ScheduleProductError('That product does not belong to this course.');
  return product;
}

/** L2: refuse a save that would put one nine in two places at once. */
async function assertNoConflict(courseId: string, candidate: { id?: string | null; productId: string | null; daysOfWeek: number[]; startTime: string; endTime: string; active: boolean }) {
  const [others, products, nines] = await Promise.all([
    prisma.teeTimeSchedule.findMany({ where: { courseId }, select: { id: true, productId: true, daysOfWeek: true, startTime: true, endTime: true, active: true } }),
    prisma.courseProduct.findMany({ where: { courseId }, select: { id: true, label: true, nineIds: true } }),
    prisma.nine.findMany({ where: { courseId }, select: { id: true, name: true } }),
  ]);
  const why = findScheduleConflict(candidate, others, products, nines);
  if (why) throw new ScheduleConflictError(why);
}

export async function createSchedule(courseId: string, body: Record<string, unknown>, opts: ScheduleScope = {}) {
  const product = await resolveProduct(courseId, body.productId);
  const daysOfWeek = (body.daysOfWeek as number[]) ?? [];
  await assertNoConflict(courseId, { productId: product?.id ?? null, daysOfWeek, startTime: body.startTime as string, endTime: body.endTime as string, active: true });
  const schedule = await prisma.teeTimeSchedule.create({
    data: {
      courseId,
      productId: product?.id ?? null,
      tierName: (body.tierName as string) || 'standard',
      daysOfWeek,
      startTime: body.startTime as string,
      endTime: body.endTime as string,
      intervalMinutes: Number(body.intervalMinutes) || 8,
      // A product-scoped schedule sells the product's round, whatever the form said.
      holes: product ? product.holes : (Number(body.holes) || 18),
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

  // L2: `productId` may be set, changed, or cleared (null) on an edit.
  // An edit that leaves productId alone on an unscoped schedule is re-checked
  // too: once rounds exist, every saved schedule must belong to one.
  const productTouched = data.productId !== undefined || !existing.productId;
  const product = productTouched ? await resolveProduct(existing.courseId, data.productId !== undefined ? data.productId : existing.productId) : null;
  const nextProductId = productTouched ? (product?.id ?? null) : existing.productId;
  const next = {
    active: data.active !== undefined ? Boolean(data.active) : existing.active,
    daysOfWeek: (data.daysOfWeek as number[] | undefined) ?? existing.daysOfWeek,
    startTime: (data.startTime as string | undefined) ?? existing.startTime,
    endTime: (data.endTime as string | undefined) ?? existing.endTime,
  };
  await assertNoConflict(existing.courseId, { id: existing.id, productId: nextProductId, ...next });
  const nextHoles = nextProductId
    ? (product?.holes ?? (await prisma.courseProduct.findUnique({ where: { id: nextProductId }, select: { holes: true } }))?.holes ?? existing.holes)
    : (data.holes !== undefined ? Number(data.holes) : existing.holes);

  const updated = await prisma.teeTimeSchedule.update({
    where: { id: existing.id },
    data: {
      active: next.active,
      productId: nextProductId,
      tierName: (data.tierName as string | undefined) ?? existing.tierName,
      daysOfWeek: next.daysOfWeek,
      startTime: next.startTime,
      endTime: next.endTime,
      intervalMinutes: data.intervalMinutes !== undefined ? Number(data.intervalMinutes) : existing.intervalMinutes,
      holes: nextHoles,
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

/**
 * W2-4: one schedule = shared hours for one round on some days, split into
 * price periods (lib/schedule-plans.ts). The whole schedule is saved at once:
 * the rows in `replaces` (the schedule as it was) become exactly `periods` —
 * kept rows updated in place, new ones created, dropped ones deleted — in one
 * transaction, then the window is rebuilt once. `periods: []` deletes the
 * schedule; `active: false` pauses every period together.
 */
export type SchedulePlan = {
  replaces: string[];
  productId?: string | null;
  daysOfWeek: number[];
  intervalMinutes: number;
  holes?: number;
  active?: boolean;
  periods: Record<string, unknown>[];   // { id?, tierName, startTime, endTime, money (dollars), walkingAllowed }
};

export class SchedulePlanError extends Error {
  constructor(message: string) { super(message); this.name = 'SchedulePlanError'; }
}

/** Returns null when a row in `replaces` is not this course's. */
export async function saveSchedulePlan(courseId: string, plan: SchedulePlan, opts: ScheduleScope = {}) {
  if (!Array.isArray(plan.replaces) || !Array.isArray(plan.periods) || plan.periods.some(p => !p || typeof p !== 'object')) {
    throw new SchedulePlanError('Tell us what you are changing.');
  }
  const replaces = [...new Set(plan.replaces.map(String))];
  const existing = replaces.length ? await prisma.teeTimeSchedule.findMany({ where: { id: { in: replaces }, courseId } }) : [];
  if (existing.length !== replaces.length) return null;
  type Period = Record<string, unknown> & { id?: string; tierName?: string; startTime: unknown; endTime: unknown };
  const periods: Period[] = (plan.periods ?? []).map(p => ({ ...p, id: p.id ? String(p.id) : undefined, tierName: p.tierName == null ? undefined : String(p.tierName), startTime: p.startTime, endTime: p.endTime }));
  if (periods.some(p => p.id && !replaces.includes(p.id))) return null;
  const periodIds = periods.map(p => p.id).filter(Boolean);
  if (new Set(periodIds).size !== periodIds.length) throw new SchedulePlanError('Two price periods can’t be the same one. Refresh and try again.');

  if (periods.length === 0) {
    if (!replaces.length) throw new SchedulePlanError('Add at least one price period.');
    await prisma.teeTimeSchedule.deleteMany({ where: { id: { in: replaces }, courseId } });
    if (opts.actor) await logSettingsChanged(courseId, [{ field: 'schedule', from: 'removed', to: null }], opts.actor);
    await regenerateUpcoming(courseId);
    return listSchedules(courseId);
  }

  const daysOfWeek = Array.isArray(plan.daysOfWeek) ? plan.daysOfWeek.map(Number).filter(d => d >= 0 && d <= 6) : [];
  if (!daysOfWeek.length) throw new SchedulePlanError('Pick at least one day.');
  const intervalMinutes = Number(plan.intervalMinutes);
  const why = checkPeriods(periods, intervalMinutes);
  if (why) throw new SchedulePlanError(why);
  const product = await resolveProduct(courseId, plan.productId);
  const productId = product?.id ?? null;
  const holes = product ? product.holes : (Number(plan.holes) || 18);
  const active = plan.active !== false;

  // The periods run back to back, so they never overlap each other; each is
  // checked against the course's OTHER schedules (the old rows are going away).
  if (active) {
    const [rows, products, nines] = await Promise.all([
      prisma.teeTimeSchedule.findMany({ where: { courseId }, select: { id: true, productId: true, daysOfWeek: true, startTime: true, endTime: true, active: true } }),
      prisma.courseProduct.findMany({ where: { courseId }, select: { id: true, label: true, nineIds: true } }),
      prisma.nine.findMany({ where: { courseId }, select: { id: true, name: true } }),
    ]);
    const others = rows.filter(r => !replaces.includes(r.id));
    for (const p of periods) {
      const clash = findScheduleConflict({ productId, daysOfWeek, startTime: String(p.startTime), endTime: String(p.endTime), active: true }, others, products, nines);
      if (clash) throw new ScheduleConflictError(clash);
    }
  }

  const rowData = (p: Record<string, unknown>) => ({
    productId, daysOfWeek, intervalMinutes, holes, active,
    tierName: String(p.tierName ?? '').trim() || 'standard',
    startTime: String(p.startTime), endTime: String(p.endTime),
    // The editor sends dollars; the columns are cents. Every price is sent for every period.
    ...scheduleMoneyForCreate(p),
    walkingAllowed: p.walkingAllowed !== false,
  });
  const keep = new Set(periods.map(p => p.id).filter(Boolean) as string[]);
  await prisma.$transaction([
    ...replaces.filter(id => !keep.has(id)).map(id => prisma.teeTimeSchedule.delete({ where: { id } })),
    ...periods.map(p => p.id
      ? prisma.teeTimeSchedule.update({ where: { id: p.id }, data: rowData(p) })
      : prisma.teeTimeSchedule.create({ data: { courseId, ...rowData(p) } })),
  ]);

  if (opts.actor) {
    await logSettingsChanged(courseId, [{ field: 'schedule', from: replaces.length ? 'changed' : null, to: `${periods.length} price period${periods.length === 1 ? '' : 's'}${active ? '' : ' (paused)'}` }], opts.actor);
  }
  await regenerateUpcoming(courseId);
  return listSchedules(courseId);
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
