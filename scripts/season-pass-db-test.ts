// Memberships item 4 (Cam 2026-11-16): season passes — "a membership kind with fixed start/end dates (every pass ends
// on the end date), buy online and/or at the course, rates per price-list line, and the 1% fee golfers pay on top."
// The rules (lib/season-pass), and the money through the ledger against a real database.
// Run: npx tsx scripts/season-pass-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { termOf, paidTermDates, passOnSale, readPassDates, ledgerWhat, passStart, termRunning, isDay } from '../src/lib/season-pass';
import { amountsDue, markDuesPaidAtCourse, recordPaidTerm } from '../src/lib/membership-dues';
import { paidUntilRenewal } from '../src/lib/membership-renewal';
import { duesThisYear } from '../src/lib/dues-year';
import { splitOf } from '../src/lib/revenue-extras';
import { revenueSource } from '../src/lib/finance-period';
import { joinTier, joinableTiers } from '../src/lib/membership-join';
import { todayIn, addDaysStr } from '../src/lib/course-time';
const TAG = 'spass4';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
const src = (f: string) => readFileSync(f, 'utf8');

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.golferAccount.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  // ── 1. The rules ──
  const passTier = { kind: 'pass', termMonths: 12, passStartsOn: '2026-04-01', passEndsOn: '2026-10-31' };
  const term = termOf(passTier);
  ok('a pass tier\'s term is its season; a membership\'s is months', term.kind === 'pass' && term.endsOn === '2026-10-31' && termOf({ ...passTier, kind: 'membership' }).kind === 'months' && termOf(null).kind === 'months');
  const bought = paidTermDates(term, new Date('2026-06-15T15:00:00Z'));
  ok('every pass ends on the end date, whenever it is bought', bought.expiresAt.toISOString() === '2026-10-31T00:00:00.000Z' && bought.passStartsOn === '2026-04-01' && paidTermDates(term, new Date('2026-03-01T00:00:00Z')).expiresAt.toISOString() === '2026-10-31T00:00:00.000Z');
  ok('…a months term still counts from its base and has no pass day', paidTermDates({ kind: 'months', months: 12 }, new Date('2026-06-15T00:00:00Z')).expiresAt.toISOString().startsWith('2027-06-15') && paidTermDates({ kind: 'months', months: 12 }, new Date()).passStartsOn === null);
  ok('a pass is on sale through its last day, not after', passOnSale(term, '2026-03-01') && passOnSale(term, '2026-10-31') && !passOnSale(term, '2026-11-01'));
  ok('…and never without both dates', !passOnSale(termOf({ ...passTier, passEndsOn: null }), '2026-05-01'));
  ok('the season\'s dates are real days, start on or before end', readPassDates('2026-04-01', '2026-10-31').ok && !readPassDates('2026-10-31', '2026-04-01').ok && !readPassDates('2026-02-30', '2026-10-31').ok && !readPassDates('', '2026-10-31').ok && !readPassDates('2026-01-01', '2030-01-01').ok);
  ok('isDay is strict YYYY-MM-DD', isDay('2026-04-01') && !isDay('2026-4-1') && !isDay('2026-04-01T00:00') && !isDay(20260401));
  const due = amountsDue({ lastPaidAt: null, initiationWaived: false, tier: { annualFeeCents: 60000, initiationFeeCents: 25000, kind: 'pass' } });
  ok('a pass has no initiation fee; GreenReserve\'s 1% rides on top', due.initiationCents === 0 && due.duesCents === 60000 && due.feeCents === 600 && due.totalCents === 60600, due);
  ok('…a membership still owes its initiation', amountsDue({ lastPaidAt: null, initiationWaived: false, tier: { annualFeeCents: 60000, initiationFeeCents: 25000, kind: 'membership' } }).initiationCents === 25000);
  ok('pass money is \'pass\' on the ledger, dues are \'dues\'', ledgerWhat(passTier) === 'pass' && ledgerWhat({ kind: 'membership' }) === 'dues' && ledgerWhat(null) === 'dues');
  ok('a free pass runs its season at once; one that costs waits for payment', passStart(passTier, false).status === 'active' && passStart(passTier, false).paymentStatus === 'comped' && passStart(passTier, false).expiresAt?.toISOString() === '2026-10-31T00:00:00.000Z' && passStart(passTier, true).status === 'awaiting_payment' && passStart(passTier, true).passStartsOn === null);
  ok('a paid term runs until its end date; unpaid never blocks a move', termRunning({ paymentStatus: 'paid', expiresAt: new Date('2026-10-31T00:00:00Z') }, '2026-10-31') && !termRunning({ paymentStatus: 'paid', expiresAt: new Date('2026-10-31T00:00:00Z') }, '2026-11-01') && !termRunning({ paymentStatus: 'unpaid', expiresAt: null }, '2026-05-01') && termRunning({ paymentStatus: 'comped', expiresAt: null }, '2026-05-01'));
  ok('a paid pass is never payable again', paidUntilRenewal({ paymentStatus: 'paid_offline', expiresAt: new Date('2020-01-01'), lastPaidAt: new Date('2019-01-01') }, term));
  ok('Revenue: a pass payment is the Season passes line', splitOf({ what: 'pass', direction: 'in', amountCents: 60600, platformFeeCents: 600 } as Parameters<typeof splitOf>[0], undefined, undefined).passesCents === 60000);
  ok('GreenReserve\'s side: the 1% on a pass is the membership fee', revenueSource('pass') === 'membershipDues' && revenueSource('dues') === 'membershipDues');

  // ── 2. Source pins: every path that takes membership money knows passes ──
  const reader = src('src/lib/dues-reader.ts'), card = src('src/lib/dues-payment.ts'), course = src('src/lib/membership-dues.ts');
  ok('card reader, typed card and cash record the tier\'s ledger kind', /what: ledgerWhat\(m\.tier\)/.test(reader) && /what: ledgerWhat\(m\.tier\)/.test(card) && /const what = ledgerWhat\(membership\.tier\)/.test(course));
  ok('…and refuse a pass that has ended', /passOnSale\(term, todayIn\(full\.course\.timezone\)\)/.test(reader) && /passOnSale\(term, todayIn\(m\.course\.timezone\)\)/.test(card) && /passOnSale\(term, todayIn\(membership\.course\.timezone, now\)\)/.test(course));
  ok('a pass never renews automatically (tier, pay link, renewal crons)', /autoRenew: !isPass &&/.test(src('src/app/api/operator/tiers/route.ts')) && /!isPassTier\(m\.tier\)/.test(card) && (src('src/lib/membership-autorenew.ts').match(/kind: 'membership'/g) ?? []).length >= 2);
  ok('the close-out counts pass cash in the drawer', /what: \{ in: \['dues', 'pass', 'event', 'account'\] \}/.test(src('src/lib/register-close.ts')));
  ok('dues this year and the member\'s payments read passes too', /MEMBERSHIP_WHATS/.test(src('src/lib/dues-year.ts')) && /MEMBERSHIP_WHATS/.test(src('src/app/api/member/[courseSlug]/payments/route.ts')));
  ok('an ended pass is never reminded as overdue', /passStartsOn: null,/.test(src('src/app/api/operator/members/remind-overdue/route.ts')));

  // ── 3. Against the database ──
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Pass GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'America/New_York' } });
  const today = todayIn(c.timezone);
  const season = { passStartsOn: addDaysStr(today, -30), passEndsOn: addDaysStr(today, 60) };
  const pass = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Season Pass', kind: 'pass', ...season, annualFeeCents: 60000, initiationFeeCents: 0, joinOnline: 'instant' } });
  const over = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Last Season', kind: 'pass', passStartsOn: addDaysStr(today, -200), passEndsOn: addDaysStr(today, -1), annualFeeCents: 50000, joinOnline: 'instant' } });
  const full = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', annualFeeCents: 120000, joinOnline: 'instant' } });
  let n = 0;
  const add = (tierId: string, extra: object = {}) => prisma.courseMembership.create({ data: { courseId: c.id, tierId, inviteEmail: `${TAG}+${n++}@t.local`, inviteName: 'M', status: 'awaiting_payment', ...extra } });

  const m1 = await add(pass.id);
  const r1 = await markDuesPaidAtCourse(c.id, m1.id, { method: 'cash' });
  const after1 = await prisma.courseMembership.findUniqueOrThrow({ where: { id: m1.id } });
  ok('cash for a pass: active, paid, ends on the end date, starts on the first day', r1.ok && after1.status === 'active' && after1.paymentStatus === 'paid_offline' && after1.expiresAt?.toISOString().slice(0, 10) === season.passEndsOn && after1.passStartsOn === season.passStartsOn, { r1, after1: { s: after1.status, e: after1.expiresAt, p: after1.passStartsOn } });
  const moves1 = await prisma.moneyMove.findMany({ where: { courseId: c.id, membershipId: m1.id } });
  ok('…one ledger row, \'pass\', the price in cash (no 1% on cash)', moves1.length === 1 && moves1[0].what === 'pass' && moves1[0].method === 'cash' && moves1[0].amountCents === 60000 && moves1[0].platformFeeCents === 0, moves1);
  const again = await markDuesPaidAtCourse(c.id, m1.id, { method: 'cash' });
  ok('…and it can\'t be paid twice', !again.ok && again.status === 409 && (await prisma.moneyMove.count({ where: { membershipId: m1.id } })) === 1);

  const m2 = await add(over.id);
  const r2 = await markDuesPaidAtCourse(c.id, m2.id, { method: 'cash' });
  ok('a pass past its end date can\'t be bought at the course', !r2.ok && r2.status === 409 && (await prisma.moneyMove.count({ where: { membershipId: m2.id } })) === 0);

  // A card payment recorded as the paths record it (the Stripe call itself is lib/stripe's): 'pass' with the 1% as GreenReserve's.
  const m3 = await add(pass.id);
  await prisma.moneyMove.create({ data: { courseId: c.id, what: ledgerWhat(pass), direction: 'in', method: 'card', account: 'course', amountCents: 60600, platformFeeCents: 600, stripeId: `${TAG}-pi-3`, membershipId: m3.id } });
  const rec = await recordPaidTerm({ id: m3.id, startedAt: null, term: termOf(pass) }, { lastPaidAt: null, expiresAt: null }, `${TAG}-pi-3`);
  const after3 = await prisma.courseMembership.findUniqueOrThrow({ where: { id: m3.id } });
  ok('a card payment records the same season', rec && after3.expiresAt?.toISOString().slice(0, 10) === season.passEndsOn && after3.passStartsOn === season.passStartsOn);

  // A membership paid on a row that was a pass sheds the pass's first day.
  const m4 = await add(full.id, { passStartsOn: '2020-01-01', expiresAt: new Date('2020-06-01T00:00:00Z'), lastPaidAt: new Date('2020-01-01T00:00:00Z') });
  await markDuesPaidAtCourse(c.id, m4.id, { method: 'check' });
  const after4 = await prisma.courseMembership.findUniqueOrThrow({ where: { id: m4.id } });
  const moves4 = await prisma.moneyMove.findMany({ where: { membershipId: m4.id } });
  ok('a membership term clears the pass day and is \'dues\' on the ledger', after4.passStartsOn === null && moves4.length === 1 && moves4[0].what === 'dues');

  const year = await duesThisYear(c.id, c.timezone);
  const passPart = year.byTier.find(t => t.tierId === pass.id)?.cents ?? 0;
  ok('Dues this year counts passes under their pass, what the course keeps', passPart === 60000 + 60000, year);

  // Online: offered until its last day; a golfer whose pass ended buys the next one on the same row.
  const offered = await joinableTiers(c.id);
  ok('online, a pass is offered with its dates until it ends', offered.some(t => t.id === pass.id && t.kind === 'pass' && t.passEndsOn === season.passEndsOn) && !offered.some(t => t.id === over.id));
  const g = await prisma.golferAccount.create({ data: { email: `${TAG}+g@t.local`, password: 'x', firstName: 'G', lastName: 'P' } });
  await prisma.courseMembership.create({ data: { courseId: c.id, golferId: g.id, tierId: over.id, inviteEmail: g.email, status: 'active', paymentStatus: 'paid', passStartsOn: over.passStartsOn, expiresAt: new Date(`${over.passEndsOn}T00:00:00Z`), lastPaidAt: new Date() } });
  const j = await joinTier(c.id, { id: g.id, email: g.email, name: 'G P', phone: '' }, pass.id);
  const row = await prisma.courseMembership.findUniqueOrThrow({ where: { golferId_courseId: { golferId: g.id, courseId: c.id } } });
  ok('…an ended pass doesn\'t block buying the next season online; it waits for payment with no old dates', j.ok && j.status === 'awaiting_payment' && row.tierId === pass.id && row.paymentStatus === 'unpaid' && row.passStartsOn === null && row.expiresAt === null, { j, row: { t: row.tierId, p: row.paymentStatus, s: row.passStartsOn, e: row.expiresAt } });
  const jOver = await joinTier(c.id, { id: g.id, email: g.email, name: 'G P', phone: '' }, over.id);
  ok('…and an ended pass can\'t be bought online', !jOver.ok && jOver.status === 409);

  await cleanup(); await prisma.$disconnect();
  console.log(failed ? `season-pass: ${failed} failed` : 'season-pass: all passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
