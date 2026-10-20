// W2-4 (Cam 2026-10-19): one schedule split into price periods.
// Pure + source guards. Run: npx tsx scripts/schedule-periods-test.ts
import { readFileSync } from 'fs';
import { groupSchedules, snapToGrid, checkPeriods } from '../src/lib/schedule-plans';
import { desiredSlots, slotKey, type ScheduleForSlots } from '../src/lib/tee-sheet-engine';
let failed = 0;
const check = (label: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !info ? '' : ' — ' + info}`); if (!ok) failed++; };

const row = (id: string, startTime: string, endTime: string, extra: Partial<{ productId: string | null; daysOfWeek: number[]; intervalMinutes: number; holes: number; active: boolean; tierName: string }> = {}) =>
  ({ id, startTime, endTime, productId: null, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], intervalMinutes: 8, holes: 18, active: true, tierName: id, ...extra });

// Grouping: back-to-back rows that share round, days, interval, holes and on/off are one schedule.
const g1 = groupSchedules([row('twilight', '15:00', '18:00'), row('morning', '06:30', '15:00')]);
check('morning + twilight back to back read as one schedule, in the order of the day', g1.length === 1 && g1[0].periods.map(p => p.id).join() === 'morning,twilight' && g1[0].startTime === '06:30' && g1[0].endTime === '18:00', JSON.stringify(g1.map(g => g.ids)));
check('empty days mean every day (same as 0..6)', groupSchedules([row('a', '06:00', '12:00', { daysOfWeek: [] }), row('b', '12:00', '18:00')]).length === 1);
check('a gap splits them', groupSchedules([row('a', '06:00', '11:00'), row('b', '12:00', '18:00')]).length === 2);
check('different days split them', groupSchedules([row('a', '06:00', '12:00', { daysOfWeek: [6, 0] }), row('b', '12:00', '18:00')]).length === 2);
check('different interval splits them', groupSchedules([row('a', '06:00', '12:00'), row('b', '12:00', '18:00', { intervalMinutes: 10 })]).length === 2);
check('different round splits them', groupSchedules([row('a', '06:00', '12:00', { productId: 'F9' }), row('b', '12:00', '18:00', { productId: 'B9' })]).length === 2);
check('a paused period is not merged with a live one', groupSchedules([row('a', '06:00', '12:00'), row('b', '12:00', '18:00', { active: false })]).length === 2);
check('every row lands in exactly one group', groupSchedules([row('a', '06:00', '09:00'), row('b', '09:00', '12:00'), row('c', '13:00', '14:00'), row('d', '06:00', '12:00', { daysOfWeek: [6] })]).flatMap(g => g.ids).sort().join() === 'a,b,c,d');

// Snapping: a period starts on a tee time.
check('a period starting between tee times starts with the next one', snapToGrid('07:00', 9, '15:00') === '15:06');
check('…and one on the grid stays put', snapToGrid('07:00', 10, '15:00') === '15:00');

// Validation.
check('periods must run back to back', checkPeriods([{ startTime: '07:00', endTime: '12:00' }, { startTime: '13:00', endTime: '18:00' }], 8) !== null);
check('a period must start before it ends', checkPeriods([{ startTime: '07:00', endTime: '07:00' }], 8) !== null);
check('a valid split passes', checkPeriods([{ startTime: '07:00', endTime: '15:06' }, { startTime: '15:06', endTime: '18:00' }], 9) === null);

// Generation: the boundary tee time belongs to the later period, priced at its rate, no gap, no duplicate.
const base: ScheduleForSlots = { daysOfWeek: [], productId: null, startTime: '07:00', endTime: '15:06', intervalMinutes: 9, holes: 18, greenFeeWeekdayCents: 6500, greenFeeWeekendCents: 8500, memberRateWeekdayCents: null, memberRateWeekendCents: null, residentRateWeekdayCents: null, residentRateWeekendCents: null, cartFeeCents: 1800, walkingAllowed: true, tierName: 'Morning' };
const tw = { ...base, tierName: 'Twilight', startTime: '15:06', endTime: '18:00', greenFeeWeekdayCents: 4000 };
const m = desiredSlots('2026-10-21', [base, tw], []);
check('15:06 is twilight-priced, 14:57 morning', m.get(slotKey(null, '15:06'))?.greenFeeCents === 4000 && m.get(slotKey(null, '14:57'))?.greenFeeCents === 6500);
check('the grid carries straight on through the split', m.has(slotKey(null, '15:15')) && !m.has(slotKey(null, '15:00')));

// The save path and the route.
const svc = readFileSync('src/lib/schedule-service.ts', 'utf8');
check('a schedule saves in one transaction', /export async function saveSchedulePlan[\s\S]*prisma\.\$transaction\(/.test(svc));
check('…only on this course\'s rows', svc.includes("prisma.teeTimeSchedule.findMany({ where: { id: { in: replaces }, courseId } })") && svc.includes('if (existing.length !== replaces.length) return null;'));
check('…checked against the course\'s other schedules', svc.includes('const others = rows.filter(r => !replaces.includes(r.id));'));
check('…then the window is rebuilt', /saveSchedulePlan[\s\S]*await regenerateUpcoming\(courseId\);/.test(svc));
const route = readFileSync('src/app/api/operator/schedule/route.ts', 'utf8');
check('PUT needs schedule.edit and a current agreement', /export async function PUT[\s\S]{0,400}requirePermission\(session, 'schedule\.edit'\)[\s\S]{0,200}requireAgreementCurrent/.test(route));
const page = readFileSync('src/app/dashboard/schedules/page.tsx', 'utf8');
check('the editor adds price periods', page.includes('Add a price period') && page.includes("method: 'PUT'"));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
