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
// Revamp 3 fix 5 (Cam 2026-10-29): a booked time's open spots take the new price too; its bookings keep theirs.
check('a time at a new price is repriced, booked or not', p.repriced === 2, JSON.stringify(p)); // 07:10 open, 07:20 booked
check('an open time no longer in the schedule is removed', p.removed === 1, JSON.stringify(p)); // 06:50
check('a booked or blocked time the schedule dropped is kept', p.bookedKept === 1, JSON.stringify(p)); // 06:40 blocked
check('an unchanged open time is not counted', diffDay([row('07:00', 5500)], desiredSlots(mon, [{ ...base, endTime: '07:00' }], [])).added === 0);

const page = readFileSync('src/app/dashboard/schedules/page.tsx', 'utf8');
const rounds = readFileSync('src/components/dashboard/schedule/BookableRounds.tsx', 'utf8');
const hp = readFileSync('src/components/dashboard/schedule/HoursPrices.tsx', 'utf8');
const closedDays = readFileSync('src/components/dashboard/schedule/ClosedDays.tsx', 'utf8');
check('no Apply-to-tee-sheet button', !page.includes('Apply to tee sheet') && !page.includes('regenerate-tee-times'));
// W2-6 simplification: one save for the whole page, and only after the preview has answered.
check('every save shows the preview first', page.includes("JSON.stringify({ op: 'course', plan })") && page.includes('/api/operator/schedule/preview') && page.includes("disabled={busy || !pending.preview || !!pending.preview.refusal}"));
check('bookable rounds, hours and prices, closed days', [rounds, hp, closedDays].every((f, i) => f.includes(['title="Bookable rounds"', 'title="Hours and prices"', 'title="Closed days"'][i])));
// SCHED-2 (Cam 2026-11-09): tabs, and a set of days is adjusted like a membership — a summary row, Edit opens it.
check('the page is in tabs (SCHEDULE-3 order); the plan lives on the page, so unsaved prices survive a tab change', page.includes("[['rounds', 'Bookable rounds'], ['hours', 'Hours and prices'], ['promos', 'Promotions'], ['demand', 'Demand pricing'], ['closed', 'Closed days']") && page.includes('const [plan, setPlan] = useState<CoursePlan | null>(null);'));
check('Home\'s demand-pricing link opens its tab', page.includes("if (window.location.hash === '#demand-pricing') setTab('demand');"));
check('one row per set of days with its line; tapping it opens it in place, one at a time', hp.includes('{setLine(plan, d)}') && hp.includes('setOpen(isOpen ? null : i)') && hp.includes('{isOpen && body(i, d)}') && hp.includes('{priceTable(i, d)}'));
const demand = readFileSync('src/components/dashboard/DemandPricing.tsx', 'utf8');
check('demand pricing explains itself from the lib\'s own rules, the modes as choices, a key for the grid', demand.includes('`Looks at the last ${WEEKS_LOOKED_AT} weeks') && demand.includes('at most ${MAX_WEEKLY_STEP} points a week') && demand.includes('role="radiogroup" aria-label="Mode"') && demand.includes('→ suggested'));
check('price names are automatic and the course can rename them', hp.includes('aria-label={`Edit ${n}`}') && hp.includes('columnNames(d)'));
const engine = readFileSync('src/lib/tee-sheet-engine.ts', 'utf8');
check('the generator uses the same desiredSlots as the preview', engine.includes('const desired = desiredSlots(dateStr, schedules, products);'));
const bo = readFileSync('src/app/api/operator/blackouts/route.ts', 'utf8') + readFileSync('src/lib/blackouts.ts', 'utf8');
check('reopening a closed day rebuilds it', bo.includes('await generateTeeTimes(courseId, blackout.date)'));
const prev = readFileSync('src/app/api/operator/schedule/preview/route.ts', 'utf8');
check('the preview needs the edit permission and writes nothing', prev.includes("requirePermission(session, 'schedule.edit')") && !/prisma\.\w+\.(create|update|delete)/.test(readFileSync('src/lib/schedule-preview.ts', 'utf8')));
check('rounds are switched on through setRoundSale (prices every column; tested in course-plan-test)', page.includes('setRoundSale(p, key, patch, defaultCell)'));
check('walking is set per price cell, weekday and weekend (CART-1), as a switch', hp.includes('Walking allowed') && hp.includes("sw('walk', 'walkWeekend', we, 'weekday')") && hp.includes("sw('walkWeekend', 'walk', wd, 'weekend')") && !hp.includes('Golfers can walk'));
// PRICES-1 (Cam 2026-11-04, "one table"): rounds side by side as columns, a row per price; one round at a time on a phone.
// SCHEDULE-3 (Cam 2026-11-16): one round at a time, picked like Bookable rounds; a column per time-of-day price, a row per price.
check('prices: the round picker matches Bookable rounds; a column per time-of-day price, a row per price', hp.includes('const round = sold.find(r => r.key === pick) ?? sold[0];') && hp.includes('{rows.map(r => (') && hp.includes('{names.map((n, col) => ('));
check('…each price column opens its own pop-up (rename, move its start, remove; the first can be renamed)', hp.includes('setColDraft({ i, col, label: \'own\'') && hp.includes('Remove this price') && hp.includes('setDay(c.i, { firstName: name })'));
check('…with no round on sale it says so', hp.includes('if (!round) return'));
check('…a phone scrolls a wide price table sideways', hp.includes('overflow-x-auto border border-line'));
// Build review of #431 (Cam 2026-11-16, "when editing it it all is together"): a round's own booking rules live in its
// edit pop-up (no Booking rules tab), and Closed days calls a day bookable from the SAVED schedule only.
check('a round\'s own booking rules are in its edit pop-up, saved through round-rules; no Booking rules tab', rounds.includes('<Block label="Booking rules">') && page.includes("'/api/operator/round-rules'") && !page.includes("'Booking rules']"));
check('Closed days reads the saved schedule, never unsaved edits', page.includes('const savedPlan: CoursePlan | null = saved ? JSON.parse(saved) : null;') && page.includes('daysOf(savedPlan, d)'));
check('the unsaved pill shows only on the tabs it saves', page.includes('{dirty && canEdit && planTab && ('));
check('the editor stacks on phones', !page.includes('<div className="grid grid-cols-3 gap-3">'));
check('closing a day never tries to delete a row with cancelled bookings', bo.includes('bookings: { none: {} }'));
check('reopening a past day does not regenerate it', bo.includes('if (blackout.date < todayIn(course?.timezone))'));
check('Birdie no longer mentions an Apply button', !readFileSync('src/lib/birdie/proposals.ts', 'utf8').includes('Apply to tee sheet'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
