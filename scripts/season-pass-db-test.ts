// Memberships item 4 (Cam 2026-11-16): season passes — "a membership kind with fixed start/end dates (every pass ends
// on the end date), buy online and/or at the course, rates per price-list line, and the 1% fee golfers pay on top."
// The rules (lib/season-pass), and the money through the ledger against a real database.
// Run: npx tsx scripts/season-pass-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { termOf, paidTermDates, passOnSale, readPassDates, ledgerWhat, passStart, termRunning, isDay, passMemberChange, passSeasonMoveError } from '../src/lib/season-pass';
import { amountsDue, markDuesPaidAtCourse, recordPaidTerm, paidOnlyPasses } from '../src/lib/membership-dues';
import { importMembers } from '../src/lib/member-import';
import { paidUntilRenewal } from '../src/lib/membership-renewal';
import { duesThisYear } from '../src/lib/dues-year';
import { splitOf } from '../src/lib/revenue-extras';
import { revenueSource } from '../src/lib/finance-period';
import { joinTier, joinableTiers, passEnded } from '../src/lib/membership-join';
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

  // Staff edits (members PATCH, tiers PATCH): the pass rules.
  const run = { status: 'active', paymentStatus: 'paid', expiresAt: new Date('2026-10-31T00:00:00Z'), passStartsOn: '2026-04-01', onPassTier: true, paying: false, onlyPassesPaid: true };
  const membershipTier = { kind: 'membership', termMonths: 12, passStartsOn: null, passEndsOn: null, sellAtCourse: true };
  const pass27 = { kind: 'pass', termMonths: 12, passStartsOn: '2027-04-01', passEndsOn: '2027-10-31', sellAtCourse: true };
  const base = { expiresAt: undefined, status: undefined, move: null, stay: { isPass: true, owes: true }, today: '2026-06-01' };
  const r = (o: Partial<Parameters<typeof passMemberChange>[0]>) => passMemberChange({ ...base, membership: run, ...o });
  const typed = r({ expiresAt: new Date('2026-12-31T00:00:00Z') });
  ok('staff can\'t type a pass\'s end date (sending the same one is fine)', !typed.ok && typed.status === 409 && r({ expiresAt: new Date('2026-10-31T00:00:00Z') }).ok);
  const unpaid = { ...run, status: 'awaiting_payment', paymentStatus: 'unpaid', passStartsOn: null, expiresAt: null };
  ok('…nor switch an unpaid pass on by hand; a free one may be', !r({ membership: unpaid, status: 'active' }).ok && r({ membership: unpaid, status: 'active', stay: { isPass: true, owes: false } }).ok);
  ok('…nor move a running pass, or a running membership onto a pass', !r({ move: { tier: membershipTier, owes: true } }).ok && !r({ membership: { ...run, onPassTier: false, passStartsOn: null }, move: { tier: pass27, owes: true }, today: '2026-06-01' }).ok);
  const ended = { ...run, expiresAt: new Date('2026-10-31T00:00:00Z') };
  const toPass = r({ membership: ended, move: { tier: pass27, owes: true }, today: '2026-11-05' });
  ok('an ended pass moves onto next season\'s pass, unpaid and waiting', toPass.ok && toPass.data.status === 'awaiting_payment' && toPass.data.paymentStatus === 'unpaid' && toPass.data.passStartsOn === null);
  const toMember = r({ membership: ended, move: { tier: membershipTier, owes: true }, today: '2026-11-05' });
  ok('…or onto a membership, whose initiation is then owed (the pass wasn\'t membership dues)', toMember.ok && toMember.data.lastPaidAt === null && toMember.data.status === 'awaiting_payment');
  const backHome = r({ membership: { ...ended, onlyPassesPaid: false }, move: { tier: membershipTier, owes: true }, today: '2026-11-05' });
  ok('…but a member who paid membership dues before keeps their waived initiation', backHome.ok && !('lastPaidAt' in backHome.data));
  const orphan = r({ membership: { ...unpaid, onPassTier: false, status: 'cancelled' }, move: { tier: membershipTier, owes: true }, today: '2026-11-05' });
  ok('…and a row that only ever paid for passes owes the initiation whatever tier it is on now (an unpaid pass, an archived one)', orphan.ok && orphan.data.lastPaidAt === null);
  ok('…and never while a payment is going through', !r({ membership: { ...ended, paying: true }, move: { tier: pass27, owes: true }, today: '2026-11-05' }).ok);
  ok('a sold pass\'s season can be adjusted, not replaced by next season', passSeasonMoveError({ passEndsOn: '2026-10-31' }, '2026-04-15', true) === null && !!passSeasonMoveError({ passEndsOn: '2026-10-31' }, '2027-04-01', true) && passSeasonMoveError({ passEndsOn: '2026-10-31' }, '2027-04-01', false) === null);
  ok('an ended pass isn\'t "a member here"', passEnded({ status: 'active', passStartsOn: '2026-04-01', expiresAt: new Date('2026-10-31T00:00:00Z') }, '2026-11-01') && !passEnded({ status: 'active', passStartsOn: '2026-04-01', expiresAt: new Date('2026-10-31T00:00:00Z') }, '2026-10-31') && !passEnded({ status: 'active', passStartsOn: null, expiresAt: new Date('2020-01-01') }, '2026-11-01'));

  // ── 2. Source pins: every path that takes membership money knows passes ──
  const reader = src('src/lib/dues-reader.ts'), card = src('src/lib/dues-payment.ts'), course = src('src/lib/membership-dues.ts');
  ok('card reader, typed card and cash record the tier\'s ledger kind', /what: ledgerWhat\(m\.tier\)/.test(reader) && /what: ledgerWhat\(m\.tier\)/.test(card) && /const what = ledgerWhat\(membership\.tier\)/.test(course));
  ok('…and refuse a pass that has ended', /passOnSale\(term, todayIn\(full\.course\.timezone\)\)/.test(reader) && /passOnSale\(term, todayIn\(m\.course\.timezone\)\)/.test(card) && /passOnSale\(term, todayIn\(membership\.course\.timezone, now\)\)/.test(course));
  ok('a pass never renews automatically (tier, pay link, renewal crons)', /autoRenew: !isPass &&/.test(src('src/app/api/operator/tiers/route.ts')) && /!isPassTier\(m\.tier\)/.test(card) && (src('src/lib/membership-autorenew.ts').match(/kind: 'membership'/g) ?? []).length >= 2);
  ok('the close-out counts pass cash in the drawer', /what: \{ in: \['dues', 'pass', 'event', 'account'\] \}/.test(src('src/lib/register-close.ts')));
  ok('dues this year and the member\'s payments read passes too', /MEMBERSHIP_WHATS/.test(src('src/lib/dues-year.ts')) && /MEMBERSHIP_WHATS/.test(src('src/app/api/member/[courseSlug]/payments/route.ts')));
  ok('an ended pass is never reminded as overdue', /passStartsOn: null,/.test(src('src/app/api/operator/members/remind-overdue/route.ts')));
  ok('the routes use the tested rules, and the join list hides an ended pass', /passMemberChange\(\{/.test(src('src/app/api/operator/members/route.ts')) && /passSeasonMoveError\(tier, d\.startsOn, sold\)/.test(src('src/app/api/operator/tiers/route.ts')) && /!passEnded\(found, todayIn\(course\.timezone\)\)/.test(src('src/app/api/courses/[slug]/join/route.ts')));
  ok('resident-rate prices the golfer\'s pass on the tee time\'s day, as booking does', /getGolferMembership\(tt\.courseId, grace, tt\.date\)/.test(src('src/app/api/bookings/resident-rate/route.ts')) && /membershipLive\(m, grace, new Date\(\), tt\.date\) \? m\.tier/.test(src('src/app/api/bookings/resident-rate/route.ts')));

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

  // An ended pass staff added by email (no account linked): buying online reuses that row, never a second membership;
  // moving on to a membership, its initiation is owed.
  const fullInit = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full Init', annualFeeCents: 120000, initiationFeeCents: 200000, joinOnline: 'instant' } });
  const h = await prisma.golferAccount.create({ data: { email: `${TAG}+h@t.local`, password: 'x', firstName: 'H', lastName: 'P' } });
  const invite = await prisma.courseMembership.create({ data: { courseId: c.id, golferId: null, tierId: over.id, inviteEmail: h.email, status: 'active', paymentStatus: 'paid_offline', passStartsOn: over.passStartsOn, expiresAt: new Date(`${over.passEndsOn}T00:00:00Z`), lastPaidAt: new Date() } });
  await prisma.moneyMove.create({ data: { courseId: c.id, what: 'pass', direction: 'in', method: 'cash', account: 'course', amountCents: 50000, membershipId: invite.id } });
  const jh = await joinTier(c.id, { id: h.id, email: h.email, name: 'H P', phone: '' }, fullInit.id);
  const rows = await prisma.courseMembership.findMany({ where: { courseId: c.id, OR: [{ golferId: h.id }, { inviteEmail: h.email }] }, include: { tier: true } });
  ok('…an ended invite-row pass is reused and linked (one membership)', jh.ok && rows.length === 1 && rows[0].id === invite.id && rows[0].golferId === h.id, rows.map(x => x.id));
  ok('…and the membership\'s initiation is owed after a pass', !!rows[0] && amountsDue(rows[0]).initiationCents === 200000, rows[0] && amountsDue(rows[0]));

  // The re-review's sequence: a paid pass ends; the golfer joins next season's pass online (unpaid), staff drop it, then
  // they join a membership online — the initiation is still owed (the ledger shows only a pass was ever paid).
  const k = await prisma.golferAccount.create({ data: { email: `${TAG}+k@t.local`, password: 'x', firstName: 'K', lastName: 'P' } });
  const kRow = await prisma.courseMembership.create({ data: { courseId: c.id, golferId: k.id, tierId: over.id, inviteEmail: k.email, status: 'active', paymentStatus: 'paid', passStartsOn: over.passStartsOn, expiresAt: new Date(`${over.passEndsOn}T00:00:00Z`), lastPaidAt: new Date() } });
  await prisma.moneyMove.create({ data: { courseId: c.id, what: 'pass', direction: 'in', method: 'card', account: 'course', amountCents: 5050, platformFeeCents: 50, membershipId: kRow.id, stripeId: `${TAG}-k-pass` } });
  const k1 = await joinTier(c.id, { id: k.id, email: k.email, name: 'K P', phone: '' }, pass.id);
  await prisma.courseMembership.update({ where: { id: kRow.id }, data: { status: 'cancelled' } });
  const k2 = await joinTier(c.id, { id: k.id, email: k.email, name: 'K P', phone: '' }, fullInit.id);
  const kAfter = await prisma.courseMembership.findUniqueOrThrow({ where: { id: kRow.id }, include: { tier: true } });
  ok('…an unpaid pass in between doesn\'t hide it: the membership\'s initiation is owed', k1.ok && k2.ok && kAfter.tierId === fullInit.id && amountsDue(kAfter).initiationCents === 200000, amountsDue(kAfter));
  // A former member (membership dues on the ledger) back from a pass season keeps their waived initiation.
  const mRow = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: over.id, inviteEmail: `${TAG}+m@t.local`, status: 'cancelled', paymentStatus: 'paid', passStartsOn: over.passStartsOn, expiresAt: new Date(`${over.passEndsOn}T00:00:00Z`), lastPaidAt: new Date('2025-01-01') } });
  await prisma.moneyMove.create({ data: { courseId: c.id, what: 'dues', direction: 'in', method: 'cash', account: 'course', amountCents: 120000, membershipId: mRow.id, at: new Date('2025-01-01') } });
  await prisma.moneyMove.create({ data: { courseId: c.id, what: 'pass', direction: 'in', method: 'cash', account: 'course', amountCents: 50000, membershipId: mRow.id } });
  ok('…while a former member back from a pass season isn\'t charged initiation again', !(await paidOnlyPasses(mRow.id, c.id)) && (await paidOnlyPasses(kRow.id, c.id)));

  // Import onto a pass: paid runs its season; unpaid waits for payment.
  const imp = await importMembers(c.id, [{ line: 2, email: `${TAG}+i1@t.local`, name: 'I One', tier: 'Season Pass', paid: true }, { line: 3, email: `${TAG}+i2@t.local`, name: 'I Two', tier: 'Season Pass', paid: false }] as Parameters<typeof importMembers>[1], { defaultTierId: pass.id, paidByDefault: false, addedBy: 'import' });
  const i1 = await prisma.courseMembership.findFirst({ where: { courseId: c.id, inviteEmail: `${TAG}+i1@t.local` } });
  const i2 = await prisma.courseMembership.findFirst({ where: { courseId: c.id, inviteEmail: `${TAG}+i2@t.local` } });
  ok('import onto a pass: paid runs its season, unpaid waits for payment', !('error' in imp) && imp.added === 2 && i1?.status === 'active' && i1.passStartsOn === season.passStartsOn && i1.expiresAt?.toISOString().slice(0, 10) === season.passEndsOn && i2?.status === 'awaiting_payment' && i2.passStartsOn === null && i2.expiresAt === null, { imp, i1, i2 });

  await cleanup(); await prisma.$disconnect();
  console.log(failed ? `season-pass: ${failed} failed` : 'season-pass: all passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
