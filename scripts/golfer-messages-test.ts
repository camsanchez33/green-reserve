// MSG-1 (PLATFORM_ROADMAP_SPEC §5): a course's notice to the golfers booked on
// a day. Proves who it reaches (confirmed bookings in the window only, one
// message per golfer, no placeholder emails, never another course's golfers)
// and that a failed send is reported and logged, never silent. Needs a
// database; no Resend key, so every email "fails" — which is the point of the
// last check.
// Run: npx tsx scripts/golfer-messages-test.ts
import { PrismaClient } from '@prisma/client';
import { audience, reach, checkWindow, sendCourseMessage, smsRoom, SMS_CHARS } from '../src/lib/golfer-messages';

const prisma = new PrismaClient();
const TAG = 'golfermsgtest';
const DAY = '2030-07-09';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.courseMessage.deleteMany({ where: { courseId } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Msg Test', email: `${TAG}@test.local`, password: 'x' } });
  const mk = (n: number) => prisma.course.create({ data: { name: `Msg Course ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'T', state: 'CA', zipCode: '90210', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC' } });
  const c = await mk(1), other = await mk(2);
  const slot = (courseId: string, time: string) => prisma.teeTime.create({ data: { courseId, date: DAY, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0 } });
  const book = (courseId: string, teeTimeId: string, name: string, email: string, phone = '', status = 'confirmed') => prisma.booking.create({ data: {
    teeTimeId, courseId, golferName: name, golferEmail: email, golferPhone: phone, players: 1, greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 5000, status, paymentStatus: 'manual',
  } });
  const t7 = await slot(c.id, '07:00'), t8 = await slot(c.id, '08:00'), t12 = await slot(c.id, '12:00');
  await book(c.id, t7.id, 'Ann Lee', 'ann@example.com', '555 111 2222');
  await book(c.id, t8.id, 'Ann Lee', 'ANN@example.com');                  // same golfer, second booking
  await book(c.id, t8.id, 'Walk In', 'x@noemail.greenreserve.app');       // placeholder, no phone
  await book(c.id, t12.id, 'Bo Ito', 'bo@example.com');
  await book(c.id, t12.id, 'Gone Guy', 'gone@example.com', '', 'cancelled');
  const o9 = await slot(other.id, '09:00');
  await book(other.id, o9.id, 'Not Mine', 'notmine@example.com');

  check('a bad window is refused', checkWindow({ date: DAY, from: '10:00', to: '09:00' }) !== null && checkWindow({ date: 'soon' }) !== null);
  const all = await audience(c.id, { date: DAY });
  const names = all.map(r => r.name).sort().join(',');
  check('the whole day reaches each booked golfer once', names === 'Ann Lee,Bo Ito,Walk In', names);
  check('cancelled bookings are not messaged', !all.some(r => r.name === 'Gone Guy'));
  check("another course's golfers are never included", !all.some(r => r.name === 'Not Mine'));
  check('a golfer gets their earliest tee time', all.find(r => r.name === 'Ann Lee')?.teeTime === '07:00');
  const r = reach(all);
  check('reach counts email, mobile and the unreachable', r.email === 2 && r.sms === 1 && r.unreachable === 1, JSON.stringify(r));
  const morning = await audience(c.id, { date: DAY, from: '07:30', to: '09:00' });
  check('a window only reaches its own times', morning.map(x => x.name).sort().join(',') === 'Ann Lee,Walk In');

  const sent = await sendCourseMessage({ courseId: c.id, window: { date: DAY }, body: 'Frost delay — first tee 9:00.', sms: false, sentBy: 'op:test' });
  check('a failed send is reported per golfer, not swallowed', sent.sentEmail + sent.failed.length === 2, JSON.stringify({ sent: sent.sentEmail, failed: sent.failed.length }));
  check('the golfer with no contact is counted as unreachable', sent.unreachable === 1);
  const logged = await prisma.courseMessage.findFirst({ where: { courseId: c.id } });
  check('the message is logged with its outcome', !!logged && logged.body.startsWith('Frost delay') && logged.failed === sent.failed.length && logged.sentEmail === sent.sentEmail);

  check('a text leaves room for the course name', smsRoom('Hollow Creek') === SMS_CHARS - 'Hollow Creek'.length - 2);
  const late = await sendCourseMessage({ courseId: c.id, window: { date: DAY }, body: 'Cart path only today.', sms: false, sentBy: 'op:test', budgetMs: -1 });
  check('out of time: every unsent golfer is named, nothing claimed', late.sentEmail === 0 && late.failed.length === 2 && late.failed.every(f => /Ran out of time/.test(f.error)), JSON.stringify(late.failed.map(f => f.error)));
  const lateLog = await prisma.courseMessage.findFirst({ where: { courseId: c.id, body: 'Cart path only today.' } });
  check('out of time: the log row exists with the misses counted', !!lateLog && lateLog.failed === 2 && lateLog.sentEmail === 0);

  await cleanup();
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
