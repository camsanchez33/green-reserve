// Analytics page data (Cam 2026-11-17, lanes/dashboard.md item 5): the pure parts of lib/analytics-page —
// cancel lead buckets, refill pairing, how a booking was made, the no-show report, stock value —
// and that the routes are gated and read the ledger. No database. Run: npx tsx scripts/analytics-page-test.ts
import { readFileSync } from 'fs';
import { feeOnNoShow } from '../src/lib/cancel-policy';
import { leadOf, howOf, refillsOf, noShowOf, stockOf, projectionsOf, type NsBooking } from '../src/lib/analytics-page';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const H = 3600000;

// ── Lead buckets ──
ok('7 days or more is 7d_plus', leadOf(168) === '7d_plus' && leadOf(500) === '7d_plus');
ok('2 to 7 days', leadOf(48) === '2_7d' && leadOf(167.9) === '2_7d');
ok('24 to 48 hours', leadOf(24) === '24_48h' && leadOf(47.9) === '24_48h');
ok('under 24 hours (and a cancel after the tee time)', leadOf(23.9) === 'under_24h' && leadOf(-2) === 'under_24h');

// ── How they booked ──
ok('online, card, fee', howOf({ source: 'online', cardSaved: true, feeOnNoShow: true }) === 'online_card_fee');
ok('online, card, no fee', howOf({ source: 'online', cardSaved: true, feeOnNoShow: false }) === 'online_card_no_fee');
ok('online, no card (a course with no fee saves none)', howOf({ source: 'online', cardSaved: false, feeOnNoShow: true }) === 'online_no_card');
ok('phone and walk-in are the counter', howOf({ source: 'phone', cardSaved: false, feeOnNoShow: false }) === 'counter_no_card' && howOf({ source: 'walk_in', cardSaved: true, feeOnNoShow: true }) === 'counter_card' && howOf({ source: 'phone', cardSaved: true, feeOnNoShow: false }) === 'counter_card');

// ── A fee that reaches a no-show (lib/cancel-policy feeOnNoShow, shared with lib/analytics.ts) ──
ok('a no-show fee reaches a no-show', feeOnNoShow({ noShowFeeTotal: 500, cancellationFeeTotal: 0, lateFeeTimingAtBooking: 'late_cancel' }));
ok('a hold kept at the cutoff does (and old bookings with no timing hold)', feeOnNoShow({ noShowFeeTotal: 0, cancellationFeeTotal: 2000, lateFeeTimingAtBooking: 'hold_at_cutoff' }) && feeOnNoShow({ noShowFeeTotal: 0, cancellationFeeTotal: 2000, lateFeeTimingAtBooking: null }));
ok('"late cancel or no-show" does', feeOnNoShow({ noShowFeeTotal: 0, cancellationFeeTotal: 2000, lateFeeTimingAtBooking: 'late_cancel_or_no_show' }));
ok('a plain late-cancel fee, or no fee, does not', !feeOnNoShow({ noShowFeeTotal: 0, cancellationFeeTotal: 2000, lateFeeTimingAtBooking: 'late_cancel' }) && !feeOnNoShow({ noShowFeeTotal: 0, cancellationFeeTotal: 0, lateFeeTimingAtBooking: 'hold_at_cutoff' }));

// ── Refill pairing ──
const T0 = Date.parse('2031-06-10T12:00:00Z');
const at = (h: number) => new Date(T0 + h * H);
const bk = (o: Partial<NsBooking> & { id: string }): NsBooking => ({
  teeTimeId: 'tt1', teeAt: T0, status: 'confirmed', players: 2, source: 'online', checkedInAt: null, createdAt: at(-500), cancelledAt: null,
  splitFromId: null, cardSaved: true, feeOnNoShow: true, valueCents: 10000, calledOff: false, paid: false, windowHours: 24, ...o,
});
{
  const cA = bk({ id: 'cA', status: 'cancelled', players: 2, cancelledAt: at(-200) });   // 7d+ out
  const cB = bk({ id: 'cB', status: 'cancelled', players: 2, cancelledAt: at(-10) });    // under 24h
  const n1 = bk({ id: 'n1', players: 3, createdAt: at(-150) });                          // after A, before B: fills A's 2, 1 left
  const n2 = bk({ id: 'n2', players: 1, createdAt: at(-5) });                            // after B
  const early = bk({ id: 'early', players: 4, createdAt: at(-300) });                    // before any cancel: never a refill
  const split = bk({ id: 'split', players: 2, createdAt: at(-4), splitFromId: 'n1' });  // a split part is not a new booking
  const dead = bk({ id: 'dead', status: 'cancelled', players: 2, createdAt: at(-3), cancelledAt: at(-2) });
  const other = bk({ id: 'other', teeTimeId: 'tt2', players: 2, createdAt: at(-1) });   // another tee time
  const pairs = refillsOf([cA, cB, n1, n2, early, split, dead, other], [cA, cB]);
  const of = (c: string) => pairs.filter(p => p.cancelId === c).reduce((n, p) => n + p.spots, 0);
  ok('the 7d+ cancel is filled by the next booking on that time', of('cA') === 2, pairs);
  ok('the late cancel gets only n2: n1 was made before it, and early, a split, a cancelled one or another time never count', of('cB') === 1 && pairs.every(p => ['n1', 'n2'].includes(p.newId)), pairs);
  const n3 = bk({ id: 'n3', players: 4, createdAt: at(-1) });
  const again = refillsOf([cA, cB, n3], [cA, cB]);
  ok('a new booking\'s players fill spots once across cancels (4 players: A 2 + B 2)', again.filter(p => p.newId === 'n3').reduce((n, p) => n + p.spots, 0) === 4 && again.length === 2, again);
}

// ── The report ──
{
  const now = T0 + 48 * H;
  const all: NsBooking[] = [
    bk({ id: 'played', checkedInAt: at(0), status: 'completed', valueCents: 8000 }),
    bk({ id: 'ns1', valueCents: 9000 }),                                                     // online, card, fee: no-show
    bk({ id: 'ns2', source: 'phone', cardSaved: false, feeOnNoShow: false, valueCents: 5000 }), // counter no card: no-show
    bk({ id: 'future', teeAt: now + 10 * H }),                                               // not played yet: not in the rate
    bk({ id: 'late', status: 'cancelled', players: 2, cancelledAt: at(-5), valueCents: 6000 }),
    bk({ id: 'refill', players: 1, createdAt: at(-3), checkedInAt: at(0), status: 'completed', valueCents: 3000 }),
    bk({ id: 'wx', status: 'cancelled', cancelledAt: at(-1), calledOff: true }),              // called off: not a cancel
  ];
  const fees = new Map([['ns1', 2500], ['late', 1000]]);
  const rounds = new Map([['refill', 3000], ['played', 8000]]);
  const r = noShowOf({ from: '2031-06-10', to: '2031-06-10' }, all, now, 24, fees, rounds);
  ok('rate: 2 no-shows of 4 played-or-missed bookings (a cancel, a future time left out)', r.totals.noShows === 2 && r.totals.bookings === 4 && r.totals.ratePct === 50, r.totals);
  ok('lost value is the bookings\' price; recovered is ledger fee money', r.totals.lostValueCents === 14000 && r.totals.recoveredCents === 2500, r.totals);
  const row = (k: string) => r.byHow.find(x => x.key === k);
  ok('by how they booked: the online card+fee row nets the fee against the loss', row('online_card_fee')?.noShows === 1 && row('online_card_fee')?.netCents === 2500 - 9000, r.byHow);
  ok('by how they booked: the counter no-card row', row('counter_no_card')?.noShows === 1 && row('counter_no_card')?.recoveredCents === 0, r.byHow);
  ok('empty rows are left out', !row('online_no_card'), r.byHow);
  const u24 = r.refill.buckets.find(b => b.key === 'under_24h')!;
  ok('the late cancel: 2 spots, 1 filled again; the called-off round is not counted', u24.cancelledSpots === 2 && u24.refilledSpots === 1 && u24.pct === 50, r.refill);
  ok('late cancels: value lost, refill money (the refill booking\'s round, 1 of 1 player), fee', r.lateCancels.spots === 2 && r.lateCancels.lostValueCents === 6000 && r.lateCancels.refilledCents === 3000 && r.lateCancels.feesCents === 1000 && r.lateCancels.netCents === -2000, r.lateCancels);
  ok('net = recovered − lost + late-cancel net', r.totals.netCents === 2500 - 14000 - 2000, r.totals);
  // The window is the one each booking was made under (R-PAY-003), not today's setting.
  const early = noShowOf({ from: '2031-06-10', to: '2031-06-10' }, all.map(b => (b.id === 'late' ? { ...b, windowHours: 4 } : b)), now, 24, fees, rounds);
  ok('a cancel outside its own window is not late, and its fee is not counted as a late fee', early.lateCancels.spots === 0 && early.lateCancels.feesCents === 0, early.lateCancels);
  const paidRound = noShowOf({ from: '2031-06-10', to: '2031-06-10' }, all.map(b => (b.id === 'ns2' ? { ...b, paid: true } : b)), now, 24, fees, rounds);
  ok('a round already paid but never checked in stays in the rate, but lost nothing', paidRound.totals.noShows === 2 && paidRound.totals.lostValueCents === 9000, paidRound.totals);
}

// ── Stock ──
{
  const now = new Date('2031-06-10T12:00:00Z');
  const old = new Date('2031-01-01T00:00:00Z'), recent = new Date('2031-06-01T00:00:00Z');
  const rows = [
    { id: 'a', name: 'Rain jacket', stockCount: 3, priceCents: 8000, costCents: 4000, createdAt: old, hasOptions: false },
    { id: 'b', name: 'Balls', stockCount: 10, priceCents: 500, costCents: null, createdAt: old, hasOptions: false },
    { id: 'c', name: 'New glove', stockCount: 2, priceCents: 2000, costCents: 1000, createdAt: recent, hasOptions: false },
    { id: 'd', name: 'Hat (parent)', stockCount: 5, priceCents: 3000, costCents: 1000, createdAt: old, hasOptions: true },
    { id: 'e', name: 'Uncounted', stockCount: null, priceCents: 100, costCents: 50, createdAt: old, hasOptions: false },
    { id: 'f', name: 'Sold out', stockCount: 0, priceCents: 100, costCents: 50, createdAt: old, hasOptions: false },
  ];
  const sold = new Map([['b', new Date('2031-06-09T00:00:00Z')], ['a', new Date('2031-03-01T00:00:00Z')]]);
  const s = stockOf(rows, sold, now, { cost: true });
  ok('retail value: on-shelf count × price (parents, uncounted and sold-out left out)', s.retailValueCents === 3 * 8000 + 10 * 500 + 2 * 2000 && s.units === 15 && s.items === 3, s);
  ok('cost value only where a cost is known, and how many lack one', s.costValueCents === 3 * 4000 + 2 * 1000 && s.costUnknownItems === 1, s);
  ok('uncounted items are counted apart', s.uncountedItems === 1, s);
  ok('not selling: last sold 60+ days ago; a new item that never sold is not stale yet', s.notSelling.length === 1 && s.notSelling[0].id === 'a' && s.notSellingRetailCents === 24000 && s.notSellingCostCents === 12000, s.notSelling);
  const staff = stockOf(rows, sold, now, { cost: false });
  ok('staff never get cost', staff.costValueCents === undefined && staff.notSelling.every(i => !('costValueCents' in i)) && staff.notSellingCostCents === undefined, staff);
}

// ── Projections ──
{
  // Today Wed 2031-06-11. The same Tuesday the last four weeks: 8 booked by 7 days out, 20 by the day.
  const today = '2031-06-11';
  const nowMs = Date.parse('2031-06-11T12:00:00Z');
  const slot = (date: string, players: { n: number; madeDaysBefore: number; cancelled?: boolean }[], o: { status?: string; offered?: number; time?: string } = {}) => ({
    date, time: o.time ?? '08:00', status: o.status ?? 'available', playersAvailable: o.offered ?? 40,
    bookings: players.map(p => ({ players: p.n, status: p.cancelled ? 'cancelled' : 'confirmed', createdAt: new Date(Date.parse(date + 'T08:00:00Z') - p.madeDaysBefore * 86400000), cancelledAt: p.cancelled ? new Date(Date.parse(date + 'T08:00:00Z') - 86400000) : null })),
  });
  const addD = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const slots = [] as ReturnType<typeof slot>[];
  for (let k = 1; k <= 4; k++) slots.push(slot(addD('2031-06-17', -7 * k), [{ n: 8, madeDaysBefore: 10 }, { n: 12, madeDaysBefore: 2 }]));
  slots.push(slot('2031-06-17', [{ n: 6, madeDaysBefore: 10 }]));            // six days out: 6 booked, usual by now 8
  slots.push(slot('2031-06-12', [{ n: 4, madeDaysBefore: 10 }], { offered: 10, time: '13:00' })); // a short day
  const p = projectionsOf(slots, new Set(['2031-06-13']), today, nowMs, 160000);
  const day = (d: string) => p.week.find(x => x.date === d) ?? null;
  ok('the next 7 days', p.week.length === 7 && p.week[0].date === today, p.week.map(d => d.date));
  ok('six days out: booked 6, usual by now 8 → behind, expected 6 + the usual 12 still to come', day('2031-06-17')?.booked === 6 && day('2031-06-17')?.usualByNow === 8 && day('2031-06-17')?.expected === 18 && day('2031-06-17')?.status === 'behind', day('2031-06-17'));
  ok('a closed day (blackout) is closed with no spots', day('2031-06-13')?.status === 'closed' && day('2031-06-13')?.offered === 0, day('2031-06-13'));
  ok('last 30 days: the four past Tuesdays, 20 players each', p.last.players === 80 && p.last.offered === 160, p.last);
  ok('revenue next = expected players × ledger tee money per player (an estimate)', p.next.teeRevenueCents === Math.round(p.next.players * 2000), { next: p.next });
  ok('Jun 24, Jul 1 and Jul 8 (no tee times yet) come from the usual final count, 20 each', p.next.players === 4 + 18 + 20 * 3, p.next);
  ok('the change line', p.change.playersPct === Math.round(((p.next.players - 80) / 80) * 1000) / 10, p.change);
}

// ── Routes: gated, this course, ledger money ──
const read = (f: string) => readFileSync(f, 'utf8');
for (const f of ['src/app/api/operator/analytics/no-shows/route.ts', 'src/app/api/operator/analytics/projections/route.ts', 'src/app/api/operator/analytics/shop/route.ts', 'src/app/api/operator/analytics/route.ts']) {
  const s = read(f);
  ok(`${f}: signed in, analytics.view, the session's course`, s.includes('resolveDashboardSession()') && s.includes("requirePermission(session, 'analytics.view')") && s.includes('session.courseId'));
}
const main = read('src/app/api/operator/analytics/route.ts'), lib = read('src/lib/analytics-page.ts'), sales = read('src/app/api/operator/money/sales/route.ts');
ok('Analytics returns the ledger headline', main.includes('ledgerHeadline(session.courseId, range)') && /compare, ledger \}/.test(main));
ok('the ledger headline is the Revenue page\'s own function, called the same way', /allSegments\(courseId, c\.tz, range, prev, now\)/.test(lib) && /allSegments\(session\.courseId, tz, a\.range, previousRange\(a\.range\)\)/.test(sales));
ok('lib/analytics-page never sums money from lib/analytics.ts', !/computeAnalytics/.test(lib));
ok('shop stock cost only for the owner', /stockValue\(session\.courseId, \{ cost: !session\.isStaff \}\)/.test(read('src/app/api/operator/analytics/shop/route.ts')));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
