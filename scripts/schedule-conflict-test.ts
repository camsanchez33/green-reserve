// COURSE_LAYOUT_SPEC L2 — product-scoped schedule conflicts, pure.
// Run: npx tsx scripts/schedule-conflict-test.ts
import { findScheduleConflict } from '../src/lib/schedule-conflict';

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

const nines = [{ id: 'N', name: 'North' }, { id: 'S', name: 'South' }, { id: 'W', name: 'West' }];
const products = [
  { id: 'NS', label: 'North + South', nineIds: ['N', 'S'] },
  { id: 'SW', label: 'South + West', nineIds: ['S', 'W'] },
  { id: 'NW', label: 'North + West', nineIds: ['N', 'W'] },
  { id: 'W9', label: 'West (9)', nineIds: ['W'] },
];
const all = [0, 1, 2, 3, 4, 5, 6];
const ns = { id: 'a', productId: 'NS', daysOfWeek: all, startTime: '07:00', endTime: '12:00', active: true };

// 1. the rotation the spec describes: NS 7–12, SW 12:10–17 — no conflict
check('rotation: SW after NS is fine', findScheduleConflict({ productId: 'SW', daysOfWeek: all, startTime: '12:10', endTime: '17:00' }, [ns], products, nines) === null);

// 2. overlapping products that share South → blocked, names the nine and the time
const c2 = findScheduleConflict({ productId: 'SW', daysOfWeek: all, startTime: '11:00', endTime: '17:00' }, [ns], products, nines);
check('shared nine + overlap: blocked', c2 !== null, c2 ?? '');
check('message names the nine, the product and the end time', !!c2 && /South is in use by "North \+ South" until 12:00 PM/.test(c2), c2 ?? '');

// 3. disjoint nines at the same time → allowed (West (9) alongside NS)
check('disjoint nines at the same time: allowed', findScheduleConflict({ productId: 'W9', daysOfWeek: all, startTime: '07:00', endTime: '12:00' }, [ns], products, nines) === null);

// 4. same product overlapping itself → the old rule
const c4 = findScheduleConflict({ productId: 'NS', daysOfWeek: all, startTime: '11:00', endTime: '14:00' }, [ns], products, nines);
check('same product overlap: blocked with the old wording', !!c4 && /Two schedules can't cover the same time/.test(c4), c4 ?? '');

// 5. different days → no conflict
check('different days: allowed', findScheduleConflict({ productId: 'SW', daysOfWeek: [0, 6], startTime: '07:00', endTime: '12:00' }, [{ ...ns, daysOfWeek: [1, 2, 3, 4, 5] }], products, nines) === null);

// 6. an inactive other schedule never conflicts; an inactive candidate never conflicts
check('paused other: ignored', findScheduleConflict({ productId: 'SW', daysOfWeek: all, startTime: '07:00', endTime: '12:00' }, [{ ...ns, active: false }], products, nines) === null);
check('paused candidate: ignored', findScheduleConflict({ productId: 'SW', daysOfWeek: all, startTime: '07:00', endTime: '12:00', active: false }, [ns], products, nines) === null);

// 7. editing itself is not a clash
check('editing the same row: allowed', findScheduleConflict({ ...ns, startTime: '07:30' }, [ns], products, nines) === null);

// 8. the simple course (no products): two unscoped overlapping schedules → blocked; empty days = every day
const plain = { id: 'p', daysOfWeek: [], startTime: '06:30', endTime: '17:30', active: true };
const c8 = findScheduleConflict({ daysOfWeek: [3], startTime: '09:00', endTime: '10:00' }, [plain], [], []);
check('simple course overlap: blocked', !!c8 && /the course/.test(c8), c8 ?? '');
check('simple course, different window: allowed', findScheduleConflict({ daysOfWeek: [3], startTime: '17:30', endTime: '19:00' }, [plain], [], []) === null);

// 9. a product schedule vs an unscoped one is not judged (nothing to compare)
check('product vs unscoped: not judged', findScheduleConflict({ productId: 'NS', daysOfWeek: all, startTime: '07:00', endTime: '12:00' }, [plain], products, nines) === null);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
