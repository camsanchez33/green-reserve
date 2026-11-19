// A longer booking window gets its tee times at once (Build 2026-11-19, lib/window-generation), not at the 03:00-UTC
// nightly run: only when the horizon grew, only for that course, never for a course with no active schedule (its
// hand-added times survive), only the new days (from one before the old end, never a day already gone), far end first,
// inside a 120 s budget. The routes that can lengthen a window call the one helper inside after().
// Run: npx tsx scripts/window-generation-db-test.ts (needs DATABASE_URL)
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { regenerateUpcoming } from '../src/lib/tee-sheet-engine';
import { generateForLongerWindow, windowHorizonDays, WINDOW_GENERATION_BUDGET_MS, OPERATOR_WINDOW_FIELDS, ADMIN_WINDOW_FIELDS, touchesWindow, tierWindowChange } from '../src/lib/window-generation';
import { withPriceSwitch } from '../src/lib/pricing-switch';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const TAG = 'wingen';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || i === '' ? '' : ' — ' + JSON.stringify(i)}`); if (!c) failed++; };

// Static: every caller goes through the one helper, inside after(), and reads the horizon before its write.
const src = (p: string) => readFileSync(p, 'utf8');
for (const p of ['src/app/api/operator/settings/route.ts', 'src/app/api/operator/tiers/route.ts', 'src/app/api/admin/course-settings/route.ts']) {
  const s = src(p);
  const calls = s.match(/generateForLongerWindow\(/g)?.length ?? 0;
  const inAfter = s.match(/after\(\(\) => generateForLongerWindow\(/g)?.length ?? 0;
  ok(`${p}: calls the helper only inside after()`, calls > 0 && calls === inAfter, { calls, inAfter });
  ok(`${p}: reads the horizon before the write`, s.includes('await windowHorizonDays('));
  ok(`${p}: allows the function time for the 120 s budget`, /export const maxDuration = (1[3-9]\d|[2-9]\d\d)/.test(s));
}
ok('the budget is 120 s', WINDOW_GENERATION_BUDGET_MS === 120_000);
// Which saves count as a window change.
ok('operator Settings: public, member and resident windows, and the Resident pricing switch', ['publicAdvanceDays', 'memberAdvanceDays', 'residentAdvanceDays', 'hasResidentPricing'].every(k => touchesWindow(OPERATOR_WINDOW_FIELDS, { [k]: 1 })) && !touchesWindow(OPERATOR_WINDOW_FIELDS, { name: 'x' }));
ok('admin editor: public and member windows and the Resident pricing switch (it cannot write the resident window)', ['publicAdvanceDays', 'memberAdvanceDays', 'hasResidentPricing'].every(k => touchesWindow(ADMIN_WINDOW_FIELDS, { [k]: 1 })) && !touchesWindow(ADMIN_WINDOW_FIELDS, { name: 'x' }));
ok('a membership edit: its days or the public-window switch', tierWindowChange({ advanceBookingDays: 30 }) && tierWindowChange({ windowPublic: false }) && !tierWindowChange({ name: 'x' }));
ok('the routes use those lists', src('src/app/api/operator/settings/route.ts').includes('touchesWindow(OPERATOR_WINDOW_FIELDS, data)') && src('src/app/api/admin/course-settings/route.ts').includes('touchesWindow(ADMIN_WINDOW_FIELDS, data)') && src('src/app/api/operator/tiers/route.ts').includes('tierWindowChange(updates) ? await windowHorizonDays('));
// Schedule saves (they can switch Resident pricing on): every price-switching save goes through withPriceSwitchAndWindow.
for (const p of ['src/app/api/operator/schedule/route.ts', 'src/app/api/admin/schedule/route.ts']) {
  const s = src(p);
  ok(`${p}: every save that can switch a price on also generates a window it opens`, !s.includes('withPriceSwitch(') && (s.match(/withPriceSwitchAndWindow\(/g)?.length ?? 0) >= 2 && /export const maxDuration = 300/.test(s));
}
const lib = src('src/lib/window-generation.ts');
ok('withPriceSwitchAndWindow reads the horizon first and generates inside after()', /const before = await windowHorizonDays\(courseId\);\s*const result = await withPriceSwitch\(courseId, write\);\s*after\(\(\) => generateForLongerWindow\(courseId, before\)\);/.test(lib));

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (slug: string, tz = 'UTC') => prisma.course.create({ data: { name: slug, slug: `${TAG}-${slug}`, operatorId: op.id, address: '1', city: 'X', state: 'NY', zipCode: '1', holes: 18, timezone: tz, publicAdvanceDays: 7, memberAdvanceDays: 7 } });
  const sched = (courseId: string) => prisma.teeTimeSchedule.create({ data: { courseId, daysOfWeek: [], startTime: '08:00', endTime: '08:30', intervalMinutes: 10, greenFeeWeekdayCents: 5000, greenFeeWeekendCents: 6000 } });
  const count = (courseId: string, date?: string) => prisma.teeTime.count({ where: { courseId, ...(date ? { date } : {}) } });

  const a = await mk('a');
  const other = await mk('other');
  await sched(a.id); await sched(other.id);
  const today = todayIn('UTC');
  await regenerateUpcoming(a.id); // what the nightly run made: 8 days
  const before = await windowHorizonDays(a.id);
  ok('before: an 8-day horizon, nothing past day 7', before === 8 && (await count(a.id, addDaysStr(today, 7))) > 0 && (await count(a.id, addDaysStr(today, 8))) === 0, { before });
  const otherBefore = await count(other.id);

  // Unchanged window: nothing runs.
  const same = await generateForLongerWindow(a.id, before);
  ok('an unchanged window does nothing', !same.ran && same.reason === 'not_longer', same);

  // The public window goes to 20 days.
  await prisma.course.update({ where: { id: a.id }, data: { publicAdvanceDays: 20 } });
  const r = await generateForLongerWindow(a.id, before);
  ok('a longer window runs and finishes', r.ran && r.complete && r.failedDays === 0, r);
  ok('it makes only the new days: from one before the old end (day 7) to the window\'s last day', r.ran && r.from === addDaysStr(today, 7) && r.to === addDaysStr(today, 20) && r.days === 14, r);
  ok('the window\'s last day (today + 20) has tee times', (await count(a.id, addDaysStr(today, 20))) === 4);
  ok('every day from today to today + 20 has its 4 times', (await prisma.teeTime.groupBy({ by: ['date'], where: { courseId: a.id, date: { gte: today, lte: addDaysStr(today, 20) } }, _count: true })).every(g => g._count === 4)
    && (await prisma.teeTime.groupBy({ by: ['date'], where: { courseId: a.id, date: { gte: today, lte: addDaysStr(today, 20) } } })).length === 21);
  ok('nothing past the horizon', (await count(a.id, addDaysStr(today, 21))) === 0);
  ok('never a day already gone: nothing made before today', (await count(a.id, addDaysStr(today, -1))) === 0);
  ok('only this course: the other course is untouched', (await count(other.id)) === otherBefore);
  const again = await generateForLongerWindow(a.id, await windowHorizonDays(a.id));
  ok('saving the same window again does nothing', !again.ran && again.reason === 'not_longer', again);

  // A shorter window does nothing (and deletes nothing).
  const h21 = await windowHorizonDays(a.id);
  const totalA = await count(a.id);
  await prisma.course.update({ where: { id: a.id }, data: { publicAdvanceDays: 10 } });
  const shorter = await generateForLongerWindow(a.id, h21);
  ok('a shorter window does nothing and removes nothing', !shorter.ran && shorter.reason === 'not_longer' && (await count(a.id)) === totalA, shorter);

  // A membership with a longer window lengthens it too (the tiers route).
  const hTier = await windowHorizonDays(a.id);
  await prisma.membershipTier.create({ data: { courseId: a.id, name: 'Long', greenFeeWeekdayCents: 0, greenFeeWeekendCents: 0, cartFeeWeekdayCents: 0, cartFeeWeekendCents: 0, advanceBookingDays: 30 } });
  const t = await generateForLongerWindow(a.id, hTier);
  ok('a membership\'s 30-day window makes day 30', t.ran && (await count(a.id, addDaysStr(today, 30))) === 4, t);
  // windowPublic: the membership books only as far as the public, so the horizon does not grow from it.
  const hPub = await windowHorizonDays(a.id);
  await prisma.membershipTier.updateMany({ where: { courseId: a.id }, data: { windowPublic: true } });
  ok('a membership switched to the public window does not lengthen anything', !(await generateForLongerWindow(a.id, hPub)).ran);

  // The resident window, only with Resident pricing on.
  await prisma.membershipTier.deleteMany({ where: { courseId: a.id } });
  const hRes = await windowHorizonDays(a.id);
  await prisma.course.update({ where: { id: a.id }, data: { residentAdvanceDays: 40 } });
  ok('a resident window with Resident pricing off changes nothing', !(await generateForLongerWindow(a.id, hRes)).ran);
  await prisma.course.update({ where: { id: a.id }, data: { hasResidentPricing: true } });
  const res = await generateForLongerWindow(a.id, hRes);
  ok('turning Resident pricing on with a 40-day window makes day 40', res.ran && (await count(a.id, addDaysStr(today, 40))) === 4, res);

  // A schedule save adds a resident rate: withPriceSwitch turns Resident pricing on after the save, opening a 50-day
  // resident window already set; the schedule routes then run the helper (withPriceSwitchAndWindow, inside after()).
  await prisma.course.update({ where: { id: a.id }, data: { hasResidentPricing: false, residentAdvanceDays: 50 } });
  const hSched = await windowHorizonDays(a.id);
  await withPriceSwitch(a.id, () => prisma.teeTimeSchedule.updateMany({ where: { courseId: a.id }, data: { residentRateWeekdayCents: 2000 } }));
  const sw = await generateForLongerWindow(a.id, hSched);
  ok('a schedule save that switches Resident pricing on makes the resident window\'s days', (await prisma.course.findUnique({ where: { id: a.id } }))?.hasResidentPricing === true && sw.ran && (await count(a.id, addDaysStr(today, 50))) === 4, sw);

  // No active schedule: skipped, so hand-added times are never deleted.
  const hand = await mk('hand');
  const handTime = await prisma.teeTime.create({ data: { courseId: hand.id, date: addDaysStr(today, 3), time: '09:00', holes: 18, greenFeeCents: 4000, playersAvailable: 4, playersBooked: 0 } });
  const hHand = await windowHorizonDays(hand.id);
  await prisma.course.update({ where: { id: hand.id }, data: { publicAdvanceDays: 30 } });
  const h = await generateForLongerWindow(hand.id, hHand);
  ok('a course with no active schedule is skipped', !h.ran && h.reason === 'no_schedule', h);
  ok('its hand-added time is still there', !!(await prisma.teeTime.findUnique({ where: { id: handTime.id } })));
  // An inactive schedule counts as none.
  await prisma.teeTimeSchedule.create({ data: { courseId: hand.id, active: false, daysOfWeek: [], startTime: '08:00', endTime: '08:30', intervalMinutes: 10, greenFeeWeekdayCents: 5000, greenFeeWeekendCents: 6000 } });
  await prisma.course.update({ where: { id: hand.id }, data: { publicAdvanceDays: 7 } });
  const hHand2 = await windowHorizonDays(hand.id);
  await prisma.course.update({ where: { id: hand.id }, data: { publicAdvanceDays: 30 } });
  ok('only an inactive schedule: still skipped, hand-added time kept', (await generateForLongerWindow(hand.id, hHand2)).ran === false && !!(await prisma.teeTime.findUnique({ where: { id: handTime.id } })));

  // The budget: past it, the run stops and says so; the far end (the new days) was done first.
  const b = await mk('budget');
  await sched(b.id);
  const hB = await windowHorizonDays(b.id);
  await prisma.course.update({ where: { id: b.id }, data: { publicAdvanceDays: 60 } });
  let tick = 0;
  const clock = () => (tick++ < 4 ? 0 : WINDOW_GENERATION_BUDGET_MS + 1); // three days fit, then the budget is spent
  const br = await generateForLongerWindow(b.id, hB, { clock });
  ok('past the budget it stops without throwing and reports it', br.ran && !br.complete && br.days === 3, br);
  ok('the far end came first: days 60, 59, 58 made, 57 not', (await count(b.id, addDaysStr(today, 60))) === 4 && (await count(b.id, addDaysStr(today, 58))) === 4
    && (await count(b.id, addDaysStr(today, 57))) === 0);

  // A day already gone is never touched, even when the schedule changed since it was made.
  const past = await mk('past');
  const ps = await sched(past.id);
  await regenerateUpcoming(past.id);
  const yesterday = addDaysStr(today, -1);
  await prisma.teeTime.createMany({ data: ['08:00', '08:10'].map(time => ({ courseId: past.id, date: yesterday, time, holes: 18, greenFeeCents: 5000, playersAvailable: 4, playersBooked: 0 })) });
  await prisma.teeTimeSchedule.update({ where: { id: ps.id }, data: { greenFeeWeekdayCents: 9000, greenFeeWeekendCents: 9000, intervalMinutes: 12 } });
  const hP = await windowHorizonDays(past.id);
  await prisma.course.update({ where: { id: past.id }, data: { publicAdvanceDays: 12 } });
  await generateForLongerWindow(past.id, hP);
  const y = await prisma.teeTime.findMany({ where: { courseId: past.id, date: yesterday }, orderBy: { time: 'asc' } });
  ok('yesterday\'s open times keep their times and prices', y.length === 2 && y.every(t => t.greenFeeCents === 5000) && y.map(t => t.time).join() === '08:00,08:10', y.map(t => `${t.time}@${t.greenFeeCents}`));

  // A course west of UTC: "today" is the course's own.
  const west = await mk('west', 'America/Los_Angeles');
  await sched(west.id);
  const hW = await windowHorizonDays(west.id);
  await prisma.course.update({ where: { id: west.id }, data: { publicAdvanceDays: 9 } });
  const now = new Date(`${today}T05:00:00Z`); // 9 PM the evening before in Los Angeles
  const wr = await generateForLongerWindow(west.id, hW, { now });
  const laToday = todayIn('America/Los_Angeles', now);
  ok('a western course counts from its own today', wr.ran && wr.from === addDaysStr(laToday, 7) && wr.to === addDaysStr(laToday, 9), { wr, laToday });

  ok('an unknown course does nothing', (await generateForLongerWindow('nope', 1)).ran === false);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
