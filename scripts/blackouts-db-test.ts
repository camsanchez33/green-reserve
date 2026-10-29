// Revamp 3 fix 11 (Cam 2026-10-29): closing a day says who is booked (they stay
// booked), and reopening puts back on sale only what the closure blocked — never
// a time staff blocked by hand or an event holds. Needs a database.
// Run: npx tsx scripts/blackouts-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { bookedOn, closeDay, reopenDay } from '../src/lib/blackouts';
import { addDaysStr, todayIn } from '../src/lib/course-time';

const TAG = 'blackoutdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.blackout.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (s: string) => prisma.course.create({ data: { name: s, slug: `${TAG}-${s}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const c = await mk('a'), other = await mk('b');
  const day = addDaysStr(todayIn('UTC'), 5);
  const tt = (time: string, status = 'available') => prisma.teeTime.create({ data: { courseId: c.id, date: day, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, status } });
  const booked = await tt('08:00'), open = await tt('08:10'), byHand = await tt('08:20', 'blocked');
  await prisma.booking.create({ data: { teeTimeId: booked.id, courseId: c.id, golferName: 'G', golferEmail: `${TAG}@t.local`, players: 3, greenFeeTotal: 15000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 15000, status: 'confirmed', paymentStatus: 'card_on_file' } });

  ok('before closing: who is booked that day', JSON.stringify(await bookedOn(c.id, day)) === JSON.stringify({ groups: 1, players: 3 }));
  const closed = await closeDay(c.id, day, 'Aeration');
  const after = await prisma.teeTime.findMany({ where: { courseId: c.id, date: day } });
  ok('closing says who stays booked', closed.booked.groups === 1 && closed.booked.players === 3, closed);
  ok('…the booked time is blocked in place, the open one is gone', after.find(t => t.id === booked.id)?.status === 'blocked' && !after.some(t => t.id === open.id));
  ok('…and only the time it blocked is recorded', JSON.stringify((await prisma.blackout.findUniqueOrThrow({ where: { id: closed.id } })).blockedTeeTimeIds) === JSON.stringify([booked.id]));

  ok('another course can\'t reopen it', (await reopenDay(other.id, closed.id)) === null);
  const re = await reopenDay(c.id, closed.id);
  const back = await prisma.teeTime.findMany({ where: { courseId: c.id, date: day } });
  ok('reopening puts the booked time back on sale', !!re && re.reopened === 1 && back.find(t => t.id === booked.id)?.status === 'available', re);
  ok('…but a time staff blocked by hand before the closure stays blocked', back.find(t => t.id === byHand.id)?.status === 'blocked');

  const page = readFileSync('src/app/dashboard/schedules/page.tsx', 'utf8');
  ok('the schedule page asks before reopening a day', /async function reopenDay[\s\S]{0,300}confirm\(/.test(page));
  ok('…and shows who is booked before closing one', page.includes('/api/operator/blackouts?date=') && page.includes('Cancel and tell them'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('blackouts-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
