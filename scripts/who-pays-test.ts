// Settings → Prices & fees, "Who pays what" (Cam 2026-10-19): the rows and
// prices come from the same rules the booking uses. Pure.
// Run: npx tsx scripts/who-pays-test.ts
import { whoPays, type WireSchedule, type WireTier } from '../src/lib/who-pays';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ' — ' + JSON.stringify(detail)}`); if (!ok) failed++; };

const sched = (o: Partial<WireSchedule> = {}): WireSchedule => ({
  id: 's1', tierName: 'standard', active: true, startTime: '06:30', endTime: '17:30', daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  greenFeeWeekday: 55, greenFeeWeekend: 70, cartFee: 18, memberRateWeekday: null, memberRateWeekend: null,
  residentRateWeekday: null, residentRateWeekend: null, ...o,
});
const tier = (o: Partial<WireTier> = {}): WireTier => ({ id: 't1', name: 'Gold', active: true, greenFeeWeekday: null, greenFeeWeekend: null, cartFeeWeekday: null, cartFeeWeekend: null, discountPct: null, ...o });

const one = whoPays([sched()], []);
check('one schedule, no residents, no members: only Public', one.rows.map(r => r.key).join() === 'public' && one.rows[0].weekday[0].dollars === 55 && one.rows[0].weekend[0].dollars === 70, one.rows);
check('one period is called "All day"', one.periods[0].label === 'All day');

const res = whoPays([sched({ residentRateWeekday: 30, residentRateWeekend: null })], []);
const r = res.rows.find(x => x.key === 'resident');
check('a resident price adds the Residents row', !!r && r.weekday[0].dollars === 30);
check('a missing weekend resident price shows as the public rate (null)', r?.weekend[0].dollars === null);

const pct = whoPays([sched()], [tier({ discountPct: 20 })]).rows.find(x => x.key === 'tier:t1');
check('a 20% membership: 44 / 56 (applyTierRates)', pct?.weekday[0].dollars === 44 && pct?.weekend[0].dollars === 56, pct);
check('the sentence says how', /20% off the public rate/.test(pct?.who ?? ''));
const flat = whoPays([sched()], [tier({ greenFeeWeekday: 25, greenFeeWeekend: null })]).rows.find(x => x.key === 'tier:t1');
check('a flat membership with only a weekday price uses it on weekends too (as booking does)', flat?.weekday[0].dollars === 25 && flat?.weekend[0].dollars === 25, flat);
check('an inactive membership has no row', !whoPays([sched()], [tier({ active: false, discountPct: 10 })]).rows.some(x => x.key.startsWith('tier:')));
const viaSched = whoPays([sched({ memberRateWeekday: 40, memberRateWeekend: 50 })], [tier()]).rows.find(x => x.key === 'tier:t1');
check('a membership with no price of its own pays the schedule member rate', viaSched?.weekday[0].dollars === 40 && viaSched?.weekend[0].dollars === 50, viaSched);

const two = whoPays([sched({ id: 'a', tierName: 'Morning' }), sched({ id: 'b', tierName: 'Twilight', greenFeeWeekday: 35 }), sched({ id: 'c', active: false })], []);
check('named periods become the columns inside each cell; paused schedules are left out', two.periods.map(p => p.label).join() === 'Morning,Twilight' && two.rows[0].weekday.map(c => c.dollars).join() === '55,35');
check('no memberships but a schedule member rate: no Members row (nobody is charged it without a membership)', !whoPays([sched({ memberRateWeekday: 40 })], []).rows.some(x => x.key === 'members' || x.key.startsWith('tier:')));
const wkend = whoPays([sched({ daysOfWeek: [0, 6] })], [tier({ discountPct: 10 })]);
check('a weekend-only schedule has no weekday price, on every row', wkend.rows.every(r => r.weekday[0].na === true && !r.weekend[0].na));
check('a weekday-only schedule has no weekend price', whoPays([sched({ daysOfWeek: [1, 2, 3, 4, 5] })], []).rows[0].weekend[0].na === true);
check('no schedules: no periods', whoPays([], [tier()]).periods.length === 0);
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
