// RES-1 (Cam 2026-10-19): resident rates. The pure pricing rules, then against a
// database: staff setting residents at the counter (and every refusal), a move
// re-pricing residents at the new slot, and the resident list's validation.
// Needs a database. Run: npx tsx scripts/residents-test.ts
import { PrismaClient } from '@prisma/client';
import { groupGreenFee, otherPerPlayerCents, cardValidOn, residentInput } from '../src/lib/residents';
import { setBookingResidents } from '../src/lib/booking-residents';
import { moveBooking } from '../src/lib/move-booking';

const prisma = new PrismaClient();
const TAG = 'residentstest';
const STAFF = { type: 'staff' as const, id: null };
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  const bookings = await prisma.booking.findMany({ where: { courseId }, select: { id: true } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: { in: bookings.map(b => b.id) } } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.courseResident.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  // ── Pure rules ─────────────────────────────────────────────────────────────
  check('one resident of four: 1 × resident + 3 × public', groupGreenFee(4, 5000, 1, 3000).greenFeeTotal === 18000);
  check('no resident rate on the tee time: nobody gets it', groupGreenFee(4, 5000, 2, null).greenFeeTotal === 20000 && groupGreenFee(4, 5000, 2, null).residentPlayers === 0);
  check('residents capped at the group size', groupGreenFee(2, 5000, 9, 3000).residentPlayers === 2);
  check('the others\' rate is recovered from the totals', otherPerPlayerCents({ players: 4, greenFeeTotal: 18000, residentPlayers: 1, residentRateCents: 3000 }) === 5000);
  check('all residents: nothing to recover', otherPerPlayerCents({ players: 2, greenFeeTotal: 6000, residentPlayers: 2, residentRateCents: 3000 }) === null);
  check('a card is good through its expiry date, not after', cardValidOn('2026-10-20', '2026-10-20') && !cardValidOn('2026-10-19', '2026-10-20') && cardValidOn('', '2099-01-01'));
  const v = residentInput({ name: '  Jane ', email: 'JANE@X.COM ', expiresOn: '2027-01-01' });
  check('input: trims, lower-cases the email', v.ok && v.value.name === 'Jane' && v.value.email === 'jane@x.com');
  check('input: name required, bad email and bad date refused', !residentInput({}).ok && !residentInput({ name: 'A', email: 'nope' }).ok && !residentInput({ name: 'A', expiresOn: '1/2/27' }).ok);
  check('input: no email = counter only', (() => { const r = residentInput({ name: 'A' }); return r.ok && r.value.email === null; })());

  // ── Database ───────────────────────────────────────────────────────────────
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Res Test', email: `${TAG}@test.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Res ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24 } });
  const course = await mk('a');
  const other = await mk('b');
  const slot = (time: string, resident: number | null, green = 5000) => prisma.teeTime.create({ data: { courseId: course.id, date: '2030-06-04', time, holes: 18, greenFeeCents: green, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0, residentRateCents: resident } });
  const book = async (teeTimeId: string, o: { players?: number; rate?: string; paymentStatus?: string; extra?: object } = {}) => {
    const players = o.players ?? 4;
    await prisma.teeTime.update({ where: { id: teeTimeId }, data: { playersBooked: { increment: players } } });
    return prisma.booking.create({ data: {
      teeTimeId, courseId: course.id, golferName: 'Res Golfer', golferEmail: `${TAG}@test.local`, players,
      greenFeeTotal: 5000 * players, accessFeeTotal: 150 * players, totalAmount: 5150 * players,
      status: 'confirmed', paymentStatus: o.paymentStatus ?? 'card_on_file', appliedRate: o.rate ?? 'standard', ...(o.extra ?? {}),
    } });
  };
  const bk = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id } });

  const t1 = await slot('08:00', 3000);
  const g = await book(t1.id);
  const r1 = await setBookingResidents(course.id, g.id, 2, STAFF);
  const b1 = await bk(g.id);
  check('staff set 2 residents: green 2×30 + 2×50, total follows', r1.ok && b1.greenFeeTotal === 16000 && b1.totalAmount === 16000 + 600 && b1.residentPlayers === 2 && b1.residentRateCents === 3000 && b1.appliedRate === 'resident', b1);
  const ev = await prisma.bookingEvent.findFirst({ where: { bookingId: g.id, type: 'price_changed' } });
  check('the change is recorded as an event', !!ev);
  const r2 = await setBookingResidents(course.id, g.id, 0, STAFF);
  const b2 = await bk(g.id);
  check('back to 0: the original price exactly', r2.ok && b2.greenFeeTotal === 20000 && b2.totalAmount === 20600 && b2.residentPlayers === 0 && b2.appliedRate === 'standard', b2);
  check('another course cannot touch it', !(await setBookingResidents(other.id, g.id, 1, STAFF)).ok);
  check('more residents than players refused', !(await setBookingResidents(course.id, g.id, 5, STAFF)).ok);

  const member = await book((await slot('08:10', 3000)).id, { rate: 'Gold' });
  const rm = await setBookingResidents(course.id, member.id, 1, STAFF);
  check('a member-rate group is refused (no stacking)', !rm.ok && rm.status === 409);
  const paid = await book((await slot('08:20', 3000)).id, { paymentStatus: 'paid', extra: { roundPaymentIntentId: 'pi_x' } });
  check('a paid round is refused', !(await setBookingResidents(course.id, paid.id, 1, STAFF)).ok);
  const cash = await book((await slot('08:30', 3000)).id, { extra: { paidOffline: true, paymentStatus: 'paid_offline' } });
  check('a round paid at the counter is refused', !(await setBookingResidents(course.id, cash.id, 1, STAFF)).ok);
  const noRate = await book((await slot('08:40', null)).id);
  const rn = await setBookingResidents(course.id, noRate.id, 1, STAFF);
  check('a tee time with no resident price is refused, saying so', !rn.ok && /no resident price/.test(rn.error));

  // A kept booked price survives a schedule change: the others keep what they were booked at.
  const t2 = await slot('09:00', 3000, 6000);
  const kept = await book(t2.id, { players: 3 }); // booked at 50 each though the slot now says 60
  await setBookingResidents(course.id, kept.id, 1, STAFF);
  const bk3 = await bk(kept.id);
  check('non-residents keep their booked rate (2×50 + 30)', bk3.greenFeeTotal === 13000, bk3.greenFeeTotal);

  // Move with the new slot's price: residents pay the new slot's resident rate.
  const t3 = await slot('10:00', 3500, 5500);
  const mv = await moveBooking({ bookingId: kept.id, newTeeTimeId: t3.id, courseId: course.id, pricing: 'new_slot', actor: STAFF });
  const bk4 = await bk(kept.id);
  check('moved at the new slot\'s rate: 1×35 + 2×55', mv.ok && bk4.greenFeeTotal === 3500 + 11000 && bk4.residentPlayers === 1 && bk4.residentRateCents === 3500, bk4);
  const t4 = await slot('11:00', null, 5500);
  await moveBooking({ bookingId: kept.id, newTeeTimeId: t4.id, courseId: course.id, pricing: 'new_slot', actor: STAFF });
  const bk5 = await bk(kept.id);
  check('moved to a slot with no resident price: everyone pays public, residents cleared', bk5.greenFeeTotal === 16500 && bk5.residentPlayers === 0 && bk5.residentRateCents === null, bk5);

  // The list: one email per course, any number of counter-only residents.
  await prisma.courseResident.create({ data: { courseId: course.id, name: 'A', email: 'a@x.com' } });
  let dup = false;
  try { await prisma.courseResident.create({ data: { courseId: course.id, name: 'A2', email: 'a@x.com' } }); } catch { dup = true; }
  check('one resident per email per course', dup);
  await prisma.courseResident.create({ data: { courseId: other.id, name: 'A', email: 'a@x.com' } });
  await prisma.courseResident.create({ data: { courseId: course.id, name: 'B', email: null } });
  await prisma.courseResident.create({ data: { courseId: course.id, name: 'C', email: null } });
  check('the same email at another course, and many counter-only residents, are fine', (await prisma.courseResident.count({ where: { name: { in: ['B', 'C'] } } })) === 2);

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}

main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
