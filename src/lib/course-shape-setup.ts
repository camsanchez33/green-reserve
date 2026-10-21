// W2-6 (Cam 2026-10-20: "it needs to all be linked so if its only 18 there
// shouldnt still be the 27 holes from before"). One save sets the course's
// shape: Course.holes and par, its nines, and the rounds golfers can book.
// Whatever the old shape had that the new one doesn't is RETIRED in the same
// save, after the course has seen exactly what changes (planCourseSetup):
//   - nines the shape no longer has are deleted (their tee yardages with them);
//   - rounds no longer sold are switched off and their schedules paused, so no
//     new tee times are made for them — times already booked stay booked;
//   - schedules with no round (the old simple setup) move onto the round that
//     fits them, so nothing disappears from the sheet.
// Owner only (the route checks). Server only.
import { prisma } from './prisma';
import { regenerateUpcoming } from './tee-sheet-engine';
import { shapeDef, shapeNines, shapeRounds, type ShapeKey } from './course-shape';
import { todayIn } from './course-time';

export type SetupInput = { shape: ShapeKey; names: string[]; par: number; rounds: { key: string; on: boolean; label?: string }[] };

export type SetupPreview = {
  holes: number; par: number;
  ninesAdded: string[]; ninesRenamed: { from: string; to: string }[]; ninesRemoved: string[];
  roundsStarted: string[]; roundsStopped: string[]; roundsKept: string[];
  roundsRenamed: { from: string; to: string }[];   // kept rounds whose golfer-facing name changes
  schedulesPaused: number; schedulesMoved: number;
  schedulesMovedTo: string[]; // the rounds they move onto, once each
  bookedTimesKept: number;    // future booked times on rounds that stop — they stay
};

type Ops = {
  holes: number; par: number;
  nines: { id?: string; name: string; sortOrder: number }[];   // desired, in order; id = reuse
  deleteNineIds: string[];
  rounds: { id?: string; label: string; holes: number; nineIdx: number[]; sortOrder: number }[];  // on rounds
  stopProductIds: string[];
  moveUnscoped: { scheduleId: string; toRound: number }[];     // index into rounds
  today: string;
};

const fail = (error: string) => ({ ok: false as const, error });

function validate(input: SetupInput) {
  const shape = shapeDef(input?.shape);
  if (!shape) return fail('Pick what kind of course you have.');
  const par = Number(input.par);
  if (shape.holes === 9 ? !(par >= 27 && par <= 40) : !(par >= 54 && par <= 80)) {
    return fail(shape.holes === 9 ? 'Enter the par for your nine holes, e.g. 36.' : 'Enter the par for 18 holes, e.g. 72.');
  }
  const names = Array.isArray(input.names) ? input.names.map(n => String(n ?? '')) : [];
  const nines = shapeNines(shape, names);
  if (new Set(nines.map(n => n.name.toLowerCase())).size !== nines.length) return fail('Give each nine a different name.');
  const wanted = new Map((Array.isArray(input.rounds) ? input.rounds : [])
    .filter(r => r && typeof r === 'object').map(r => [String(r.key), r]));
  const rounds = shapeRounds(shape, names).map(r => {
    const w = wanted.get(r.key);
    return { ...r, on: w ? !!w.on : r.on, label: (typeof w?.label === 'string' ? w.label : '').trim().slice(0, 40) || r.label };
  });
  if (!rounds.some(r => r.on)) return fail('Tick at least one round golfers can book.');
  return { ok: true as const, shape, par, nines, rounds };
}

async function plan(courseId: string, input: SetupInput) {
  const v = validate(input);
  if (!v.ok) return v;
  const [existingNines, products, schedules, course] = await Promise.all([
    prisma.nine.findMany({ where: { courseId }, orderBy: { sortOrder: 'asc' } }),
    prisma.courseProduct.findMany({ where: { courseId }, orderBy: { sortOrder: 'asc' } }),
    prisma.teeTimeSchedule.findMany({ where: { courseId }, select: { id: true, productId: true, holes: true, active: true, startTime: true, endTime: true } }),
    prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } }),
  ]);

  // Nines: reuse one with the same name, then any left over in order (a rename),
  // and delete what's still unused.
  const free = [...existingNines];
  const take = (pred: (n: typeof existingNines[number]) => boolean) => { const i = free.findIndex(pred); return i >= 0 ? free.splice(i, 1)[0] : null; };
  const byName = v.nines.map(n => take(e => e.name.toLowerCase() === n.name.toLowerCase()));
  const reused = byName.map((m, i) => m ?? take(() => true) ?? null).map((m, i) => ({ existing: m, name: v.nines[i].name }));
  const deleteNines = free;
  const nineIdAt = (i: number) => reused[i].existing?.id ?? null;

  // Rounds: an existing product on the same nines and holes is the same round.
  const on = v.rounds.filter(r => r.on);
  const usedProducts = new Set<string>();
  const roundOps = on.map((r, i) => {
    const ids = r.nines.map(nineIdAt);
    const match = ids.every(Boolean)
      ? products.find(p => !usedProducts.has(p.id) && p.holes === r.holes && p.nineIds.length === ids.length && ids.every(id => p.nineIds.includes(id!)))
      : undefined;
    if (match) usedProducts.add(match.id);
    return { id: match?.id, label: r.label, holes: r.holes, nineIdx: r.nines, sortOrder: i, wasActive: match?.active ?? false, was: match?.label ?? '' };
  });
  const stop = products.filter(p => !usedProducts.has(p.id) && p.active);

  // Schedules with no round move onto the round that fits: a 9-hole one onto the
  // first 9-hole round, anything else onto the first 18 (else the first round).
  // A schedule keeps its hole count — a 9-hole twilight schedule never becomes
  // 18-hole times at the 9-hole price — so it needs a ticked round of that size.
  const unscoped = schedules.filter(s => !s.productId);
  const moveUnscoped: { scheduleId: string; toRound: number }[] = [];
  for (const s of unscoped) {
    const holes = s.holes === 9 ? 9 : 18;
    const i = roundOps.findIndex(r => r.holes === holes);
    if (i < 0) return fail(`You have a ${holes}-hole schedule (${s.startTime}–${s.endTime}). Tick a ${holes}-hole round for it, or remove that schedule on Schedule first.`);
    moveUnscoped.push({ scheduleId: s.id, toRound: i });
  }
  const pausedSchedules = schedules.filter(s => s.active && s.productId && stop.some(p => p.id === s.productId)).length;
  const today = todayIn(course?.timezone);
  const bookedTimesKept = stop.length ? await prisma.teeTime.count({ where: { courseId, productId: { in: stop.map(p => p.id) }, date: { gte: today }, OR: [{ playersBooked: { gt: 0 } }, { bookings: { some: { status: { not: 'cancelled' } } } }] } }) : 0;

  const preview: SetupPreview = {
    holes: v.shape.holes, par: v.par,
    ninesAdded: reused.filter(r => !r.existing).map(r => r.name),
    ninesRenamed: reused.filter(r => r.existing && r.existing.name !== r.name).map(r => ({ from: r.existing!.name, to: r.name })),
    ninesRemoved: deleteNines.map(n => n.name),
    roundsStarted: roundOps.filter(r => !r.wasActive).map(r => r.label),
    roundsStopped: stop.map(p => p.label),
    roundsKept: roundOps.filter(r => r.wasActive).map(r => r.label),
    roundsRenamed: roundOps.filter(r => r.id && r.was && r.was !== r.label).map(r => ({ from: r.was, to: r.label })),
    schedulesPaused: pausedSchedules,
    schedulesMoved: moveUnscoped.length,
    schedulesMovedTo: [...new Set(moveUnscoped.map(m => roundOps[m.toRound]?.label).filter(Boolean))] as string[],
    bookedTimesKept,
  };
  const ops: Ops = {
    holes: v.shape.holes, par: v.par,
    nines: reused.map((r, i) => ({ id: r.existing?.id, name: r.name, sortOrder: i })),
    deleteNineIds: deleteNines.map(n => n.id),
    rounds: roundOps.map(({ wasActive: _w, was: _x, ...r }) => r),
    stopProductIds: stop.map(p => p.id),
    moveUnscoped,
    today,
  };
  return { ok: true as const, preview, ops };
}

/** What saving this shape would change. Writes nothing. */
export async function planCourseSetup(courseId: string, input: SetupInput) {
  const p = await plan(courseId, input);
  return p.ok ? { ok: true as const, preview: p.preview } : p;
}

/** Save the shape: nines, rounds, retirements and schedule moves in one transaction, then rebuild the sheet. */
export async function applyCourseSetup(courseId: string, input: SetupInput) {
  const p = await plan(courseId, input);
  if (!p.ok) return p;
  const { ops } = p;
  await prisma.$transaction(async tx => {
    await tx.course.update({ where: { id: courseId }, data: { holes: ops.holes, par: ops.par } });
    const nineIds: string[] = [];
    for (const n of ops.nines) {
      // Every id here came from this course's own rows in plan(); updateMany keeps the write scoped anyway.
      if (n.id) { await tx.nine.updateMany({ where: { id: n.id, courseId }, data: { name: n.name, sortOrder: n.sortOrder } }); nineIds.push(n.id); }
      else nineIds.push((await tx.nine.create({ data: { courseId, name: n.name, sortOrder: n.sortOrder } })).id);
    }
    const roundIds: string[] = [];
    for (const r of ops.rounds) {
      const data = { label: r.label, holes: r.holes, nineIds: r.nineIdx.map(i => nineIds[i]), active: true, sortOrder: r.sortOrder };
      if (r.id) { await tx.courseProduct.updateMany({ where: { id: r.id, courseId }, data }); roundIds.push(r.id); }
      else roundIds.push((await tx.courseProduct.create({ data: { courseId, ...data } })).id);
    }
    if (ops.stopProductIds.length) {
      await tx.courseProduct.updateMany({ where: { id: { in: ops.stopProductIds }, courseId }, data: { active: false } });
      await tx.teeTimeSchedule.updateMany({ where: { productId: { in: ops.stopProductIds }, courseId }, data: { active: false } });
      // Their open times come off on EVERY future day (the rebuild below covers
      // only the next 8; the cron generates much further). Booked or blocked stay.
      await tx.teeTime.deleteMany({ where: { courseId, productId: { in: ops.stopProductIds }, date: { gte: ops.today }, status: 'available', playersBooked: 0, bookings: { none: {} } } });
    }
    for (const m of ops.moveUnscoped) {
      const toId = roundIds[m.toRound];
      const holes = ops.rounds[m.toRound].holes;
      await tx.teeTimeSchedule.updateMany({ where: { id: m.scheduleId, courseId, productId: null }, data: { productId: toId, holes } });
    }
    if (ops.deleteNineIds.length) await tx.nine.deleteMany({ where: { id: { in: ops.deleteNineIds }, courseId } });
  }, { timeout: 30000 });
  // Open times for retired rounds come off; moved schedules make their round's
  // times (a booked time with no round is adopted by its round — tee-sheet-engine).
  await regenerateUpcoming(courseId);
  return { ok: true as const, preview: p.preview };
}
