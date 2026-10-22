// W2-9 Events against a real database: saving an event holds its tee times
// (and only open ones), times made later are created already held, moving the
// event moves the hold and the checklist, cancelling gives the times back,
// a time staff reopen leaves the event, and reopening a closed day keeps an
// event's hold. Needs a database. Run: npx tsx scripts/events-db-test.ts
import { PrismaClient } from '@prisma/client';
import { createEvent, updateEvent, cancelEvent, applyHold, previewEvent, unheldTimes, EventError } from '../src/lib/course-events';
import { generateTeeTimes } from '../src/lib/tee-sheet-engine';
import { setTeeTimeBlocked } from '../src/lib/schedule-service';

const prisma = new PrismaClient();
const TAG = 'w29eventstest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.courseEvent.deleteMany({ where: { courseId } });
  await prisma.teeTimeSchedule.deleteMany({ where: { courseId } });
  await prisma.courseProduct.deleteMany({ where: { courseId } });
  await prisma.nine.deleteMany({ where: { courseId } });
  await prisma.blackout.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'A', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: 'W29', slug: `${TAG}-1`, operatorId: op.id, address: '1', city: 'T', state: 'NJ', zipCode: '07000', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC' } });
  const courseId = course.id;
  // Every 10 minutes, 6:00 to 15:00, every day.
  await prisma.teeTimeSchedule.create({ data: { courseId, daysOfWeek: [], startTime: '06:00', endTime: '15:00', intervalMinutes: 10, holes: 18, greenFeeWeekdayCents: 5000, greenFeeWeekendCents: 6000 } });

  const day = '2031-05-14';
  await generateTeeTimes(courseId, day);
  // A group already booked at 9:00 — inside the shotgun's window.
  const nine = await prisma.teeTime.findFirstOrThrow({ where: { courseId, date: day, time: '09:00' } });
  await prisma.teeTime.update({ where: { id: nine.id }, data: { playersBooked: 2 } });
  await prisma.booking.create({ data: { teeTimeId: nine.id, courseId, golferName: 'Early Bird', golferEmail: `${TAG}+b@test.local`, players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 10000, status: 'confirmed' } });
  // A time the staff blocked by hand.
  const hand = await prisma.teeTime.findFirstOrThrow({ where: { courseId, date: day, time: '10:00' } });
  await prisma.teeTime.update({ where: { id: hand.id }, data: { status: 'blocked' } });

  const input = { name: 'Rotary Scramble', kind: 'outing', date: day, format: 'shotgun', startTime: '08:00', holes: 18, players: 72, groups: 18 };
  const pv = await previewEvent(courseId, input);
  check('preview: an 18-hole shotgun at 8:00 holds 7:00 to 12:30', pv.holdFrom === '07:00' && pv.holdTo === '12:30', JSON.stringify(pv));
  check('preview names the booked group in the way', pv.booked.length === 1 && pv.booked[0].golfers === 'Early Bird', JSON.stringify(pv.booked));
  check('preview saved nothing', (await prisma.courseEvent.count({ where: { courseId } })) === 0);

  const { event, hold } = await createEvent(courseId, input, 'owner@test.local');
  // 7:00–12:30 every 10 min = 34 times; minus 9:00 (booked) and 10:00 (blocked by hand) = 32.
  check('saving holds every open time in the window', hold.held === 32, String(hold.held));
  check('…and reports the booked one instead of holding it', hold.booked.length === 1 && hold.booked[0].time === '09:00');
  const nineAfter = await prisma.teeTime.findUniqueOrThrow({ where: { id: nine.id } });
  check('the booked time is untouched', nineAfter.status === 'available' && nineAfter.eventId === null);
  const handAfter = await prisma.teeTime.findUniqueOrThrow({ where: { id: hand.id } });
  check('a time blocked by hand is not taken by the event', handAfter.eventId === null && handAfter.status === 'blocked');
  check('times outside the window stay on sale', (await prisma.teeTime.findFirstOrThrow({ where: { courseId, date: day, time: '12:40' } })).status === 'available');
  const tasks = await prisma.courseEventTask.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
  check('the default checklist is built, due dates counted back', tasks.length === 5 && tasks[0].dueDate === '2031-05-07' && tasks[4].dueDate === '2031-05-15', JSON.stringify(tasks.map(t => t.dueDate)));

  // The group at 9:00 moves out; the course holds the freed time.
  await prisma.booking.updateMany({ where: { teeTimeId: nine.id }, data: { status: 'cancelled' } });
  await prisma.teeTime.update({ where: { id: nine.id }, data: { playersBooked: 0 } });
  // The last group in the way is gone: the event page must still offer to hold its time.
  check('a time freed in the window is listed as open and not held', JSON.stringify(await unheldTimes(event)) === '["09:00"]', JSON.stringify(await unheldTimes(event)));
  const re = await applyHold(event);
  check('…and is no longer listed once held', (await unheldTimes(event)).length === 0);
  // A time with only cancelled bookings is free to hold.
  check('"Hold freed times" picks up the time once its group is gone', re.held === 1 && re.booked.length === 0, JSON.stringify(re));

  // Regenerating the day keeps the hold (blocked rows are left alone).
  await generateTeeTimes(courseId, day);
  check('regenerating the day keeps every held time', (await prisma.teeTime.count({ where: { eventId: event.id, status: 'blocked' } })) === 33);

  // A tee-times event on a day whose times don't exist yet: they are created held.
  const later = '2031-06-03';
  const tt = await createEvent(courseId, { name: 'League', kind: 'league', date: later, format: 'tee_times', startTime: '17:00', groups: 3 }, 'x');
  check('a start after the schedule\u2019s last time is saved, with no tee times found to hold', tt.event.holdFrom === '17:00' && tt.event.holdTo === '17:00' && tt.teeTimesFound === 0,
    JSON.stringify({ from: tt.event.holdFrom, to: tt.event.holdTo, found: tt.teeTimesFound }));
  const tt2 = await createEvent(courseId, { name: 'Couples', kind: 'other', date: later, format: 'tee_times', startTime: '13:00', groups: 3 }, 'x');
  check('three groups from 1:00 hold 1:00 to 1:20', tt2.event.holdFrom === '13:00' && tt2.event.holdTo === '13:20');
  await generateTeeTimes(courseId, later);
  const heldLater = await prisma.teeTime.findMany({ where: { courseId, date: later, eventId: tt2.event.id }, select: { time: true, status: true } });
  check('times generated later are created already held', heldLater.length === 3 && heldLater.every(h => h.status === 'blocked'), JSON.stringify(heldLater));
  check('the time after the window is on sale', (await prisma.teeTime.findFirstOrThrow({ where: { courseId, date: later, time: '13:30' } })).status === 'available');

  // Staff reopen one held time: it leaves the event, and a re-hold never takes it back.
  const one = await prisma.teeTime.findFirstOrThrow({ where: { courseId, date: later, eventId: tt2.event.id, time: '13:10' } });
  await setTeeTimeBlocked(one.id, false, { scopeCourseId: courseId });
  const reopened = await prisma.teeTime.findUniqueOrThrow({ where: { id: one.id } });
  check('a held time staff reopen is back on sale and out of the event', reopened.status === 'available' && reopened.eventId === null);

  // Close the day and reopen it: the event's hold comes back.
  await prisma.teeTime.deleteMany({ where: { courseId, date: later, bookings: { none: {} } } });
  const bo = await prisma.blackout.create({ data: { courseId, date: later, reason: 'test' } });
  await prisma.blackout.delete({ where: { id: bo.id } });
  await generateTeeTimes(courseId, later);
  check('reopening a closed day holds the event’s times again', (await prisma.teeTime.count({ where: { courseId, date: later, eventId: tt2.event.id, status: 'blocked' } })) === 3);

  // Move the shotgun a day later: the old day goes back on sale, the new day is held, due dates shift.
  const next = '2031-05-15';
  const moved = await updateEvent(courseId, event.id, { ...input, date: next });
  check('moving the event releases the old day', (await prisma.teeTime.count({ where: { courseId, date: day, status: 'blocked', eventId: null, time: { not: '10:00' } } })) === 0
    && (await prisma.teeTime.count({ where: { courseId, date: day, eventId: event.id } })) === 0);
  check('the hand-blocked time on the old day stays blocked', (await prisma.teeTime.findUniqueOrThrow({ where: { id: hand.id } })).status === 'blocked');
  // The new day's tee times don't exist yet: nothing to hold now, and they are created held.
  check('the new day has nothing to hold until its times are made', moved?.hold.held === 0, String(moved?.hold.held));
  await generateTeeTimes(courseId, next);
  check('…then every time in the window is created held', (await prisma.teeTime.count({ where: { courseId, date: next, eventId: event.id, status: 'blocked' } })) === 34);
  const shifted = await prisma.courseEventTask.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
  check('the checklist moves with the date', shifted[0].dueDate === '2031-05-08' && shifted[4].dueDate === '2031-05-16', JSON.stringify(shifted.map(t => t.dueDate)));

  // A hold end the course set by hand is kept and flagged.
  const custom = await updateEvent(courseId, event.id, { ...input, date: next, holdTo: '11:00' });
  check('a hold end set by hand is used and remembered', custom?.event.holdTo === '11:00' && custom?.event.holdToCustom === true);
  check('…and the times after it go back on sale', (await prisma.teeTime.count({ where: { courseId, date: next, eventId: event.id } })) === 25);

  // Cancel: every time it held goes back on sale.
  const c = await cancelEvent(courseId, event.id);
  check('cancelling gives back every time it held', (c?.released ?? 0) === 25 && (await prisma.teeTime.count({ where: { eventId: event.id } })) === 0, String(c?.released));
  let refused = false;
  try { await updateEvent(courseId, event.id, input); } catch (e) { refused = e instanceof EventError; }
  check('a cancelled event cannot be changed', refused);

  // Set up at short notice: nothing on the checklist starts out overdue.
  const { todayIn } = await import('../src/lib/course-time');
  const today = todayIn('UTC');
  const soon = new Date(Date.parse(today + 'T12:00:00Z') + 2 * 86_400_000).toISOString().slice(0, 10);
  const short = await createEvent(courseId, { ...input, date: soon }, 'x');
  const shortTasks = await prisma.courseEventTask.findMany({ where: { eventId: short.event.id }, orderBy: { sortOrder: 'asc' } });
  check('an event two days out has no checklist item due before today', shortTasks.every(t => (t.dueDate ?? '') >= today) && shortTasks[0].dueDate === today, JSON.stringify(shortTasks.map(t => t.dueDate)));
  await cancelEvent(courseId, short.event.id);

  // Moving an event off a day the course has since closed never reopens that day's times.
  const closedDay = '2031-07-01', openDay = '2031-07-02', shutDay = '2031-07-03';
  const ce = await createEvent(courseId, { ...input, date: closedDay }, 'x');
  await generateTeeTimes(courseId, closedDay);
  const keep = await prisma.teeTime.findFirstOrThrow({ where: { courseId, date: closedDay, eventId: ce.event.id } });
  await prisma.booking.create({ data: { teeTimeId: keep.id, courseId, golferName: 'Gone', golferEmail: `${TAG}+g@test.local`, players: 1, greenFeeTotal: 0, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 0, status: 'cancelled' } });
  await prisma.teeTime.deleteMany({ where: { courseId, date: closedDay, bookings: { none: {} } } }); // what closing a day does
  await prisma.blackout.create({ data: { courseId, date: closedDay, reason: 'test' } });
  await updateEvent(courseId, ce.event.id, { ...input, date: openDay });
  const kept = await prisma.teeTime.findUniqueOrThrow({ where: { id: keep.id } });
  check('moving an event off a closed day leaves that day\u2019s time blocked', kept.status === 'blocked' && kept.eventId === null, JSON.stringify(kept));
  // …and moving it ONTO a closed day gives the day it left back to golfers.
  await generateTeeTimes(courseId, openDay);
  check('(the open day is held)', (await prisma.teeTime.count({ where: { courseId, date: openDay, eventId: ce.event.id } })) === 34);
  await prisma.blackout.create({ data: { courseId, date: shutDay, reason: 'test' } });
  await updateEvent(courseId, ce.event.id, { ...input, date: shutDay });
  const left = await prisma.teeTime.findMany({ where: { courseId, date: openDay, time: { gte: '07:00', lte: '12:30' } }, select: { status: true, eventId: true } });
  check('moving an event onto a closed day reopens the day it left', left.length === 34 && left.every(t => t.status === 'available' && t.eventId === null), JSON.stringify(left.filter(t => t.status !== 'available').length));
  await cancelEvent(courseId, ce.event.id);

  // Sharing the course (Cam 2026-10-22): a shotgun on the front nine, with 8:00 kept open.
  const two = await prisma.course.create({ data: { name: 'W29b', slug: `${TAG}-2`, operatorId: op.id, address: '1', city: 'T', state: 'NJ', zipCode: '07000', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC' } });
  const front = await prisma.nine.create({ data: { courseId: two.id, name: 'Front' } });
  const back = await prisma.nine.create({ data: { courseId: two.id, name: 'Back' } });
  const f9 = await prisma.courseProduct.create({ data: { courseId: two.id, label: 'Front 9', holes: 9, nineIds: [front.id] } });
  const b9 = await prisma.courseProduct.create({ data: { courseId: two.id, label: 'Back 9', holes: 9, nineIds: [back.id] } });
  for (const pr of [f9, b9]) await prisma.teeTimeSchedule.create({ data: { courseId: two.id, productId: pr.id, daysOfWeek: [], startTime: '07:00', endTime: '10:00', intervalMinutes: 10, holes: 9, greenFeeWeekdayCents: 3000, greenFeeWeekendCents: 3500 } });
  const shareDay = '2031-08-05';
  await generateTeeTimes(two.id, shareDay);
  const shared = { name: 'Front nine scramble', kind: 'outing', date: shareDay, format: 'shotgun', startTime: '08:00', holes: 9, shareCourse: true, holdNineIds: [front.id], keepOpen: ['08:00'] };
  const spv = await previewEvent(two.id, shared);
  check('preview lists every time the shared event could take', spv.windowTimes.includes('08:00') && spv.windowTimes[0] === '07:00', JSON.stringify(spv.windowTimes.slice(0, 3)));
  const se = await createEvent(two.id, shared, 'x');
  const at = (pid: string, time: string) => prisma.teeTime.findFirstOrThrow({ where: { courseId: two.id, date: shareDay, productId: pid, time } });
  check('a shared shotgun holds its nine', (await at(f9.id, '07:30')).eventId === se.event.id);
  check('…leaves the other nine on sale', (await at(b9.id, '07:30')).status === 'available');
  check('…and keeps the chosen time open', (await at(f9.id, '08:00')).status === 'available');
  // Changing which times stay open moves the hold with it.
  await updateEvent(two.id, se.event.id, { ...shared, keepOpen: ['08:10'] });
  check('a time no longer kept open is held', (await at(f9.id, '08:00')).eventId === se.event.id);
  check('a newly kept-open time goes back on sale', (await at(f9.id, '08:10')).status === 'available');
  const otherCourseNine = await prisma.nine.create({ data: { courseId, name: 'Elsewhere' } });
  let nineRefused = false;
  try { await createEvent(two.id, { ...shared, holdNineIds: [otherCourseNine.id] }, 'x'); } catch (e) { nineRefused = e instanceof EventError; }
  check('another course\u2019s nine is refused', nineRefused);

  // Validation.
  const bad = async (i: Record<string, unknown>) => { try { await createEvent(courseId, i, 'x'); return ''; } catch (e) { return e instanceof EventError ? e.message : 'other'; } };
  check('a past date is refused', (await bad({ ...input, date: '2020-01-01' })) === 'That date has already gone.');
  check('a tee-times event needs its groups', /How many groups/.test(await bad({ ...input, format: 'tee_times', groups: 0 })));
  check('a hold that ends before it starts is refused', /end after it starts/.test(await bad({ ...input, holdTo: '06:00' })));
  check('another course’s event is not found', (await updateEvent('nope', tt2.event.id, input)) === null && (await cancelEvent('nope', tt2.event.id)) === null);

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
  console.log('\nALL PASS');
}

main().catch(async e => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
