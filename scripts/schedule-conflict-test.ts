// COURSE_LAYOUT_SPEC L2 + W2-6 (Cam 2026-10-20: overlaps WARN, never block;
// only an exact same start on the same first tee stays refused). Pure.
// Run: npx tsx scripts/schedule-conflict-test.ts
import { checkSchedule, findScheduleConflict } from '../src/lib/schedule-conflict';

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

const nines = [{ id: 'N', name: 'North' }, { id: 'S', name: 'South' }, { id: 'W', name: 'West' }, { id: 'F', name: 'Front 9' }, { id: 'B', name: 'Back 9' }];
const products = [
  { id: 'NS', label: 'North + South', nineIds: ['N', 'S'], holes: 18 },
  { id: 'SW', label: 'South + West', nineIds: ['S', 'W'], holes: 18 },
  { id: 'NW', label: 'North + West', nineIds: ['N', 'W'], holes: 18 },
  { id: 'WS', label: 'West + South', nineIds: ['W', 'S'], holes: 18 },
  { id: 'W9', label: 'West 9', nineIds: ['W'], holes: 9 },
  { id: '18', label: '18 holes', nineIds: ['F', 'B'], holes: 18 },
  { id: 'B9', label: 'Back 9 start', nineIds: ['B'], holes: 9 },
  { id: 'F9', label: '9 holes', nineIds: ['F'], holes: 9 },
];
const all = [0, 1, 2, 3, 4, 5, 6];
const s = (productId: string | null, startTime: string, endTime: string, extra: Record<string, unknown> = {}) =>
  ({ id: Math.random().toString(36).slice(2), productId, daysOfWeek: all, startTime, endTime, intervalMinutes: 10, active: true, ...extra });
const ns = s('NS', '07:00', '12:00');

// Back-nine starts while 18s make the turn — Cam's case: a note, not a block.
const eighteen = s('18', '07:00', '12:00');
const b9 = checkSchedule(s('B9', '07:00', '10:00'), [eighteen], products, nines);
check('back-nine starts during the turn: allowed', b9.refusal === null, b9.refusal ?? '');
check('…with a "leave a gap around 9:15" note', b9.warnings.some(w => /leave a gap around 9:15 AM/.test(w) && /Back 9/.test(w)), JSON.stringify(b9.warnings));
check('back-nine starts before the turn: no note', checkSchedule(s('B9', '07:00', '09:00'), [eighteen], products, nines).warnings.length === 0);

// Same first tee at the same minute: one tee time sold twice — refused.
const sameTee = checkSchedule(s('F9', '16:00', '18:00'), [s('18', '07:00', '17:00')], products, nines);
check('9 holes and 18 holes off the same tee at the same minute: refused', !!sameTee.refusal && /Front 9 tee at 4:00 PM/.test(sameTee.refusal), sameTee.refusal ?? '');
check('two rounds starting on North at the same minute: refused', !!findScheduleConflict(s('NW', '11:00', '14:00'), [ns], products, nines));
check('same round overlapping itself on the same grid: refused', !!findScheduleConflict(s('NS', '11:00', '14:00'), [ns], products, nines));

// Same tee, overlapping, never the same minute: a note.
const offGrid = checkSchedule(s('NS', '11:05', '14:00'), [ns], products, nines);
check('same round, overlapping off the grid: allowed with a note', offGrid.refusal === null && offGrid.warnings.some(w => /closer together/.test(w)), JSON.stringify(offGrid));

// Back to back (one ends where the next starts) is a hand-off, not a clash.
check('back-to-back hand-off at 12:00: allowed', findScheduleConflict(s('NS', '12:00', '17:00'), [ns], products, nines) === null);

// The rotation the old spec described: SW after NS. NS groups reach South from
// 9:15, so SW's early times meet them — a note.
const rot = checkSchedule(s('SW', '12:10', '17:00'), [ns], products, nines);
check('rotation SW after NS: allowed', rot.refusal === null);
check('…with a turn note naming South', rot.warnings.some(w => /reach South/.test(w)), JSON.stringify(rot.warnings));

// Overlapping rounds that share a nine (previously blocked): allowed with notes.
const shared = checkSchedule(s('SW', '11:00', '17:00'), [ns], products, nines);
check('overlapping rounds sharing South: allowed', shared.refusal === null, shared.refusal ?? '');
check('two 18s turning onto the same nine together get a note', checkSchedule(s('WS', '07:00', '12:00'), [ns], products, nines).warnings.some(w => /both turn onto South/.test(w)));

// Nothing shared: nothing to say.
const apart = checkSchedule(s('W9', '07:00', '12:00'), [ns], products, nines);
check('disjoint nines at the same time: no refusal, no note', apart.refusal === null && apart.warnings.length === 0, JSON.stringify(apart));
check('different days: nothing', checkSchedule({ ...s('NW', '07:00', '12:00'), daysOfWeek: [0, 6] }, [{ ...ns, daysOfWeek: [1, 2, 3, 4, 5] }], products, nines).warnings.length === 0);

// Paused and self.
check('paused other: ignored', findScheduleConflict(s('NS', '07:00', '12:00'), [{ ...ns, active: false }], products, nines) === null);
check('paused candidate: ignored', findScheduleConflict(s('NS', '07:00', '12:00', { active: false }), [ns], products, nines) === null);
check('editing the same row: allowed', findScheduleConflict({ ...ns, startTime: '07:30' }, [ns], products, nines) === null);

// The simple course (no rounds).
const plain = s(null, '06:30', '17:30', { daysOfWeek: [] });
check('simple course, a Wednesday special on the same grid: refused (same minute)', !!findScheduleConflict(s(null, '09:00', '10:00', { daysOfWeek: [3] }), [plain], [], []));
check('simple course, after the last tee: allowed', findScheduleConflict(s(null, '17:30', '19:00', { daysOfWeek: [3] }), [plain], [], []) === null);

// Whole course against a round stays refused.
const c9 = findScheduleConflict(s('NS', '07:00', '12:00'), [plain], products, nines);
check('round vs whole-course: refused', !!c9 && /whole-course schedule overlaps "North \+ South"/.test(c9), c9 ?? '');
check('whole-course vs round: refused too', !!findScheduleConflict(s(null, '07:00', '12:00'), [ns], products, nines));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
