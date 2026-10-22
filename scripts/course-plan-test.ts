// W2-6 Schedule simplification: the course plan (open hours · rounds · one
// price table) and the rows it is stored as. Pure. Run: npx tsx scripts/course-plan-test.ts
import { setRoundSale, checkRows, compilePlan, readPlan, checkPlan, blankPlan, columnNames, autoName, snap, emptyCell, type CoursePlan, type PlanRound } from '../src/lib/course-plan';
import { desiredSlots } from '../src/lib/tee-sheet-engine';
import { scheduleMoneyForCreate } from '../src/lib/schedule-wire';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ' — ' + detail : ''}`); if (!ok) failed++; };

const R18: PlanRound = { key: 'p18', label: '18 holes', holes: 18 };
const B9: PlanRound = { key: 'pb9', label: 'Back 9', holes: 9 };
const F9: PlanRound = { key: 'pf9', label: 'Front 9', holes: 9 };
const rounds = [R18, B9, F9];
const cell = (wd: number, we: number, cart: number) => ({ ...emptyCell(), weekday: wd, weekend: we, cart });

// Slots a set of compiled rows makes on a date (the generator's own rule).
const slots = (rows: ReturnType<typeof compilePlan>, date: string) => desiredSlots(date, rows.map(r => ({ ...r, ...scheduleMoneyForCreate(r) })) as never,
  [{ id: 'p18', holes: 18, active: true, nineIds: ['F', 'B'] }, { id: 'pb9', holes: 9, active: true, nineIds: ['B'] }, { id: 'pf9', holes: 9, active: true, nineIds: ['F'] }]);

check('auto names', autoName('07:00', true) === 'All day' && autoName('07:00', false) === 'Morning' && autoName('12:00', false) === 'Midday' && autoName('14:30', false) === 'Afternoon' && autoName('15:00', false) === 'Twilight');
check('snap to the grid', snap({ first: '07:00', interval: 8 }, '15:02') === '15:08' && snap({ first: '07:00', interval: 10 }, '15:00') === '15:00');

// The common course: 18 all day, back 9 mornings until 10:00, front 9 from 3pm; twilight price from 3pm.
const plan: CoursePlan = {
  rounds: [{ key: 'p18', on: true, from: null, to: '15:00', walk: true }, { key: 'pb9', on: true, from: null, to: '10:00', walk: true }, { key: 'pf9', on: true, from: '15:00', to: null, walk: true }],
  usual: { days: [], closed: false, first: '07:00', last: '17:00', interval: 10, firstName: null, changes: [{ at: '15:00', name: null }],
    prices: { p18: [cell(65, 85, 20), cell(40, 50, 15)], pb9: [cell(35, 45, 12), cell(25, 30, 10)], pf9: [cell(35, 45, 12), cell(25, 30, 10)] } },
  different: [{ days: [1], closed: false, first: '10:00', last: '17:00', interval: 10, firstName: null, changes: [], prices: { p18: [cell(50, 50, 18)], pb9: [cell(30, 30, 10)], pf9: [cell(30, 30, 10)] } }],
};
check('the plan checks out', checkPlan(plan, rounds) === null, String(checkPlan(plan, rounds)));
check('column names: Morning, Twilight', columnNames(plan.usual).join(',') === 'Morning,Twilight');
const rows = compilePlan(plan, rounds);
const usualRows = rows.filter(r => r.daysOfWeek.length === 6);
check('usual week covers every day but Monday', usualRows.length > 0 && !usualRows[0].daysOfWeek.includes(1));
check('Monday has its own rows', rows.some(r => r.daysOfWeek.join() === '1' && r.startTime === '10:00'));

// Wednesday 2030-06-12 (weekday), Saturday 2030-06-15 (weekend), Monday 2030-06-10.
const wed = slots(rows, '2030-06-12');
const get = (m: ReturnType<typeof slots>, p: string, t: string) => m.get(`${p}|${t}`);
check('18 holes 7:00 at the morning weekday price', get(wed, 'p18', '07:00')?.greenFeeCents === 6500, JSON.stringify(get(wed, 'p18', '07:00')));
check('18 holes last sold 14:50 (front 9 owns 15:00 on the shared nine)', !!get(wed, 'p18', '14:50') && !get(wed, 'p18', '15:00'));
check('back 9 sold 7:00 through 10:00, not after', !!get(wed, 'pb9', '07:00') && !!get(wed, 'pb9', '10:00') && !get(wed, 'pb9', '10:10'));
check('front 9 from 15:00 to 17:00 at twilight with its cart', get(wed, 'pf9', '15:00')?.greenFeeCents === 2500 && get(wed, 'pf9', '15:00')?.cartFeeCents === 1000 && !!get(wed, 'pf9', '17:00') && !get(wed, 'pf9', '14:50'));
const sat = slots(rows, '2030-06-15');
check('weekend price on Saturday', get(sat, 'p18', '07:00')?.greenFeeCents === 8500);
const mon = slots(rows, '2030-06-10');
check('Monday: first tee 10:00, its own price', !get(mon, 'p18', '07:00') && get(mon, 'p18', '10:00')?.greenFeeCents === 5000, JSON.stringify(get(mon, 'p18', '10:00')));

// Read back.
const back = readPlan(rows.map(r => ({ ...r })), rounds);
check('read back: usual hours', back.usual.first === '07:00' && back.usual.last === '17:00' && back.usual.interval === 10, JSON.stringify(back.usual));
check('read back: one price change at 15:00', back.usual.changes.length === 1 && back.usual.changes[0].at === '15:00', JSON.stringify(back.usual.changes));
check('read back: Monday is different', back.different.length === 1 && back.different[0].days.join() === '1' && back.different[0].first === '10:00');
check('read back: back 9 sold until 10:00, front 9 from 15:00', back.rounds.find(r => r.key === 'pb9')?.to === '10:00' && back.rounds.find(r => r.key === 'pf9')?.from === '15:00', JSON.stringify(back.rounds));
check('read back: 18 morning and twilight prices', back.usual.prices.p18?.[0].weekday === 65 && back.usual.prices.p18?.[1].weekday === 40, JSON.stringify(back.usual.prices.p18));
const again = compilePlan(back, rounds);
const sameSlots = (a: ReturnType<typeof slots>, b: ReturnType<typeof slots>) => a.size === b.size && [...a].every(([k, v]) => JSON.stringify(b.get(k)) === JSON.stringify(v));
check('read back then saved again makes the same tee sheet (weekday, weekend, Monday)', sameSlots(slots(again, '2030-06-12'), wed) && sameSlots(slots(again, '2030-06-15'), sat) && sameSlots(slots(again, '2030-06-10'), mon));

// Overlap rules (W2-6 slice 2) over the rows a plan makes.
const P = [{ id: 'p18', label: '18 holes', nineIds: ['F', 'B'], holes: 18 }, { id: 'pb9', label: 'Back 9', nineIds: ['B'], holes: 9 }, { id: 'pf9', label: 'Front 9', nineIds: ['F'], holes: 9 }];
const N = [{ id: 'F', name: 'Front' }, { id: 'B', name: 'Back' }];
const ok = checkRows(rows, P, N);
check('the common course saves (no refusal)', ok.refusal === null, String(ok.refusal));
check('…with a note about back-nine starts meeting the 18s at the turn', ok.warnings.length > 0, JSON.stringify(ok.warnings));
const twice = compilePlan({ ...plan, rounds: plan.rounds.map(r => r.key === 'pf9' ? { ...r, from: null } : r) }, rounds);
check('front 9 all day on the 18’s first tee is refused (one tee time sold twice)', checkRows(twice, P, N).refusal !== null);

// Closed days and refusals.
const closedMon: CoursePlan = { ...plan, different: [{ ...plan.different[0], closed: true }] };
check('a closed Monday makes no Monday tee times', slots(compilePlan(closedMon, rounds), '2030-06-10').size === 0);
check('read back: Monday closed', readPlan(compilePlan(closedMon, rounds), rounds).different.some(d => d.closed && d.days.join() === '1'));
check('a day in two sets is refused', checkPlan({ ...plan, different: [plan.different[0], { ...plan.different[0] }] }, rounds) !== null);
check('no round on is refused', checkPlan({ ...plan, rounds: plan.rounds.map(r => ({ ...r, on: false })) }, rounds) !== null);
check('a price change after the last tee is refused', checkPlan({ ...plan, usual: { ...plan.usual, changes: [{ at: '18:00', name: null }] } }, rounds) !== null);
check('last before first is refused', checkPlan({ ...plan, usual: { ...plan.usual, first: '18:00' } }, rounds) !== null);
const blank = blankPlan([{ key: '', label: 'The course', holes: 18 }]);
check('a course with no named rounds: one row, the course as a whole', compilePlan(blank, [{ key: '', label: 'The course', holes: 18 }]).length === 1 && compilePlan(blank, [{ key: '', label: 'The course', holes: 18 }])[0].productId === null);
check('renamed column keeps its name in the rows', compilePlan({ ...plan, usual: { ...plan.usual, firstName: 'Early bird' } }, rounds).some(r => r.tierName === 'Early bird'));

// Review fixes (2026-10-22).
const cartOnly = compilePlan({ ...plan, rounds: plan.rounds.map(r => r.key === 'p18' ? { ...r, walk: false } : r) }, rounds);
check('a cart-required round is stored cart-only', cartOnly.filter(r => r.productId === 'p18').every(r => r.walkingAllowed === false) && cartOnly.filter(r => r.productId === 'pb9').every(r => r.walkingAllowed === true));
check('…and stays cart-only when read back and saved again', compilePlan(readPlan(cartOnly, rounds), rounds).filter(r => r.productId === 'p18').every(r => r.walkingAllowed === false));
check('…its tee times are cart-only', get(slots(cartOnly, '2030-06-12'), 'p18', '07:00')?.walkingAllowed === false);
const closedRead = readPlan(compilePlan(closedMon, rounds), rounds);
const reopened = { ...closedRead, different: closedRead.different.map(d => ({ ...d, closed: false })) };
check('a reopened day sells at the usual prices, never $0', get(slots(compilePlan(reopened, rounds), '2030-06-10'), 'p18', '07:00')?.greenFeeCents === 6500, JSON.stringify(get(slots(compilePlan(reopened, rounds), '2030-06-10'), 'p18', '07:00')));
const neg = { ...plan, usual: { ...plan.usual, prices: { ...plan.usual.prices, p18: [{ ...cell(65, 85, 20), memberWeekday: -5 }, cell(40, 50, 15)] } } };
check('a negative member price is refused', checkPlan(neg, rounds) !== null);
check('a fractional interval is refused', checkPlan({ ...plan, usual: { ...plan.usual, interval: 7.5 } }, rounds) !== null);
check('a day that is not a weekday is refused', checkPlan({ ...plan, different: [{ ...plan.different[0], days: [9] }] }, rounds) !== null);
const off = { ...plan, rounds: plan.rounds.map(r => r.key === 'pf9' ? { ...r, on: false } : r), usual: { ...plan.usual, prices: { p18: plan.usual.prices.p18, pb9: plan.usual.prices.pb9 } } };
const on = setRoundSale(off, 'pf9', { on: true }, () => cell(9, 9, 9));
check('a round switched on is priced in every column of every set of days', on.usual.prices.pf9?.length === 2 && on.different.every(d => d.prices.pf9?.length === d.changes.length + 1) && checkPlan(on, rounds) === null);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
