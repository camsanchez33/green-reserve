// AW-5: the admin's urgent alerts and morning digest against a real database.
// An urgent problem is emailed once, stays quiet while it lasts, resolves when
// it clears and alerts again if it comes back; a failed email is retried next
// hour. The digest goes once a day after 7am Eastern, retries if sending
// failed, and drops an AI summary carrying a number the facts don't.
// Needs a database; emails and the model are stubbed. Run: npx tsx scripts/admin-checks-db-test.ts
import { PrismaClient } from '@prisma/client';
import { runUrgentChecks, runMorningDigest, digestSummary, digestFacts, urgentFindings } from '../src/lib/admin-checks';
import { dayKey } from '../src/lib/admin-day';

const prisma = new PrismaClient();
const TAG = 'adminchecktest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  await prisma.adminAlert.deleteMany({ where: { OR: [{ key: { in: courses.map(c => `nostripe:${c.id}`) } }, { key: { startsWith: 'digest:2031-' } }] } });
  const ids = courses.map(c => c.id);
  await prisma.paymentEvent.deleteMany({ where: { booking: { courseId: { in: ids } } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Check Test', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: {
    name: `${TAG} Course`, slug: `${TAG}-1`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18,
    liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24, stripeAccountActive: false,
  } });
  const key = `nostripe:${course.id}`;
  let sent: string[] = [];
  const send = async (d: { findings: { key?: string; title: string }[] }) => { sent.push(...d.findings.map(f => f.title)); };
  const mine = () => sent.filter(t => t.includes(TAG));

  await runUrgentChecks(new Date(), send);
  check('a live course that can’t take payments is emailed', mine().length === 1, JSON.stringify(sent));
  sent = [];
  await runUrgentChecks(new Date(), send);
  check('…once — the next run stays quiet while it lasts', mine().length === 0);

  await prisma.course.update({ where: { id: course.id }, data: { stripeAccountActive: true } });
  await runUrgentChecks(new Date(), send);
  check('when it clears, it is marked resolved', !!(await prisma.adminAlert.findUnique({ where: { key } }))?.resolvedAt);

  // BRAIN-2a: someone took it and snoozed it before it cleared; when it comes back it starts fresh.
  await prisma.adminAlert.update({ where: { key }, data: { ownerId: 'someone', ownerName: 'Someone', snoozedUntil: new Date(Date.now() + 86_400_000), snoozeReason: 'waiting' } });
  await prisma.course.update({ where: { id: course.id }, data: { stripeAccountActive: false } });
  sent = [];
  await runUrgentChecks(new Date(), send);
  check('if it comes back, it is emailed again', mine().length === 1);
  const back = await prisma.adminAlert.findUnique({ where: { key }, include: { events: { orderBy: { createdAt: 'asc' } } } });
  check('BRAIN-2a: its history reads opened, cleared, reopened', JSON.stringify(back?.events.map(e => e.kind)) === JSON.stringify(['opened', 'cleared', 'reopened']), JSON.stringify(back?.events.map(e => e.kind)));
  check('…and a reopened problem has no owner and no snooze', !back?.ownerId && !back?.ownerName && !back?.snoozedUntil && !back?.snoozeReason && !back?.resolvedAt);
  check('…and it carries its course', back?.courseId === course.id);

  await prisma.adminAlert.delete({ where: { key } });
  await runUrgentChecks(new Date(), async () => { throw new Error('resend down'); });
  check('a failed email leaves it un-alerted', (await prisma.adminAlert.findUnique({ where: { key } }))?.alertedAt === null);
  sent = [];
  await runUrgentChecks(new Date(), send);
  check('…and the next run sends it', mine().length === 1 && !!(await prisma.adminAlert.findUnique({ where: { key } }))?.alertedAt);

  // Digest — dates in 2031 so a real digest row can't collide.
  const digests: unknown[] = [];
  const sendDigest = async (d: unknown) => { digests.push(d); };
  check('before 7am Eastern: not yet', await runMorningDigest(new Date('2031-03-10T10:30:00Z'), null, sendDigest) === 'not_yet');   // 6:30 EDT
  check('after 7am Eastern: sent', await runMorningDigest(new Date('2031-03-10T12:05:00Z'), null, sendDigest) === 'sent' && digests.length === 1);
  check('…once a day', await runMorningDigest(new Date('2031-03-10T13:05:00Z'), null, sendDigest) === 'already' && digests.length === 1);
  check('a failed send', await runMorningDigest(new Date('2031-03-11T12:05:00Z'), null, async () => { throw new Error('down'); }) === 'failed');
  check('…is retried the next hour', await runMorningDigest(new Date('2031-03-11T13:05:00Z'), null, sendDigest) === 'sent' && digests.length === 2);

  // A claim left by a run that died mid-send is taken over after 20 minutes.
  await prisma.adminAlert.create({ data: { key: 'digest:2031-03-12', kind: 'digest', firstSeenAt: new Date('2031-03-12T12:05:00Z'), lastSeenAt: new Date('2031-03-12T12:05:00Z') } });
  check('a fresh claim from another run is left alone', await runMorningDigest(new Date('2031-03-12T12:10:00Z'), null, sendDigest) === 'already' && digests.length === 2);
  check('a stale claim (run killed) is taken over and sent', await runMorningDigest(new Date('2031-03-12T13:05:00Z'), null, sendDigest) === 'sent' && digests.length === 3);
  // Sent, but marking it failed: never released, so never sent twice.
  const sentOnce: unknown[] = [];
  // The sender removes the claim row, so marking it sent then fails.
  const r = await runMorningDigest(new Date('2031-03-13T12:05:00Z'), null, async d => { sentOnce.push(d); await prisma.adminAlert.deleteMany({ where: { key: 'digest:2031-03-13' } }); });
  check('…a digest that went out counts as sent', r === 'sent' && sentOnce.length === 1);

  const facts = await digestFacts(new Date('2031-03-10T12:05:00Z'));
  check('the digest lists the open problem', facts.urgentOpen.some(u => u.title.includes(TAG)));
  check('a summary with an invented number is dropped', await digestSummary(facts, async () => 'Fees are up 437% on last month.') === '');
  check('a summary using only given words is kept', (await digestSummary(facts, async () => 'One course still can’t take payments. The month is quiet so far.')).startsWith('One course'));
  check('no model, no summary', await digestSummary(facts, null) === '');
  check('a model failure is no summary, not a failed digest', await digestSummary(facts, async () => { throw new Error('x'); }) === '');

  // R-PAY-010 follow-up: a failed refund and a declined cancellation hold are Problems.
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
  const testCourse = await prisma.course.create({ data: {
    name: `${TAG} Test Course`, slug: `${TAG}-t`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18,
    liveStatus: 'live', active: true, timezone: 'UTC', isTest: true, stripeAccountActive: true,
  } });
  const mkBooking = async (courseId: string) => {
    const tt = await prisma.teeTime.create({ data: { courseId, date: tomorrow, time: '09:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 1, status: 'available' } });
    return prisma.booking.create({ data: { teeTimeId: tt.id, courseId, golferName: 'Pat', golferEmail: `${TAG}+${courseId}@test.local`, players: 1,
      greenFeeTotal: 5000, cartFeeTotal: 0, accessFeeTotal: 150, totalAmount: 5150, status: 'confirmed', paymentStatus: 'card_on_file' } });
  };
  const owed = await mkBooking(course.id);
  const held = await mkBooking(course.id);
  const testHeld = await mkBooking(testCourse.id);
  const rf = await prisma.paymentEvent.create({ data: { bookingId: owed.id, kind: 'refund_failed', amountCents: 1000, detail: 'x' } });
  for (const b of [held, testHeld]) await prisma.paymentEvent.create({ data: { bookingId: b.id, kind: 'charge_failed', amountCents: 1000, detail: 'Cancellation hold: card declined' } });
  let keys = (await urgentFindings()).map(f => f.key);
  check('a failed refund is a Problem', keys.includes(`refundfail:${rf.id}`), JSON.stringify(keys));
  check('a declined cancellation hold is a Problem', keys.includes(`holddeclined:${held.id}`));
  check('…but not at a test course', !keys.includes(`holddeclined:${testHeld.id}`));
  await prisma.paymentEvent.create({ data: { bookingId: owed.id, kind: 'refund', amountCents: 1000, stripeId: 're_x', actor: 'stripe', createdAt: new Date(Date.now() + 1000) } });
  await prisma.booking.update({ where: { id: held.id }, data: { paymentStatus: 'paid' } });
  keys = (await urgentFindings()).map(f => f.key);
  check('a refund recorded afterwards clears the failed refund', !keys.includes(`refundfail:${rf.id}`));
  check('a hold clears once the round is paid', !keys.includes(`holddeclined:${held.id}`));

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
