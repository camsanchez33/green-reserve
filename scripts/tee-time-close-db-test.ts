// TT-CLOSE (Cam 2026-11-12, the approved tee sheet + time card): Close this time / Hide online / Delete time are for a
// time with nobody booked — the card shows them only then, and the route refuses them on a booked time with a 409
// that names who is on it. Showing a time again, reopening it, and SEATS-1's seat stepper are never refused here.
// Needs a database. Run: npx tsx scripts/tee-time-close-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { closeFreeTime, setStaffOnly, deleteRefusal, refusal } from '../src/lib/tee-time-close';

const TAG = 'ttclosedbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Close Test', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: 'Close Test Course', slug: `${TAG}-1`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', timezone: 'UTC' } });
  const other = await prisma.course.create({ data: { name: 'Other Course', slug: `${TAG}-2`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', timezone: 'UTC' } });
  const tt = (time: string, courseId = course.id) => prisma.teeTime.create({ data: { courseId, date: '2031-06-10', time, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0 } });
  const book = (teeTimeId: string, name: string, players: number, status = 'confirmed') => prisma.booking.create({ data: {
    teeTimeId, courseId: course.id, golferName: name, golferEmail: `${TAG}@test.local`, players, greenFeeTotal: 5000 * players, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 5000 * players, status, paymentStatus: 'card_on_file',
  } });

  const empty = await tt('08:00'), booked = await tt('08:10'), done = await tt('08:20'), cancelled = await tt('08:30'), two = await tt('08:40');
  await book(booked.id, 'Smith', 4);
  await book(done.id, 'Lee', 2, 'completed');
  await book(cancelled.id, 'Gone', 3, 'cancelled');
  await book(two.id, 'Ortiz', 2); await book(two.id, 'Kim', 1); await book(two.id, 'Ng', 1);

  // Close
  const c1 = await closeFreeTime(course.id, booked.id);
  ok('closing a time with a group booked is a 409 that names them', !c1.ok && c1.status === 409 && c1.error.includes('Smith (4)') && c1.error.includes('Move or cancel it before you close'), c1);
  ok('…and the time stays open', (await prisma.teeTime.findUnique({ where: { id: booked.id } }))?.status !== 'blocked');
  const c2 = await closeFreeTime(course.id, done.id);
  ok('a checked-in group counts as booked', !c2.ok && c2.status === 409 && c2.error.includes('Lee (2)'), c2);
  ok('a time with only a cancelled booking can be closed', (await closeFreeTime(course.id, cancelled.id)).ok && (await prisma.teeTime.findUnique({ where: { id: cancelled.id } }))?.status === 'blocked');
  ok('an empty time can be closed', (await closeFreeTime(course.id, empty.id)).ok && (await prisma.teeTime.findUnique({ where: { id: empty.id } }))?.status === 'blocked');
  const c3 = await closeFreeTime(course.id, two.id);
  ok('several groups: two names and "1 more"', !c3.ok && c3.error.includes('3 groups booked') && c3.error.includes('Ortiz (2), Kim (1) and 1 more') && c3.error.includes('Move or cancel them'), c3);
  const other1 = await tt('09:00', other.id);
  const c4 = await closeFreeTime(course.id, other1.id);
  ok('another course\'s time is not found (scoped to the course)', !c4.ok && c4.status === 404, c4);

  // Hide online
  const h1 = await setStaffOnly(course.id, booked.id, true);
  ok('hiding a booked time online is a 409', !h1.ok && h1.status === 409 && h1.error.includes('before you hide'), h1);
  ok('…and it stays online', !(await prisma.teeTime.findUnique({ where: { id: booked.id } }))?.staffOnly);
  await prisma.teeTime.update({ where: { id: booked.id }, data: { staffOnly: true } });
  ok('showing a booked time online again is always allowed', (await setStaffOnly(course.id, booked.id, false)).ok && !(await prisma.teeTime.findUnique({ where: { id: booked.id } }))?.staffOnly);
  ok('an empty time can be hidden', (await setStaffOnly(course.id, empty.id, true)).ok);

  // Delete
  ok('deleting a booked time is refused with who is on it', (await deleteRefusal(course.id, booked.id))?.includes('before you delete') === true);
  ok('…an empty time is not refused here', (await deleteRefusal(course.id, empty.id)) === null);
  ok('the wording', refusal('close', [{ golferName: 'Smith', players: 4 }]) === 'This time has a group booked — Smith (4). Move or cancel it before you close the time.');

  // The route and the card.
  const route = read('src/app/api/operator/tee-times/route.ts');
  ok('PATCH closes through the guard', route.includes("if (status === 'blocked') {\n    const r = await closeFreeTime(session.courseId, String(id));"));
  ok('PATCH hides through the guard', route.includes('const r = await setStaffOnly(session.courseId, String(id), staffOnly);'));
  ok('DELETE refuses a booked time through the guard', route.includes('const refused = await deleteRefusal(session.courseId, String(id));'));
  ok('the seat stepper is untouched (SEATS-1)', route.includes('const r = await setSeatsClosed(session.courseId, String(id), seatsClosed);'));
  const page = read('src/app/dashboard/page.tsx');
  // TT-CARD: the five day numbers are separate cards; Not paid yet is red when anything is owed (was amber on "past").
  ok('the day strip is a grid of separate cards', page.includes("<div className={'grid gap-3 grid-cols-2 sm:grid-cols-3 ' +") && (page.slice(page.indexOf('DENSE-4b: the day strip'), page.indexOf('{sheetError && <LoadError')).match(/<div className=\{CARD \+ ' px-4 py-3'\}>/g) ?? []).length === 6);
  ok('Not paid yet is red when anything is owed', page.includes("(dayMoney.outstandingCents > 0 ? 'text-bad' : 'text-ink')}>${(dayMoney.outstandingCents"));
  ok('PATCH close returns the guarded row, never a second unconditional write', read('src/app/api/operator/tee-times/route.ts').includes('const closed = await prisma.teeTime.findFirst(') && read('src/app/api/operator/tee-times/route.ts').includes('setTeeTimeBlocked(id, false,'));
  ok('the guard is one Serializable transaction (as claimTeeTime)', read('src/lib/tee-time-close.ts').includes("{ isolationLevel: 'Serializable' }") && read('src/lib/tee-time-close.ts').includes("=== 'P2034'"));
  // Build 2026-11-12: today's seat stepper and the undo rows stay; Delete shows only on an empty time.
  ok('the card offers Delete only on a time with nobody booked', page.includes('const nobodyBooked = !(panelSlot.bookings ?? []).some(b => b.status === \'confirmed\' || b.status === \'completed\');') && page.includes("{nobodyBooked && access.can('sheet.edit_times') && !past && !panelSlot.event && ("));
  ok('no Close this time / Hide online buttons came back; the seat stepper and undo rows stay', !page.includes('>Close this time<') && !page.includes('>Hide online<') && page.includes('setSeatsClosed(panelSlot, closed + 1)') && page.includes('Closed · reopen this time') && page.includes('Hidden online · show it'));
  ok('every staff message that names the button says "Undo no-show"', ['src/app/api/operator/bookings/route.ts', 'src/app/dashboard/settings/page.tsx', 'src/lib/move-booking.ts', 'src/lib/booking-residents.ts', 'src/lib/checkout-extras.ts', 'src/lib/split-booking.ts', 'src/lib/no-show-fee.ts', 'src/lib/staff-permissions.ts', 'src/lib/birdie/knowledge-operator.ts'].every(f => /Undo no-show/.test(read(f)) && !/['`][^'`\n]*(“Still coming”|"Still coming"|“still coming”)[^'`\n]*['`]/.test(read(f))));
  ok('no "Add a walk-in who already played" button; LATE-ADD stays', !page.includes('Add a walk-in who already played') && read('src/app/api/operator/bookings/route.ts').includes('late: body.late === true'));

  await cleanup();
}

main().then(() => { console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); return prisma.$disconnect().then(() => process.exit(failed ? 1 : 0)); })
  .catch(async e => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
