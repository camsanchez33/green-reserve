// RANGE-1 (Cam 2026-11-17/18): the course's one bucket list — pure parts (lib/range-buckets). `npx tsx scripts/range-buckets-test.ts`
import { readFileSync } from 'fs';
import { normalizeDbCourse } from '../src/lib/normalize-course';
import { onlineBuckets, applyChange, bucketWords, linesOf, linesTotal, onlineRangeOn, parseLines, priceOnline, type BucketItem } from '../src/lib/range-buckets';

let failed = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => { if (cond) console.log(`  ok  ${name}`); else { failed++; console.error(`  FAIL ${name}`, detail ?? ''); } };

const list: BucketItem[] = [
  { id: 's', name: 'Small', rangeBalls: 35, priceCents: 600, active: true },
  { id: 'l', name: 'Large', rangeBalls: 100, priceCents: 1400, active: true },
  { id: 'x', name: 'Old', rangeBalls: 50, priceCents: 900, active: false },
];

// Online: at the list price now; anything not on the list refused, never dropped.
const on = priceOnline([{ id: 's', qty: 2 }, { id: 'l', qty: 1 }, { id: 'l', qty: 0 }], list);
ok('online: 2 Small + 1 Large = $26 at the list price', on.ok && on.total === 2600 && on.lines.length === 2, on);
ok('…nothing asked is no buckets', (() => { const r = priceOnline(undefined, list); return r.ok && r.total === 0 && r.lines.length === 0; })());
const gone = priceOnline([{ id: 'x', qty: 1 }], list);
ok('…a bucket no longer sold is refused (409 range)', !gone.ok && gone.status === 409 && gone.code === 'range', gone);
ok('…an unknown id is refused', !priceOnline([{ id: 'nope', qty: 1 }], list).ok);
ok('…a fractional, negative or huge count is refused', !priceOnline([{ id: 's', qty: 1.5 }], list).ok && !priceOnline([{ id: 's', qty: -1 }], list).ok && !priceOnline([{ id: 's', qty: 21 }], list).ok);
ok('…the same bucket twice adds up, within the cap', (() => { const r = priceOnline([{ id: 's', qty: 10 }, { id: 's', qty: 10 }], list); return r.ok && r.lines[0].qty === 20; })() && !priceOnline([{ id: 's', qty: 15 }, { id: 's', qty: 6 }], list).ok);
ok('…not an array is refused', !priceOnline('s', list).ok);
ok('the switch: range on, sold online, balls not free', onlineRangeOn({ hasDrivingRange: true, sellRangeOnline: true, rangeBallsFree: false }) && !onlineRangeOn({ hasDrivingRange: true, sellRangeOnline: false, rangeBallsFree: false }) && !onlineRangeOn({ hasDrivingRange: true, sellRangeOnline: true, rangeBallsFree: true }) && !onlineRangeOn({ hasDrivingRange: false, sellRangeOnline: true, rangeBallsFree: false }));

// A booking's lines.
const snap = [{ itemId: 's', name: 'Small', balls: 35, unitCents: 500, qty: 2 }];
ok('a snapshot that adds up is read as is', linesOf({ rangeBuckets: snap, rangeBallsTotal: 1000 }).length === 1 && bucketWords({ rangeBuckets: snap, rangeBallsTotal: 1000 }) === '2 Small');
ok('…one that doesn\'t add up is read as one line at the total, never re-priced', (() => { const l = linesOf({ rangeBuckets: snap, rangeBallsTotal: 1200 }); return l.length === 1 && l[0].itemId === null && linesTotal(l) === 1200; })());
ok('an older booking ("small:2", $16) is one "as booked" line at $16', (() => { const l = linesOf({ rangeBallsSize: 'small:2', rangeBallsTotal: 1600 }); return l.length === 1 && l[0].itemId === null && l[0].unitCents === 1600 && /2 small/.test(l[0].name); })());
ok('…none at all is no lines', linesOf({ rangeBallsSize: '', rangeBallsTotal: 0 }).length === 0);
ok('a bad snapshot is not half-read', parseLines([{ itemId: 's', name: 'x', balls: 1, unitCents: -1, qty: 1 }]) === null && parseLines({}) === null);

// Checkout changes.
const keep = applyChange(snap, { s: 3 }, list, false);
ok('checkout: more of a held bucket stays at its booked $5', keep.ok && keep.total === 1500, keep);
const add = applyChange(snap, { l: 1 }, list, false);
ok('…a new bucket is at today\'s $14', add.ok && add.total === 1000 + 1400, add);
ok('…free balls: a new bucket is $0', (() => { const r = applyChange([], { l: 2 }, list, true); return r.ok && r.total === 0 && r.lines[0].qty === 2; })());
const old = [{ itemId: 'x', name: 'Old', balls: 50, unitCents: 700, qty: 1 }];
ok('…a bucket no longer sold can come off but not grow', applyChange(old, { x: 0 }, list, false).ok && !applyChange(old, { x: 2 }, list, false).ok);
const legacy = linesOf({ rangeBallsSize: 'large:1', rangeBallsTotal: 1200 });
ok('…an older booking\'s line is kept or taken off whole', !applyChange(legacy, { booked: 2 }, list, false).ok && (() => { const r = applyChange(legacy, { booked: 0 }, list, false); return r.ok && r.total === 0; })() && (() => { const r = applyChange(legacy, { booked: 1, s: 1 }, list, false); return r.ok && r.total === 1800; })());
ok('…another course\'s or an unknown bucket is refused', !applyChange([], { zz: 1 }, list, false).ok);
ok('…a bad count is refused', !applyChange([], { s: -1 }, list, false).ok && !applyChange([], { s: 21 }, list, false).ok && !applyChange([], [], list, false).ok);

// The online booking's whole range decision (POST /api/bookings calls only onlineBuckets).
const ON = { hasDrivingRange: true, sellRangeOnline: true, rangeBallsFree: false };
const ob = onlineBuckets(ON, { rangeBuckets: [{ id: 's', qty: 2 }] }, list);
ok('online: switch on → priced from the list', ob.ok && ob.total === 1200, ob);
const off = onlineBuckets({ ...ON, sellRangeOnline: false }, { rangeBuckets: [{ id: 's', qty: 1 }] }, list);
ok('…switch off: buckets asked are refused (409 range), never sold', !off.ok && off.status === 409 && off.code === 'range', off);
ok('…balls with a round or no range: refused too', !onlineBuckets({ ...ON, rangeBallsFree: true }, { rangeBuckets: [{ id: 's', qty: 1 }] }, list).ok && !onlineBuckets({ ...ON, hasDrivingRange: false }, { rangeBuckets: [{ id: 's', qty: 1 }] }, list).ok);
ok('…switch off with nothing asked (or all zero) books fine', (() => { const a = onlineBuckets({ ...ON, sellRangeOnline: false }, {}, list), b = onlineBuckets({ ...ON, sellRangeOnline: false }, { rangeBuckets: [{ id: 's', qty: 0 }] }, list); return a.ok && a.total === 0 && b.ok && b.total === 0; })());
const stale = onlineBuckets(ON, { rangeBallsSize: 'small' }, list);
ok('…a page from before the list (a size) is refused (409 stale_page)', !stale.ok && stale.code === 'stale_page' && stale.status === 409, stale);
ok('…an old page with no balls picked ("") still books', onlineBuckets(ON, { rangeBallsSize: '' }, list).ok);
ok('…a bad count with the switch off is still refused', !onlineBuckets({ ...ON, sellRangeOnline: false }, { rangeBuckets: [{ id: 's', qty: 'x' }] }, list).ok);
ok('…not an array is refused', !onlineBuckets(ON, { rangeBuckets: 's' }, list).ok);

// The public course sends the list only when it sells online.
const items = [{ id: 's', name: 'Small', rangeBalls: 35, priceCents: 600 }];
const pub = (o: Record<string, unknown>) => normalizeDbCourse({ name: 'C', slug: 'c', hasDrivingRange: true, sellRangeOnline: true, rangeBallsFree: false, rangeBucketItems: items, ...o }).range_buckets;
ok('public course: range_buckets when sold online', pub({}).length === 1 && pub({})[0].price_cents === 600 && pub({})[0].balls === 35);
ok('…none when the switch is off, balls are free, or no range', pub({ sellRangeOnline: false }).length === 0 && pub({ rangeBallsFree: true }).length === 0 && pub({ hasDrivingRange: false }).length === 0);

// Route gates (source pins — these routes read cookies, which no script fakes).
const src = (f: string) => readFileSync(f, 'utf8');
const bk = src('src/app/api/bookings/route.ts');
ok('bookings route: buckets come only from onlineBuckets over this course\'s list', /onlineBuckets\(teeTimeFull\.course,/.test(bk) && /courseBuckets\(prisma, teeTimeFull\.courseId\)/.test(bk) && !/priceOnline\(/.test(bk));
ok('…and they are in the round\'s total and stored as booked', /const totalCents\s*=\s*greenFeeTotal \+ cartFeeTotal \+ rangeBallsTotal/.test(bk) && /rangeBuckets: snapshotOf\(buckets\.lines\)/.test(bk));
const st = src('src/app/api/operator/settings/route.ts');
ok('settings route: sellRangeOnline is the owner\'s alone', /session\.isStaff && 'sellRangeOnline' in body\) return NextResponse\.json\([^)]*\{ status: 403 \}/.test(st));
const rb = src('src/app/api/operator/range-buckets/route.ts');
ok('range-buckets route: writes need shop.catalog and a current agreement', /if \(write \|\| !can\(session, 'settings\.edit'\)\) \{\s*const denied = requirePermission\(session, 'shop\.catalog'\)/.test(rb) && /requireAgreementCurrent/.test(rb) && (rb.match(/gate\(true\)/g) ?? []).length === 2);
ok('…PATCH reads only this course\'s buckets', /findFirst\(\{ where: \{ id, courseId: g\.session\.courseId, rangeBalls: \{ not: null \}/.test(rb) && /update\(\{ where: \{ id \}/.test(rb));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('range-buckets: all passed');
