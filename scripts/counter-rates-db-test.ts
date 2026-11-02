// Revamp 3 dead end 20 (Cam 2026-10-29): walk-ins and phone bookings can be booked
// at the time's resident, senior or junior price, or a membership's; senior and
// junior prices come from the schedule (counter only — online they exist only as a
// membership). Needs a database. Run: npx tsx scripts/counter-rates-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { createCounterBooking } from '../src/lib/counter-pay';
import { generateTeeTimes } from '../src/lib/tee-sheet-engine';
import { compilePlan, emptyCell, type CoursePlan } from '../src/lib/course-plan';
import { addDaysStr, todayIn } from '../src/lib/course-time';

const TAG = 'counterratesdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  // The price grid carries senior and junior prices into the schedule rows.
  const plan: CoursePlan = { rounds: [{ key: '', on: true, from: null, to: null }], different: [],
    usual: { days: [], closed: false, first: '07:00', last: '08:00', interval: 10, changes: [], firstName: null, prices: { '': [{ ...emptyCell(), weekday: 60, weekend: 70, seniorWeekday: 40, seniorWeekend: 45, juniorWeekday: 25, juniorWeekend: 30 }] } } };
  const rows = compilePlan(plan, [{ key: '', label: '18 holes', holes: 18 }]);
  ok('the grid\'s senior and junior prices reach the schedule rows', rows[0].seniorRateWeekday === 40 && rows[0].juniorRateWeekend === 30);

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { hasMemberPricing: true, hasResidentPricing: true, name: 'Rates GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  await prisma.teeTimeSchedule.create({ data: { courseId: c.id, tierName: 'All day', daysOfWeek: [], startTime: '07:00', endTime: '08:00', intervalMinutes: 10, holes: 18,
    greenFeeWeekdayCents: 6000, greenFeeWeekendCents: 6000, cartFeeCents: 2000, seniorRateWeekdayCents: 4000, seniorRateWeekendCents: 4000, juniorRateWeekdayCents: 2500, juniorRateWeekendCents: 2500, residentRateWeekdayCents: 3500, residentRateWeekendCents: 3500 } });
  const day = addDaysStr(todayIn('UTC'), 2);
  await generateTeeTimes(c.id, day);
  const tt = await prisma.teeTime.findFirstOrThrow({ where: { courseId: c.id, date: day, time: '07:00' } });
  ok('tee times take the schedule\'s senior and junior prices', tt.seniorRateCents === 4000 && tt.juniorRateCents === 2500);

  const mk = (rate: string, players = 2, cart = false) => createCounterBooking(c.id, { teeTimeId: tt.id, golferName: `W ${rate}`, players, rate, cartSelected: cart }, STAFF);
  const senior = await mk('senior');
  ok('a walk-in at the senior price', senior.ok && senior.greenFeeTotal === 8000, senior);
  const junior = await mk('junior', 1);
  ok('…the junior price', junior.ok && junior.greenFeeTotal === 2500, junior);
  const res = await mk('resident', 1);
  const resRow = res.ok ? await prisma.booking.findUniqueOrThrow({ where: { id: res.id } }) : null;
  ok('…the resident price, recorded as residents', res.ok && res.greenFeeTotal === 3500 && resRow?.residentPlayers === 1 && resRow.appliedRate === 'resident', resRow);

  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', greenFeeWeekdayCents: 3000, greenFeeWeekendCents: 3000, cartFeeWeekdayCents: 1000, cartFeeWeekendCents: 1000 } });
  const t710 = (await prisma.teeTime.findFirstOrThrow({ where: { courseId: c.id, date: day, time: '07:10' } })).id;
  // Cam 2026-10-29: by default the member shows their membership — staff pick the member, not a tier.
  const anyTier = await createCounterBooking(c.id, { teeTimeId: t710, golferName: 'Not A Member', players: 1, rate: `tier:${tier.id}` }, STAFF);
  ok('by default a membership can\'t be picked for just anyone', !anyTier.ok && /Pick the member/.test(anyTier.error), anyTier);
  const pat = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: 'Pat Member', inviteEmail: `${TAG}+pat@t.local`, status: 'active' } });
  const mem = await createCounterBooking(c.id, { teeTimeId: t710, golferName: 'Pat Member', players: 2, rate: `member:${pat.id}`, cartSelected: true }, STAFF);
  ok('the member at the counter: their spot at the member rate, the guest at the standard one', mem.ok && mem.greenFeeTotal === 3000 + 6000 && mem.cartFeeTotal === 1000 + 2000, mem);
  const lapsed = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: 'Lee Lapsed', inviteEmail: `${TAG}+lee@t.local`, status: 'active', expiresAt: new Date(Date.now() - 30 * 86400000) } });
  const lap = await createCounterBooking(c.id, { teeTimeId: t710, golferName: 'Lee Lapsed', players: 1, rate: `member:${lapsed.id}` }, STAFF);
  ok('…a membership that has ended gets no member rate', !lap.ok && /has ended/.test(lap.error), lap);
  // The course can make it flexible.
  await prisma.course.update({ where: { id: c.id }, data: { counterMemberRate: 'any' } });
  const flex = await createCounterBooking(c.id, { teeTimeId: t710, golferName: 'Staff Call', players: 1, rate: `tier:${tier.id}` }, STAFF);
  ok('a course set to "any membership" lets staff pick one', flex.ok && flex.greenFeeTotal === 3000, flex);

  const bare = await prisma.teeTime.create({ data: { courseId: c.id, date: day, time: '09:00', holes: 18, greenFeeCents: 6000, cartFeeCents: 0, playersAvailable: 4 } });
  const none = await createCounterBooking(c.id, { teeTimeId: bare.id, golferName: 'No Senior', players: 1, rate: 'senior' }, STAFF);
  ok('a time with no senior price says so', !none.ok && /no senior price/.test(none.error), none);
  const other = await prisma.course.create({ data: { hasMemberPricing: true, hasResidentPricing: true, name: 'Other', slug: `${TAG}-b`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const otherTier = await prisma.membershipTier.create({ data: { courseId: other.id, name: 'Theirs', greenFeeWeekdayCents: 100 } });
  ok('another course\'s membership is refused', !(await mk(`tier:${otherTier.id}`)).ok);

  // Online: senior and junior never apply — no golfer route reads them.
  const book = readFileSync('src/app/api/bookings/route.ts', 'utf8');
  const lookup = readFileSync('src/app/api/operator/counter-members/route.ts', 'utf8');
  ok('the counter\'s member lookup is gated like adding a walk-in, and lists only live memberships', lookup.includes("requirePermission(session, 'sheet.walkin')") && lookup.includes('liveMembershipWhere(course)') && !/email|phone/i.test(lookup.slice(lookup.indexOf('select:'))));
  const settings = readFileSync('src/app/api/operator/settings/route.ts', 'utf8');
  ok('only the owner can change who gets a member rate at the counter', settings.includes("if (session.isStaff && 'counterMemberRate' in body)"));
  ok('online booking never reads senior or junior prices (memberships only)', !/seniorRate|juniorRate/.test(book));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('counter-rates-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
