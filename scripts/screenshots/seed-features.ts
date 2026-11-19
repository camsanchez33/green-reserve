// Homepage feature pages (Cam 2026-11-18): adds what the seven feature pages photograph to the screenshot
// course that scripts/screenshots/seed.ts makes. Run it right after that seed, before capture-features.ts.
// LOCAL DATABASES ONLY — it refuses any other host. Fictional names only.
//
//   DATABASE_URL=postgresql://…@localhost:…/… npx tsx scripts/screenshots/seed-features.ts
//
// - the money ledger for every paid round (Revenue and Analytics read the ledger, not the bookings),
//   written through recordMove() like the real check-in;
// - three memberships with members in every dues state, and residents;
// - a league, a tournament with sign-up open, and an outing, made by createEvent() as the dashboard does;
// - roles from the Suggested list (createRole) and a small staff.
import { prisma } from '../../src/lib/prisma';
import { recordMove } from '../../src/lib/money-ledger';
import { todayIn } from '../../src/lib/course-time';
import { createEvent } from '../../src/lib/course-events';
import { createRole } from '../../src/lib/team';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) { console.error('Refusing: the screenshot seed only runs against a local database.'); process.exit(1); }

const SLUG = 'greenreserve-test-course';
const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const course = await prisma.course.findUniqueOrThrow({ where: { slug: SLUG }, include: { operator: true } });
  const today = todayIn(course.timezone);
  const actor = 'Dana Whitfield';

  // ── The ledger: one row per paid round, as the check-in records it. ──
  await prisma.moneyMove.deleteMany({ where: { courseId: course.id } });
  const paid = await prisma.booking.findMany({ where: { courseId: course.id, paidAt: { not: null } }, select: { id: true, totalAmount: true, accessFeeTotal: true, source: true, paidAt: true } });
  for (const b of paid) {
    await recordMove({ courseId: course.id, what: 'round', direction: 'in', method: b.source === 'online' ? 'card' : 'cash', account: 'course',
      amountCents: b.totalAmount, platformFeeCents: b.accessFeeTotal, bookingId: b.id, at: b.paidAt!, actor: 'seed' });
  }

  // ── Memberships ──
  await prisma.courseMembership.deleteMany({ where: { courseId: course.id } });
  await prisma.membershipTier.deleteMany({ where: { courseId: course.id } });
  await prisma.courseResident.deleteMany({ where: { courseId: course.id } });
  const TIERS = [
    { name: 'Full Member', color: '#1b4332', annualFeeCents: 240000, greenFeeWeekdayCents: 0, greenFeeWeekendCents: 0, advanceBookingDays: 14 },
    { name: 'Senior', color: '#7a4f12', annualFeeCents: 160000, greenFeeWeekdayCents: 1500, greenFeeWeekendCents: 2500, advanceBookingDays: 10 },
    { name: 'Junior', color: '#2f6696', annualFeeCents: 45000, greenFeeWeekdayCents: 1000, greenFeeWeekendCents: 2000, advanceBookingDays: 7 },
  ];
  const PEOPLE = ['Marcus Bell', 'Priya Raman', 'Tom Kowalski', 'Grace Okafor', 'Kevin Brandt', 'Erin Gallagher', 'Sam Teixeira', 'Nora Lindqvist',
    'Jamal Price', 'Hannah Mercer', 'Owen Fitzgerald', 'Rosa Delgado', 'Brian Novak', 'Mei Tanaka', 'Chris Albright'];
  const STATES = ['paid', 'paid', 'paid', 'paid_offline', 'unpaid', 'paid'];
  let n = 0;
  for (const [ti, t] of TIERS.entries()) {
    const tier = await prisma.membershipTier.create({ data: { courseId: course.id, ...t, numberPrefix: t.name[0], autoRenew: ti === 0 } });
    const count = ti === 0 ? 7 : ti === 1 ? 5 : 3;
    for (let i = 0; i < count; i++, n++) {
      const name = PEOPLE[n % PEOPLE.length];
      const status = STATES[(n * 5 + ti) % STATES.length];
      const paidAt = status === 'unpaid' ? null : new Date(`${addDays(today, -40 - n * 9)}T15:00:00Z`);
      const m = await prisma.courseMembership.create({ data: {
        courseId: course.id, tierId: tier.id, membershipType: t.name, inviteName: name, inviteAccepted: true,
        inviteEmail: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, status: 'active', addedBy: 'operator',
        startedAt: new Date(`${addDays(today, -200 - n * 5)}T12:00:00Z`), paymentStatus: status, lastPaidAt: paidAt,
        expiresAt: status === 'unpaid' ? new Date(`${addDays(today, -6 - n)}T12:00:00Z`) : new Date(`${addDays(today, 300 - n * 7)}T12:00:00Z`),
        memberNumber: `${t.name[0]}${100 + i}`,
      } });
      if (status !== 'unpaid' && paidAt) {
        await recordMove({ courseId: course.id, what: 'dues', direction: 'in', method: status === 'paid' ? 'card' : 'cash', account: 'course', amountCents: t.annualFeeCents, membershipId: m.id, at: paidAt, actor: 'seed' });
      }
    }
  }
  await prisma.teeTimeSchedule.updateMany({ where: { courseId: course.id }, data: { residentRateWeekdayCents: 3500, residentRateWeekendCents: 4500 } });
  for (const name of ['Leah Moreau', 'Victor Danforth', 'Tessa Castellano', 'Andre Whitaker']) {
    await prisma.courseResident.create({ data: { courseId: course.id, name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, cardNumber: `R-${name.length}0${name.charCodeAt(0)}`, addedBy: actor } });
  }

  // ── Events ──
  const old = await prisma.courseEvent.findMany({ where: { courseId: course.id }, select: { id: true } });
  if (old.length) {
    await prisma.teeTime.updateMany({ where: { eventId: { in: old.map(e => e.id) } }, data: { eventId: null } });
    await prisma.courseEventPlayer.deleteMany({ where: { eventId: { in: old.map(e => e.id) } } });
    await prisma.courseEventTask.deleteMany({ where: { eventId: { in: old.map(e => e.id) } } });
    await prisma.courseEvent.deleteMany({ where: { courseId: course.id } });
  }
  const league = (await createEvent(course.id, { name: 'Thursday Night League', kind: 'league', date: addDays(today, 7), format: 'tee_times', startTime: '16:00', holes: 9, groups: 6,
    players: 24, payer: 'players', pricePerPlayer: 25, includes: ['Nine holes', 'Cart'] }, actor)).event;
  const cup = (await createEvent(course.id, { name: 'Club Championship', kind: 'tournament', date: addDays(today, 18), format: 'shotgun', startTime: '08:00', holes: 18, groups: 18,
    players: 72, payer: 'players', pricePerPlayer: 85, includes: ['Eighteen holes', 'Cart', 'Lunch', 'Prizes'] }, actor)).event;
  const outing = (await createEvent(course.id, { name: 'Warwick Rotary Outing', kind: 'outing', date: addDays(today, 25), format: 'shotgun', startTime: '09:00', holes: 18, groups: 20,
    players: 80, payer: 'organizer', organizerName: 'Joan Haas', organizerEmail: 'joan.haas@example.com', pricePerPlayer: 95, includes: ['Eighteen holes', 'Cart', 'Dinner'], guaranteeDaysBefore: 10 }, actor)).event;
  await prisma.courseEvent.update({ where: { id: cup.id }, data: { signupOpen: true, signupPay: 'now', status: 'planned' } });
  const ENTRANTS = ['Pete Burke', 'Alicia Shah', 'Derek Doyle', 'Maggie Abernathy', 'Hector Haas', 'Wendy Moreau', 'Ray Price', 'Kelly Novak', 'Luis Ortega', 'Dana Ruiz', 'Victor Bell', 'Joan Mercer'];
  for (const [ev, take] of [[league, 10], [cup, 12], [outing, 0]] as const) {
    for (let i = 0; i < take; i++) {
      const name = ENTRANTS[(i + (ev === league ? 3 : 0)) % ENTRANTS.length];
      await prisma.courseEventPlayer.create({ data: { eventId: ev.id, name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`, groupNo: Math.floor(i / 4) + 1, source: i % 3 ? 'signup' : 'staff', sortOrder: i } });
    }
  }
  const firstTasks = await prisma.courseEventTask.findMany({ where: { eventId: cup.id }, orderBy: { sortOrder: 'asc' }, take: 2 });
  for (const t of firstTasks) await prisma.courseEventTask.update({ where: { id: t.id }, data: { doneAt: new Date(), doneBy: actor } });

  // ── Team ──
  await prisma.courseStaff.deleteMany({ where: { courseId: course.id } });
  await prisma.courseRole.deleteMany({ where: { courseId: course.id } });
  const ctx = { courseId: course.id, operatorId: course.operator!.id, req: null };
  const roles: Record<string, string> = {};
  for (const key of ['manager', 'front_desk', 'starter']) {
    const r = await createRole(ctx, { suggestedKey: key });
    if (!r.ok) throw new Error(`role ${key}: ${r.error}`);
    roles[key] = r.role.id;
  }
  const STAFF: [string, string, number][] = [['Owen Fitzgerald', 'manager', 1], ['Rosa Delgado', 'front_desk', 0], ['Sam Teixeira', 'front_desk', 3], ['Brian Novak', 'starter', 26]];
  for (const [name, role, hoursAgo] of STAFF) {
    await prisma.courseStaff.create({ data: {
      courseId: course.id, name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@staff.example.com`, password: '!seed-no-login', roleId: roles[role],
      passwordSetAt: new Date(`${addDays(today, -60)}T12:00:00Z`), lastActiveAt: new Date(Date.now() - hoursAgo * 3_600_000),
    } });
  }
  console.log(JSON.stringify({ ledger: paid.length, events: [league.id, cup.id, outing.id], roles: Object.keys(roles).length }));
}

main().then(() => prisma.$disconnect()).catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
