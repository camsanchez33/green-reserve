// ACT-2 (PLATFORM_ROADMAP_SPEC §3): Birdie's tee-sheet drafts against a real
// seeded course. Each draft must be a card that calls the allow-listed route
// with the right body, never change anything itself, and refuse what the sheet
// would refuse. Needs a database; no model.
// Run: npx tsx scripts/birdie-sheet-drafts-test.ts
import { PrismaClient } from '@prisma/client';
import { runProposeTool } from '../src/lib/birdie/proposals';
import { isProposalCard, cardCalls } from '../src/lib/birdie/proposal-types';
import type { ToolContext } from '../src/lib/birdie/tools';

const prisma = new PrismaClient();
const TAG = 'birdiesheettest';
const DAY = '2030-06-04';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Sheet Test', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: {
    name: 'Sheet Test Course', slug: `${TAG}-1`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18,
    liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24,
  } });
  const slot = (time: string, o: { booked?: number; status?: string } = {}) => prisma.teeTime.create({ data: {
    courseId: course.id, date: DAY, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: o.booked ?? 0, status: o.status ?? 'available',
  } });
  const t8 = await slot('08:00', { booked: 2 }), t9 = await slot('09:00'), t910 = await slot('09:10'), t920 = await slot('09:20', { status: 'blocked' });
  const ann = await prisma.booking.create({ data: {
    teeTimeId: t8.id, courseId: course.id, golferName: 'Ann Lee', golferEmail: 'ann@example.com', golferPhone: '5551234567', players: 2,
    greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300, status: 'confirmed', paymentStatus: 'no_payment_method', checkInToken: 'tok',
  } });
  const ctx: ToolContext = { courseId: course.id, timezone: 'UTC', can: () => true };

  // Move
  const move = await runProposeTool('propose_move_group', { date: DAY, time: '08:00', golfer: 'ann', toTime: '09:00' }, ctx);
  check('move: a card', !!move.card && isProposalCard(move.card), move.content);
  check('move: it calls the move action with the right ids', move.card?.call.path === '/api/operator/bookings' && move.card.call.body.action === 'move' && move.card.call.body.id === ann.id && move.card.call.body.newTeeTimeId === t9.id);
  check('move: it says the price stays', /price stays \$103\.00/.test(move.card?.note ?? ''), move.card?.note);
  check('move: drafting moved nothing', (await prisma.booking.findUnique({ where: { id: ann.id } }))?.teeTimeId === t8.id);
  const intoBlocked = await runProposeTool('propose_move_group', { date: DAY, time: '08:00', golfer: 'Ann', toTime: '09:20' }, ctx);
  check('move: into a blocked time is refused', intoBlocked.isError && !intoBlocked.card, intoBlocked.content);
  const nobody = await runProposeTool('propose_move_group', { date: DAY, time: '08:00', golfer: 'Bob', toTime: '09:00' }, ctx);
  check('move: an unknown golfer is refused and the real names offered', nobody.isError && /Ann Lee/.test(nobody.content));

  // Block a run of times
  const block = await runProposeTool('propose_block_times', { date: DAY, from: '08:00', to: '09:20', block: true }, ctx);
  const calls = block.card ? cardCalls(block.card) : [];
  check('block: one card, one call per time that changes (the blocked one skipped)', calls.length === 3 && isProposalCard(block.card), String(calls.length));
  check('block: every call blocks', calls.every(c => c.path === '/api/operator/tee-times' && c.body.status === 'blocked'));
  check('block: it says the booked group stays', /stay booked; nobody is cancelled/.test(block.card?.note ?? ''), block.card?.note);
  const reopen = await runProposeTool('propose_block_times', { date: DAY, from: '09:20', block: false }, ctx);
  check('reopen: the blocked time reopens', reopen.card?.call.body.id === t920.id && reopen.card.call.body.status === 'available');
  check('block: drafting blocked nothing', (await prisma.teeTime.findUnique({ where: { id: t910.id } }))?.status === 'available');

  // Add a booking
  const add = await runProposeTool('propose_add_booking', { date: DAY, time: '09:10', golfer: 'Cal Ito', players: 3, source: 'phone', phone: '555 222 3333' }, ctx);
  check('add: a card that posts a counter booking', add.card?.call.method === 'POST' && add.card.call.body.teeTimeId === t910.id && add.card.call.body.source === 'phone' && add.card.call.body.players === 3 && isProposalCard(add.card));
  check('add: never checked in on the spot', add.card?.call.body.checkInNow === undefined);
  const tooBig = await runProposeTool('propose_add_booking', { date: DAY, time: '08:00', golfer: 'Big Group', players: 3, source: 'walk_in' }, ctx);
  check('add: more players than the time has room for is refused', tooBig.isError && /room for 2/.test(tooBig.content), tooBig.content);

  // Pay link
  const text = await runProposeTool('propose_send_pay_link', { date: DAY, time: '08:00', golfer: 'Ann Lee', via: 'sms' }, ctx);
  check('pay link: a card that texts the link', text.card?.call.body.action === 'send_pay_link' && text.card.call.body.via === 'sms' && isProposalCard(text.card));
  await prisma.booking.update({ where: { id: ann.id }, data: { stripePaymentMethodId: 'pm_x' } });
  const hasCard = await runProposeTool('propose_send_pay_link', { date: DAY, time: '08:00', golfer: 'Ann Lee', via: 'sms' }, ctx);
  check('pay link: a group with a card on file needs none', hasCard.isError && /card on file/.test(hasCard.content));

  // Another course's login sees none of it.
  const other: ToolContext = { courseId: 'someone-else', timezone: 'UTC', can: () => true };
  const theirs = await runProposeTool('propose_move_group', { date: DAY, time: '08:00', golfer: 'Ann', toTime: '09:00' }, other);
  check("another course's login can't draft against this sheet", theirs.isError && !theirs.card);

  await cleanup();
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
