// BRAIN-1b: the course timeline against seeded data — every source lands in
// its group, newest first, filters and paging work, and the send log ties an
// email to its course (by booking, or by the course's own people). Static half:
// every email sender in lib/email.ts says what it is (`meta`).
// Needs a database. Run: npx tsx scripts/course-feed-db-test.ts
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { buildCourseFeed } from '../src/lib/course-timeline';
import { logSent } from '../src/lib/sent-messages';

const prisma = new PrismaClient();
const TAG = 'coursefeedtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ' — ' + detail : ''}`); if (!ok) failed++; };
const T = (minAgo: number) => new Date(Date.now() - minAgo * 60_000);

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const ids = courses.map(c => c.id);
  await prisma.sentMessage.deleteMany({ where: { OR: [{ courseId: { in: ids } }, { to: { startsWith: TAG } }] } });
  await prisma.adminAuditLog.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.adminAlert.deleteMany({ where: { key: { startsWith: `failed:${ids[0] ?? 'none'}` } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.paymentEvent.deleteMany({ where: { booking: { courseId: { in: ids } } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.messageThread.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseInquiry.deleteMany({ where: { email: `${TAG}@test.local` } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
  await prisma.adminUser.deleteMany({ where: { email: `${TAG}-admin@test.local` } });
}

async function main() {
  // Static: every email sender names its kind.
  const src = readFileSync('src/lib/email.ts', 'utf8');
  const sends = src.match(/getResend\(\)\.emails\.send\(\{/g) ?? [];
  const tagged = src.match(/getResend\(\)\.emails\.send\(\{ meta: \{ kind: '[a-z_]+'/g) ?? [];
  check(`every email sender says what it is (${tagged.length}/${sends.length})`, sends.length > 50 && tagged.length === sends.length);

  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Feed Test', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: {
    name: 'Feed Test GC', slug: `${TAG}-1`, operatorId: op.id, address: '1', city: 'T', state: 'NY', zipCode: '10990', holes: 18,
    liveStatus: 'live', active: true, timezone: 'America/New_York', cancellationHours: 24,
  } });
  const inquiry = await prisma.courseInquiry.create({ data: {
    firstName: 'F', lastName: 'T', contactName: 'F T', contactTitle: 'GM', email: `${TAG}@test.local`, phone: '5550000000',
    courseName: 'Feed Test GC', address: '1', city: 'T', state: 'NY', zipCode: '10990', courseType: 'public', status: 'live', builtCourseId: course.id,
    events: { create: [{ fromStatus: 'building', toStatus: 'live', trigger: 'admin', actorName: 'Cam', createdAt: T(90) }] },
  } });
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-05-01', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2, status: 'available' } });
  const b = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: course.id, golferName: 'Sam Lee', golferEmail: `${TAG}-golfer@test.local`, players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300, status: 'confirmed', createdAt: T(80) } });
  await prisma.bookingEvent.create({ data: { bookingId: b.id, courseId: course.id, type: 'booking_created', actorType: 'golfer', playerCount: 2, occurredAt: T(80) } });
  await prisma.paymentEvent.create({ data: { bookingId: b.id, kind: 'charge_failed', amountCents: 10300, actor: 'cron', detail: 'card_declined', createdAt: T(70) } });
  // The send log: by booking (course found through it), and by recipient (the course's owner).
  await logSent({ kind: 'booking_confirmation', bookingId: b.id, channel: 'email', to: `${TAG}-golfer@test.local`, status: 'sent', providerId: 'r1' });
  await logSent({ kind: 'operator_booking_notification', channel: 'email', to: `${TAG}@test.local`, status: 'failed', error: 'bounced' });
  const confirm = await prisma.sentMessage.findFirst({ where: { bookingId: b.id } });
  check('an email about a booking is filed under its course', confirm?.courseId === course.id);
  const thread = await prisma.messageThread.create({ data: { courseId: course.id } });
  await prisma.message.create({ data: { threadId: thread.id, senderType: 'operator', senderId: op.id, senderName: 'Dave', body: 'Can we change our rates?', createdAt: T(60) } });
  const admin = await prisma.adminUser.create({ data: { email: `${TAG}-admin@test.local`, name: 'Cam', passwordHash: 'x', role: 'owner' } });
  await prisma.adminAuditLog.create({ data: { adminId: admin.id, actorName: 'Cam', action: 'refund', targetType: 'booking', targetId: b.id, courseId: course.id, reason: 'Frost', after: { amountCents: 10300 }, createdAt: T(50) } });
  await prisma.adminAlert.create({ data: { key: `failed:${course.id}`, kind: 'urgent', title: 'Card declined at check-in — Feed Test GC', firstSeenAt: T(65), resolvedAt: T(40) } });

  const feed = await buildCourseFeed(course.id);
  const items = feed?.items ?? [];
  const has = (g: string, t: string) => items.some(i => i.group === g && i.title.includes(t));
  check('booking made → Bookings & payments', has('bookings', 'Booked — Sam Lee'));
  check('declined charge → Bookings & payments, marked bad', items.some(i => i.group === 'bookings' && i.title.startsWith('Charge declined') && i.tone === 'bad'));
  check('confirmation email → Messages & emails', has('messages', 'Booking confirmation'));
  check('owner email with no course id still shows (by recipient), as not delivered', items.some(i => i.group === 'messages' && i.title.includes('not delivered')));
  check('message from the course → Messages & emails', has('messages', 'Dave wrote'));
  check('admin refund → Admin & staff changes, with its reason', items.some(i => i.group === 'changes' && i.title === 'Refund' && (i.detail ?? '').includes('Frost')));
  check('alert started and cleared → Problems & onboarding', has('problems', 'Problem: Card declined') && has('problems', 'Cleared: Card declined'));
  check('onboarding stage move → Problems & onboarding', has('problems', 'Onboarding: Building → Live'));
  check('newest first', items.every((it, i) => i === 0 || items[i - 1].at >= it.at));

  const only = await buildCourseFeed(course.id, { groups: ['messages'] });
  check('a filter shows only its group', !!only && only.items.length > 0 && only.items.every(i => i.group === 'messages'));
  const p1 = await buildCourseFeed(course.id, { limit: 3 });
  const p2 = p1?.next ? await buildCourseFeed(course.id, { limit: 3, before: new Date(p1.next) }) : null;
  check('paging: a next cursor when there is more', !!p1?.next);
  check('paging: the next page continues, older, no repeats', !!p2 && p2.items.length > 0 && p2.items.every(i => i.at < p1!.next! || i.at === p1!.next!) && !p2.items.some(i => p1!.items.some(j => j.id === i.id)));
  check('an unknown course → null', (await buildCourseFeed('no-such-course')) === null);
  void inquiry;

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
