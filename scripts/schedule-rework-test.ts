// Schedule rework (Cam 2026-10-19). desiredSlots() is shared by the generator
// and the save preview; diffDay() is the preview. Pure + source guards.
// Run: npx tsx scripts/schedule-rework-test.ts
import { readFileSync } from 'fs';
import { desiredSlots, slotKey, type ScheduleForSlots } from '../src/lib/tee-sheet-engine';
import { diffDay } from '../src/lib/schedule-preview';
let failed = 0;
const check = (label: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ' — ' + d}`); if (!ok) failed++; };
const base: ScheduleForSlots = { daysOfWeek: [], productId: null, startTime: '07:00', endTime: '08:00', intervalMinutes: 10, holes: 18, greenFeeWeekdayCents: 5500, greenFeeWeekendCents: 7000, memberRateWeekdayCents: null, memberRateWeekendCents: null, residentRateWeekdayCents: null, residentRateWeekendCents: null, cartFeeCents: 1800, walkingAllowed: true, tierName: 'Morning' };
const mon = '2026-10-19', sat = '2026-10-24';
const d1 = desiredSlots(mon, [base], []);
check('07:00 to 08:00 every 10 min = 6 times, last before the stop', d1.size === 6 && d1.has(slotKey(null, '07:50')) && !d1.has(slotKey(null, '08:00')), String(d1.size));
check('weekday price on Monday, weekend price on Saturday', d1.get(slotKey(null, '07:00'))!.greenFeeCents === 5500 && desiredSlots(sat, [base], []).get(slotKey(null, '07:00'))!.greenFeeCents === 7000);
check('a paused run makes nothing', desiredSlots(mon, [{ ...base, active: false }], []).size === 0);
check('a run limited to Saturdays makes nothing on Monday', desiredSlots(mon, [{ ...base, daysOfWeek: [6] }], []).size === 0);
check('a zero gap never loops forever', desiredSlots(mon, [{ ...base, intervalMinutes: 0 }], []).size === 0);
const twilight = { ...base, tierName: 'Twilight', startTime: '15:00', endTime: '16:00', greenFeeWeekdayCents: 3500 };
check('two named runs on one day', desiredSlots(mon, [base, twilight], []).size === 12 && desiredSlots(mon, [base, twilight], []).get(slotKey(null, '15:00'))!.tierName === 'Twilight');

const row = (time: string, fee: number, extra: Partial<{ playersBooked: number; status: string; bookings: number }> = {}) => ({ productId: null, time, playersBooked: 0, status: 'available', greenFeeCents: fee, memberRateCents: null, residentRateCents: null, cartFeeCents: 1800, bookings: 0, ...extra });
const existing = [row('07:00', 5500), row('07:10', 5000), row('07:20', 5000, { playersBooked: 2, bookings: 1 }), row('06:50', 5500), row('06:40', 5500, { status: 'blocked' })];
const p = diffDay(existing, d1);
check('new times are counted as added', p.added === 3, JSON.stringify(p)); // 07:30, 07:40, 07:50
check('an open time at a new price is repriced', p.repriced === 1, JSON.stringify(p)); // 07:10
check('an open time no longer in the schedule is removed', p.removed === 1, JSON.stringify(p)); // 06:50
check('booked and blocked times are kept, never changed', p.bookedKept === 2, JSON.stringify(p)); // 07:20 booked at old price, 06:40 blocked
check('an unchanged open time is not counted', diffDay([row('07:00', 5500)], desiredSlots(mon, [{ ...base, endTime: '07:10' }], [])).added === 0);

const page = readFileSync('src/app/dashboard/schedules/page.tsx', 'utf8');
check('no Apply-to-tee-sheet button', !page.includes('Apply to tee sheet') && !page.includes('regenerate-tee-times'));
check('every save, pause and delete shows the preview first', (page.match(/confirmWithPreview\(/g) || []).length >= 4 && page.includes('/api/operator/schedule/preview'));
check('the week view, prices and closed days', page.includes('>Your week</h2>') && page.includes('>Prices</h2>') && page.includes('>Closed days</h2>'));
check('runs are named by the course', page.includes('Morning, Twilight'));
const engine = readFileSync('src/lib/tee-sheet-engine.ts', 'utf8');
check('the generator uses the same desiredSlots as the preview', engine.includes('const desired = desiredSlots(dateStr, schedules, products);'));
const bo = readFileSync('src/app/api/operator/blackouts/route.ts', 'utf8');
check('reopening a closed day rebuilds it', bo.includes('await generateTeeTimes(session.courseId, blackout.date)'));
const prev = readFileSync('src/app/api/operator/schedule/preview/route.ts', 'utf8');
check('the preview needs the edit permission and writes nothing', prev.includes("requirePermission(session, 'schedule.edit')") && !/prisma\.\w+\.(create|update|delete)/.test(readFileSync('src/lib/schedule-preview.ts', 'utf8')));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
