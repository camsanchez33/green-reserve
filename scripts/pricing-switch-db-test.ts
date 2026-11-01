// Settings → Members / Residents switches (Cam 2026-11-01: "Off stops the rates", "Backfill + auto-on"):
//  1. off: no member or resident rate at the counter, on set_residents, the register or in "Who pays what";
//  2. every pricing path reads lib/pricing-switch (online booking, member portal, preview, swap, moves, check-in);
//  3. a newly set member / resident price switches it on — a rename or a re-save of the same price never does;
//  4. the backfill migration switches on exactly the courses that already had such a price.
// Needs a database. Run: npx tsx scripts/pricing-switch-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { createCounterBooking } from '../src/lib/counter-pay';
import { setBookingResidents } from '../src/lib/booking-residents';
import { registerRounds } from '../src/lib/register';
import { withPriceSwitch, switchOnWherePriced, memberPricingOn, residentPricingOn } from '../src/lib/pricing-switch';
import { whoPays, type WireSchedule, type WireTier } from '../src/lib/who-pays';
import { addDaysStr, todayIn } from '../src/lib/course-time';

const TAG = 'pricingswitchdbtest';
const STAFF = { type: 'staff' as const, id: null };
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  try {
    const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
    const mkCourse = (n: string, on = false) => prisma.course.create({ data: { name: `Switch ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', counterMemberRate: 'any', hasMemberPricing: on, hasResidentPricing: on } });
    const day = addDaysStr(todayIn('UTC'), 2);

    // 1. Off at the counter
    const c = await mkCourse('off');
    const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: day, time: '09:00', holes: 18, greenFeeCents: 6000, cartFeeCents: 0, playersAvailable: 4, residentRateCents: 3500 } });
    const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', greenFeeWeekdayCents: 3000, greenFeeWeekendCents: 3000 } });
    const res = await createCounterBooking(c.id, { teeTimeId: tt.id, golferName: 'Rae Resident', players: 1, rate: 'resident' }, STAFF);
    ok('1. residents off: the counter refuses the resident rate, saying so', !res.ok && /Resident prices are off/.test(res.error), res);
    const mem = await createCounterBooking(c.id, { teeTimeId: tt.id, golferName: 'Max Member', players: 1, rate: `tier:${tier.id}` }, STAFF);
    ok('1. members off: the counter refuses a membership rate', !mem.ok && /Member prices are off/.test(mem.error), mem);
    const std = await createCounterBooking(c.id, { teeTimeId: tt.id, golferName: 'Sam Standard', players: 2, rate: 'standard' }, STAFF);
    ok('1. the standard rate still books', std.ok && std.greenFeeTotal === 12000, std);
    if (std.ok) {
      const on = await setBookingResidents(c.id, std.id, 1, STAFF);
      ok('1. residents off: set_residents refuses adding a resident', !on.ok && /off in Settings/.test(on.error), on);
    }
    const reg = await registerRounds(c.id, day, '00:00');
    ok('1. the register offers no resident price when off', reg.open.length > 0 && reg.open.every(o => o.rates.resident === null), reg.open[0]?.rates);
    const sched: WireSchedule[] = [{ id: 's', tierName: 'All', active: true, startTime: '07:00', endTime: '18:00', daysOfWeek: [], greenFeeWeekday: 60, greenFeeWeekend: 60, cartFee: 0, memberRateWeekday: null, memberRateWeekend: null, residentRateWeekday: 35, residentRateWeekend: 35 }];
    const tiers: WireTier[] = [{ id: 't', name: 'Full', active: true, greenFeeWeekday: 30, greenFeeWeekend: 30, cartFeeWeekday: null, cartFeeWeekend: null, discountPct: null }];
    ok('1. "Who pays what" with both off: the public row only', whoPays(sched, tiers, { membersOn: false, residentsOn: false }).rows.map(r => r.key).join() === 'public');
    ok('1. …and with both on, residents and the membership', whoPays(sched, tiers, { membersOn: true, residentsOn: true }).rows.map(r => r.key).join() === 'public,resident,tier:t');
    ok('1. the helpers read the flags', memberPricingOn({ hasMemberPricing: true }) && !memberPricingOn({ hasMemberPricing: false }) && !residentPricingOn(null));

    // 2. Every pricing path reads the switch
    const paths: [string, string[]][] = [
      ['src/app/api/bookings/route.ts', ['membership?.tier && memberPricingOn(teeTimeFull.course)', "live && membership!.tier && memberPricingOn(teeTimeFull.course)", 'residentPricingOn(teeTimeFull.course)']],
      ['src/app/api/member/[courseSlug]/tee-times/route.ts', ['live && memberPricingOn(course) ? tier : null', '!pricingTier && residentPricingOn(course)']],
      ['src/app/api/bookings/resident-rate/route.ts', ['if (!memberPricingOn(tt.course)) tier = null;', '!residentPricingOn(tt.course)', 'hasMemberPricing: true, hasResidentPricing: true']],
      ['src/app/api/manage/[bookingId]/swap-time/route.ts', ['residentPricingOn(switches)']],
      ['src/lib/move-booking.ts', ["opts.pricing !== 'keep' && !memberPricingOn(b.course)", "opts.pricing !== 'keep' && !residentPricingOn(b.course) ? 0"]],
      ['src/lib/checkin-booking.ts', ['m?.tier && memberPricingOn(grace)']],
      ['src/app/api/operator/counter-members/route.ts', ['membersOn && q.length >= 2', 'membersOn && mode === \'any\'', 'residentsOn: residentPricingOn(course)']],
      ['src/app/dashboard/page.tsx', ['resident: switches.residentsOn ? slot.residentRateCents : null', "...(switches.membersOn ? [['member', 'Member']] : [])"]],
    ];
    for (const [file, needles] of paths) { const src = read(file); ok(`2. ${file} reads the switch`, needles.every(n => src.includes(n)), needles.filter(n => !src.includes(n))); }
    for (const [file, call] of [['src/app/api/operator/tiers/route.ts', 2], ['src/app/api/operator/schedule/route.ts', 4], ['src/app/api/admin/schedule/route.ts', 2]] as const) {
      ok(`3. ${file} wraps its price writes (${call})`, (read(file).match(/withPriceSwitch\(/g) ?? []).length === call);
    }

    // 3. Auto-on
    const a = await mkCourse('auto');
    const flags = async () => prisma.course.findUniqueOrThrow({ where: { id: a.id }, select: { hasMemberPricing: true, hasResidentPricing: true } });
    const t1 = await withPriceSwitch(a.id, () => prisma.membershipTier.create({ data: { courseId: a.id, name: 'Weekday', discountPct: 20 } }));
    ok('3. a new membership with a price switches members on', (await flags()).hasMemberPricing === true);
    await prisma.course.update({ where: { id: a.id }, data: { hasMemberPricing: false } });
    await withPriceSwitch(a.id, () => prisma.membershipTier.update({ where: { id: t1.id }, data: { name: 'Weekday plus' } }));
    ok('3. renaming it leaves an owner\'s "off" alone', (await flags()).hasMemberPricing === false);
    await withPriceSwitch(a.id, () => prisma.membershipTier.update({ where: { id: t1.id }, data: { discountPct: 20 } }));
    ok('3. re-saving the same price leaves it off', (await flags()).hasMemberPricing === false);
    await withPriceSwitch(a.id, () => prisma.membershipTier.update({ where: { id: t1.id }, data: { discountPct: 25 } }));
    ok('3. a new price switches it back on', (await flags()).hasMemberPricing === true);
    ok('3. residents stayed off (no resident price yet)', (await flags()).hasResidentPricing === false);
    await withPriceSwitch(a.id, () => prisma.teeTimeSchedule.create({ data: { courseId: a.id, tierName: 'All', daysOfWeek: [], startTime: '07:00', endTime: '08:00', intervalMinutes: 10, holes: 18, greenFeeWeekdayCents: 6000, greenFeeWeekendCents: 6000, cartFeeCents: 0, residentRateWeekdayCents: 3500 } }));
    ok('3. a schedule with a resident price switches residents on', (await flags()).hasResidentPricing === true);
    // Resuming a paused schedule or membership is no new price: an owner's "off" stays off (final review).
    await prisma.course.update({ where: { id: a.id }, data: { hasMemberPricing: false, hasResidentPricing: false } });
    const paused = await prisma.teeTimeSchedule.findFirstOrThrow({ where: { courseId: a.id } });
    await prisma.teeTimeSchedule.update({ where: { id: paused.id }, data: { active: false } });
    await prisma.membershipTier.update({ where: { id: t1.id }, data: { active: false } });
    await withPriceSwitch(a.id, () => prisma.teeTimeSchedule.update({ where: { id: paused.id }, data: { active: true } }));
    await withPriceSwitch(a.id, () => prisma.membershipTier.update({ where: { id: t1.id }, data: { active: true } }));
    const resumed = await flags();
    ok('3. resuming a paused schedule or membership leaves both switches off', !resumed.hasMemberPricing && !resumed.hasResidentPricing, resumed);

    // A course being built: each switch is on when the build priced that kind.
    const built = await mkCourse('built');
    await prisma.membershipTier.create({ data: { courseId: built.id, name: 'Other pass', greenFeeWeekdayCents: 0 } });
    await prisma.teeTimeSchedule.create({ data: { courseId: built.id, tierName: 'All', daysOfWeek: [], startTime: '07:00', endTime: '08:00', intervalMinutes: 10, holes: 18, greenFeeWeekdayCents: 6000, greenFeeWeekendCents: 6000, cartFeeCents: 0, residentRateWeekdayCents: 3000 } });
    await switchOnWherePriced(built.id);
    const bf = await prisma.course.findUniqueOrThrow({ where: { id: built.id }, select: { hasMemberPricing: true, hasResidentPricing: true } });
    ok('3. a build that wrote a $0 member rate and a resident rate switches both on', bf.hasMemberPricing && bf.hasResidentPricing, bf);
    ok('3. both admin build paths call it', read('src/app/api/admin/inquiries/route.ts').includes('await switchOnWherePriced(builtCourseId)') && read('src/app/api/admin/create-course/route.ts').includes('await switchOnWherePriced(courseId)'));

    // 4. The backfill migration
    const priced = await mkCourse('priced');
    await prisma.membershipTier.create({ data: { courseId: priced.id, name: 'Full', greenFeeWeekdayCents: 3000 } });
    await prisma.teeTimeSchedule.create({ data: { courseId: priced.id, tierName: 'All', daysOfWeek: [], startTime: '07:00', endTime: '08:00', intervalMinutes: 10, holes: 18, greenFeeWeekdayCents: 6000, greenFeeWeekendCents: 6000, cartFeeCents: 0, residentRateWeekendCents: 3500 } });
    const bare = await mkCourse('bare');
    await prisma.membershipTier.create({ data: { courseId: bare.id, name: 'Dues only' } });
    await prisma.membershipTier.create({ data: { courseId: bare.id, name: 'Old', active: false, discountPct: 10 } });
    const sql = read('prisma/migrations/20261101000000_pricing_switch_backfill/migration.sql');
    for (const stmt of sql.split(/;\s*\n/).map(s => s.replace(/--.*$/gm, '').trim()).filter(Boolean)) await prisma.$executeRawUnsafe(stmt);
    const after = await prisma.course.findMany({ where: { id: { in: [priced.id, bare.id] } }, select: { id: true, hasMemberPricing: true, hasResidentPricing: true } });
    const p = after.find(x => x.id === priced.id)!, b = after.find(x => x.id === bare.id)!;
    ok('4. a course with a member and a resident price is switched on for both', p.hasMemberPricing && p.hasResidentPricing, p);
    ok('4. a course with no price (dues-only or an inactive tier) stays off', !b.hasMemberPricing && !b.hasResidentPricing, b);
    ok('4. the migration only ever turns switches on', !/SET "has\w+" = false/.test(sql) && (sql.match(/UPDATE "Course"/g) ?? []).length === 2);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})();
