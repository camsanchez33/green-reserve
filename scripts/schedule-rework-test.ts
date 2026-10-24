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
// W2-3 (Cam 2026-10-19): the last tee time goes off AT the end time.
check('07:00 to 08:00 every 10 min = 7 times, the last at 08:00', d1.size === 7 && d1.has(slotKey(null, '08:00')), String(d1.size));
check('an end off the interval stops at the last time before it', desiredSlots(mon, [{ ...base, endTime: '07:55' }], []).size === 6 && !desiredSlots(mon, [{ ...base, endTime: '07:55' }], []).has(slotKey(null, '07:55')));
check('weekday price on Monday, weekend price on Saturday', d1.get(slotKey(null, '07:00'))!.greenFeeCents === 5500 && desiredSlots(sat, [base], []).get(slotKey(null, '07:00'))!.greenFeeCents === 7000);
check('a paused run makes nothing', desiredSlots(mon, [{ ...base, active: false }], []).size === 0);
check('a run limited to Saturdays makes nothing on Monday', desiredSlots(mon, [{ ...base, daysOfWeek: [6] }], []).size === 0);
check('a zero gap never loops forever', desiredSlots(mon, [{ ...base, intervalMinutes: 0 }], []).size === 0);
const twilight = { ...base, tierName: 'Twilight', startTime: '15:00', endTime: '16:00', greenFeeWeekdayCents: 3500 };
check('two named runs on one day', desiredSlots(mon, [base, twilight], []).size === 14 && desiredSlots(mon, [base, twilight], []).get(slotKey(null, '15:00'))!.tierName === 'Twilight');
const late = { ...base, tierName: 'Late', startTime: '08:00', endTime: '09:00', greenFeeWeekdayCents: 3000 };
check('back to back: the run that STARTS at the shared time owns it, in either order', [[base, late], [late, base]].every(o => { const m = desiredSlots(mon, o, []); return m.size === 13 && m.get(slotKey(null, '08:00'))!.tierName === 'Late'; }));
// Two rounds on a shared nine, back to back: only the starter sells 08:00.
const prods = [{ id: 'NS', holes: 18, active: true, nineIds: ['N', 'S'] }, { id: 'SE', holes: 18, active: true, nineIds: ['S', 'E'] }, { id: 'EW', holes: 18, active: true, nineIds: ['E', 'W'] }];
const ns = { ...base, productId: 'NS' }, se = { ...late, productId: 'SE' }, ew = { ...late, productId: 'EW' };
check('back to back on a shared nine: the earlier round gives up its end time', [[ns, se], [se, ns]].every(o => { const m = desiredSlots(mon, o, prods); return !m.has(slotKey('NS', '08:00')) && m.has(slotKey('SE', '08:00')); }));
check('…a whole-course run starting there takes it from a round too', !desiredSlots(mon, [ns, late], prods).has(slotKey('NS', '08:00')));
check('…but rounds on different nines keep their own end time', desiredSlots(mon, [ns, ew], prods).has(slotKey('NS', '08:00')) && desiredSlots(mon, [ns, ew], prods).has(slotKey('EW', '08:00')));

const row = (time: string, fee: number, extra: Partial<{ playersBooked: number; status: string; bookings: number }> = {}) => ({ productId: null, time, playersBooked: 0, status: 'available', greenFeeCents: fee, memberRateCents: null, residentRateCents: null, cartFeeCents: 1800, bookings: 0, ...extra });
const existing = [row('07:00', 5500), row('07:10', 5000), row('07:20', 5000, { playersBooked: 2, bookings: 1 }), row('06:50', 5500), row('06:40', 5500, { status: 'blocked' })];
const p = diffDay(existing, d1);
check('new times are counted as added', p.added === 4, JSON.stringify(p)); // 07:30, 07:40, 07:50, 08:00
check('an open time at a new price is repriced', p.repriced === 1, JSON.stringify(p)); // 07:10
check('an open time no longer in the schedule is removed', p.removed === 1, JSON.stringify(p)); // 06:50
check('booked and blocked times are kept, never changed', p.bookedKept === 2, JSON.stringify(p)); // 07:20 booked at old price, 06:40 blocked
check('an unchanged open time is not counted', diffDay([row('07:00', 5500)], desiredSlots(mon, [{ ...base, endTime: '07:00' }], [])).added === 0);

const page = readFileSync('src/app/dashboard/schedules/page.tsx', 'utf8');
check('no Apply-to-tee-sheet button', !page.includes('Apply to tee sheet') && !page.includes('regenerate-tee-times'));
// W2-6 simplification: one save for the whole page, and only after the preview has answered.
check('every save shows the preview first', page.includes("JSON.stringify({ op: 'course', plan })") && page.includes('/api/operator/schedule/preview') && page.includes("disabled={busy || !pending.preview || !!pending.preview.refusal}"));
check('open hours, what golfers can book, what it costs, closed days', ["When you&apos;re open", '>What golfers can book</h2>', '>What it costs</h2>', '>Closed days</h2>'].every(h => page.includes(h)));
check('price names are automatic and the course can rename them', page.includes('Tap a name to rename it') && page.includes('columnNames(d)'));
const engine = readFileSync('src/lib/tee-sheet-engine.ts', 'utf8');
check('the generator uses the same desiredSlots as the preview', engine.includes('const desired = desiredSlots(dateStr, schedules, products);'));
const bo = readFileSync('src/app/api/operator/blackouts/route.ts', 'utf8');
check('reopening a closed day rebuilds it', bo.includes('await generateTeeTimes(session.courseId, blackout.date)'));
const prev = readFileSync('src/app/api/operator/schedule/preview/route.ts', 'utf8');
check('the preview needs the edit permission and writes nothing', prev.includes("requirePermission(session, 'schedule.edit')") && !/prisma\.\w+\.(create|update|delete)/.test(readFileSync('src/lib/schedule-preview.ts', 'utf8')));
check('rounds are switched on through setRoundSale (prices every column; tested in course-plan-test)', page.includes('setRoundSale(p, key, patch, defaultCell)'));
check('walking is set per price cell, weekday and weekend (CART-1)', page.includes("label: 'Can walk'") && page.includes('walkPair(r.key, col)') && !page.includes('Golfers can walk'));
check('the editor stacks on phones', !page.includes('<div className="grid grid-cols-3 gap-3">'));
check('closing a day never tries to delete a row with cancelled bookings', bo.includes('bookings: { none: {} }'));
check('reopening a past day does not regenerate it', bo.includes('if (blackout.date < todayIn(course?.timezone))'));
check('Birdie no longer mentions an Apply button', !readFileSync('src/lib/birdie/proposals.ts', 'utf8').includes('Apply to tee sheet'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
