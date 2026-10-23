// DASH-C search — src/lib/operator-search.ts against a database: bookings by
// name, email/phone only for logins that see golfer contact, members only with
// members.view, never another course's rows, nothing before 60 days ago.
// Needs a database. Run: npx tsx scripts/operator-search-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { operatorSearch } from '../src/lib/operator-search';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const TAG = 'opsearchdbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function seed(n: string) {
  const op = await prisma.courseOperator.create({ data: { name: n, email: `${TAG}-${n}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: n, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'T', state: 'CA', zipCode: '90210', holes: 18, timezone: 'UTC', cancellationHours: 24 } });
  const today = todayIn('UTC');
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date: today, time: '09:00', holes: 18, greenFeeCents: 5000, playersAvailable: 4 } });
  const old = await prisma.teeTime.create({ data: { courseId: course.id, date: addDaysStr(today, -90), time: '09:00', holes: 18, greenFeeCents: 5000, playersAvailable: 4 } });
  const base = { courseId: course.id, players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300 };
  await prisma.booking.create({ data: { ...base, teeTimeId: tt.id, golferName: 'Zelda Quartermain', golferEmail: 'zq@example.com', golferPhone: '555-867-5309' } });
  await prisma.booking.create({ data: { ...base, teeTimeId: old.id, golferName: 'Zelda Quartermain', golferEmail: 'zq@example.com' } });
  await prisma.courseMembership.create({ data: { courseId: course.id, inviteName: 'Zelda Quartermain', inviteEmail: 'zq@example.com' } });
  return course;
}

async function main() {
  const a = await seed('a');
  await seed('b');
  const full = await operatorSearch(a.id, 'quarterm', { contact: true, members: true });
  const bookings = full.filter(r => r.kind === 'booking');
  check('finds this course\'s booking by name', bookings.length === 1, full);
  check('…only this course (the other course has the same golfer)', full.length === 2);
  check('…and nothing older than 60 days', bookings.every(r => r.kind === 'booking' && r.date >= addDaysStr(todayIn('UTC'), -60)));
  check('a booking opens the sheet on its day, filtered to the golfer', bookings[0]?.href.startsWith('/dashboard?date=') && bookings[0]?.href.includes('q=Zelda'));
  check('members are found by name', full.some(r => r.kind === 'member'));
  check('email finds them for a login that sees contact', (await operatorSearch(a.id, 'zq@example', { contact: true, members: false })).length === 1);
  check('…but not without contact permission', (await operatorSearch(a.id, 'zq@example', { contact: false, members: false })).length === 0);
  check('phone digits match only with contact permission', (await operatorSearch(a.id, '8675309', { contact: true, members: false })).length === 1 && (await operatorSearch(a.id, '8675309', { contact: false, members: false })).length === 0);
  check('members stay hidden without members.view', !(await operatorSearch(a.id, 'quarterm', { contact: true, members: false })).some(r => r.kind === 'member'));
  check('one letter searches nothing', (await operatorSearch(a.id, 'z', { contact: true, members: true })).length === 0);
  const route = readFileSync('src/app/api/operator/search/route.ts', 'utf8');
  check('the route scopes to the session course and gates per permission', /operatorSearch\(session\.courseId/.test(route) && /can\(session, 'sheet\.golfer_contact'\)/.test(route) && /can\(session, 'members\.view'\)/.test(route) && /requirePermission\(session, 'sheet\.view'\)/.test(route));
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });
