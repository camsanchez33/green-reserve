// TWO-GROUPS-PRICE (Cam 2026-11-24): a golfer who is both a member and a resident gets the LOWER own seat after
// deals, the member rate on a tie, never both (lib/two-groups pickOwnSeat). Pure. Run: npx tsx scripts/two-groups-test.ts
// The routes that use it (/api/bookings, member tee-times, resident-rate, swap-time) are pinned in two-groups-db-test.ts.
import { readFileSync } from 'fs';
import { pickOwnSeat, ratedSeat } from '../src/lib/two-groups';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};
const none = { pubSeat: 10000, dealPct: 0, publicCents: 10000, stack: false };

let r = pickOwnSeat(4000, null, none);
check('member only: the member seat', r.group === 'member' && r.seat === 4000 && r.residentSeat === null, r);
r = pickOwnSeat(null, 3000, none);
check('resident only: the resident seat', r.group === 'resident' && r.seat === 3000 && r.memberSeat === null, r);
r = pickOwnSeat(4000, 5000, none);
check('both, the member rate cheaper: member', r.group === 'member' && r.seat === 4000, r);
r = pickOwnSeat(4000, 3000, none);
check('both, the resident rate cheaper: resident', r.group === 'resident' && r.seat === 3000, r);
r = pickOwnSeat(4000, 4000, none);
check('a tie: the member rate wins', r.group === 'member' && r.seat === 4000, r);
r = pickOwnSeat(null, null, none);
check('neither: no group, the public seat', r.group === null && r.seat === null, r);
r = pickOwnSeat(10000, 3000, none);
check('a member line left blank (the public price) loses to a lower resident rate', r.group === 'resident' && r.seat === 3000, r);

// After deals: a non-stacking deal gives each rate the lower of itself and the public deal seat, so the two can tie
// after the deal though not before — the member rate then wins.
const deal = { pubSeat: 5000, dealPct: 50, publicCents: 10000, stack: false };
r = pickOwnSeat(6000, 5500, deal);
check('after a 50% deal both seats are the $50 public deal seat: a tie, member', r.group === 'member' && r.memberSeat === 5000 && r.residentSeat === 5000 && r.seat === 5000, r);
// A stacking deal comes off each rate: 50% off $60 = $30, 50% off $50 = $25 → resident.
const stacked = { ...deal, stack: true };
r = pickOwnSeat(6000, 5000, stacked);
check('a stacking deal: compared after the deal, resident cheaper', r.group === 'resident' && r.seat === 2500 && r.memberSeat === 3000, r);
// Demand pricing lowered the public seat below both rates: no seat is ever above it, and the member wins the tie.
const demand = { pubSeat: 2000, dealPct: 0, publicCents: 10000, stack: false };
r = pickOwnSeat(4000, 3000, demand);
check('never above the public seat; both capped there is a tie, member', r.group === 'member' && r.seat === 2000, r);
check('ratedSeat matches the deal rule', ratedSeat(6000, deal) === 5000 && ratedSeat(6000, stacked) === 3000 && ratedSeat(4000, none) === 4000);

// One function, every path: the four callers import it and none keeps its own member-vs-resident choice.
const src = (p: string) => readFileSync(p, 'utf8');
for (const p of ['src/app/api/bookings/route.ts', 'src/app/api/member/[courseSlug]/tee-times/route.ts', 'src/app/api/bookings/resident-rate/route.ts', 'src/lib/move-booking.ts']) {
  check(`${p} prices the own seat with pickOwnSeat`, /import \{[^}]*pickOwnSeat[^}]*\} from '(@\/lib|\.)\/two-groups'/.test(src(p)) && src(p).includes('pickOwnSeat('));
}
check('the swap route passes the golfer\'s proven groups', src('src/app/api/manage/[bookingId]/swap-time/route.ts').includes('ownSeatGroups'));
check('bookings no longer skips the resident lookup for a member', !src('src/app/api/bookings/route.ts').includes("appliedTierName === 'standard' && teeTimeFull.residentRateCents"));
check('the member list no longer drops the resident seat for any member', !src('src/app/api/member/[courseSlug]/tee-times/route.ts').includes('const resident = !pricingTier ? residentCard : null'));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
