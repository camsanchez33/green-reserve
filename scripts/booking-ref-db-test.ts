// BOOKING-REF (Cam 2026-11-12): every new booking gets a GR-number from a Postgres
// sequence; old ones (ref null) keep the 8-character id; the number finds the booking
// in the course's own search and nowhere else. Pure checks first, then a database.
// Needs a database. Run: npx tsx scripts/booking-ref-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { bookingRefLabel, courseRefLabel, parseRef, bookingRefFor } from '../src/lib/booking-ref';
import { operatorSearch } from '../src/lib/operator-search';
import { claimTeeTime } from '../src/lib/claim-tee-time';

const TAG = 'bookingrefdbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

// ---- pure ----
check('label: GR<course>-<ref>', bookingRefLabel({ id: 'cmabcdefgh', ref: 17, course: { number: 4 } }) === 'GR4-17' && bookingRefLabel({ id: 'cmabcdefgh', ref: 17 }, 4) === 'GR4-17');
check('label: falls back to the 8-character id while either number is null', bookingRefLabel({ id: 'cmabcdefgh', ref: null, course: { number: 4 } }) === 'CMABCDEF' && bookingRefLabel({ id: 'cmabcdefgh', ref: 17, course: { number: null } }) === 'CMABCDEF' && bookingRefLabel({ id: 'cmabcdefgh' }) === 'CMABCDEF');
check('course label', courseRefLabel({ number: 4 }) === 'GR4' && courseRefLabel({ number: null }) === null);
for (const q of ['GR4-17', 'gr4-17', '4-17', 'GR 4-17', '#GR4-17', ' gr4 - 17 ']) check(`parse "${q}" → booking 4/17`, JSON.stringify(parseRef(q)) === '{"course":4,"ref":17}', parseRef(q));
for (const q of ['GR4', 'gr4', 'GR 4']) check(`parse "${q}" → course 4`, JSON.stringify(parseRef(q)) === '{"course":4,"ref":null}', parseRef(q));
for (const q of ['4', '17', 'GR-', 'GR0', 'GR4-0', 'GR4-1a', 'Greg', 'GR99999999999', '4-17-2', '555-1234x']) check(`parse "${q}" → null`, parseRef(q) === null, parseRef(q));

// ---- sources ----
const email = readFileSync('src/lib/email.ts', 'utf8');
check('emails never print the raw booking id', !/Booking ID: \$\{data\.bookingId\}/.test(email) && !/Booking #\$\{data\.bookingId\.slice/.test(email));
check('emails print the GR label', (email.match(/Booking \$\{await bookingRefFor\(data\.bookingId\)\}/g) ?? []).length >= 8);
for (const f of ['src/app/manage/[bookingId]/page.tsx', 'src/app/receipt/[bookingId]/page.tsx']) {
  check(`${f} shows the GR label`, readFileSync(f, 'utf8').includes('bookingRef ??'));
}
const mig = readFileSync('prisma/migrations/20261112010000_booking_ref_expected_launch/migration.sql', 'utf8');
check('migration: course number is max+1 under an advisory lock (no sequence, no backfill)', /ADD COLUMN "number" INTEGER;/.test(mig) && /pg_advisory_xact_lock/.test(mig) && /COALESCE\(MAX\("number"\), 0\) \+ 1/.test(mig) && !/Course_number_seq|\bSERIAL\b|UPDATE "Booking" SET|UPDATE "Course" SET/.test(mig));
check('migration: the booking number comes from the course\'s own sequence (no shared row written — no serialization conflicts)', /BEFORE INSERT ON "Booking"/.test(mig) && /nextval\("bookref_seq"\(NEW\."courseId"\)\)/.test(mig) && !/bookingRefSeq/.test(mig));

// ---- database ----
async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function seed(n: string) {
  const op = await prisma.courseOperator.create({ data: { name: `Op ${n}`, email: `${TAG}-${n}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: {
    name: `${TAG} ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18,
    liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24,
  } });
  const date = new Date().toISOString().slice(0, 10);
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date, time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2, status: 'available' } });
  const b = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: course.id, golferName: `Zed ${n}`, golferEmail: `${TAG}-${n}@test.local`, players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 10000, status: 'confirmed', paymentStatus: 'manual' } });
  return { course, booking: b };
}

async function main() {
  const a = await seed('a');
  const b = await seed('b');
  const ca = await prisma.course.findUniqueOrThrow({ where: { id: a.course.id }, select: { number: true } });
  const cb = await prisma.course.findUniqueOrThrow({ where: { id: b.course.id }, select: { number: true } });
  check('a new course gets the next number', ca.number != null && cb.number === ca.number + 1, { ca, cb });
  // Course numbers never skip (Cam 2026-11-12): concurrent creations, and one that rolls back.
  {
    const before = (await prisma.course.aggregate({ _max: { number: true } }))._max.number ?? 0;
    const ROLL = new Error('rollback');
    await prisma.$transaction(async tx => {
      const op = await tx.courseOperator.create({ data: { name: 'Roll', email: `${TAG}-roll@test.local`, password: 'x' } });
      await tx.course.create({ data: { name: 'Roll', slug: `${TAG}-roll`, operatorId: op.id, address: '1', city: 'T', state: 'CA', zipCode: '90210', holes: 18 } });
      throw ROLL;
    }).catch(e => { if (e !== ROLL) throw e; });
    const made = await Promise.all(Array.from({ length: 8 }, async (_, i) => {
      const op = await prisma.courseOperator.create({ data: { name: `C${i}`, email: `${TAG}-c${i}@test.local`, password: 'x' } });
      return prisma.course.create({ data: { name: `${TAG} c${i}`, slug: `${TAG}-c${i}`, operatorId: op.id, address: '1', city: 'T', state: 'CA', zipCode: '90210', holes: 18 }, select: { number: true } });
    }));
    const nums = made.map(m => m.number!).sort((x, y) => x - y);
    check('8 courses created at once after a rolled-back one: the next 8 numbers, none skipped or repeated', JSON.stringify(nums) === JSON.stringify(Array.from({ length: 8 }, (_, i) => before + 1 + i)), { before, nums });
  }
  check('each course numbers its bookings from 1', a.booking.ref === 1 && b.booking.ref === 1, { a: a.booking.ref, b: b.booking.ref });
  check('bookingRefFor reads it', (await bookingRefFor(a.booking.id)) === `GR${ca.number}-1`);
  check('bookingRefFor on an unknown id falls back without throwing', (await bookingRefFor('nosuchbooking0')) === 'NOSUCHBO');

  const tt = await prisma.teeTime.findFirstOrThrow({ where: { courseId: a.course.id } });
  const row = (courseId: string, teeTimeId: string, i: number) => ({ teeTimeId, courseId, golferName: `Par ${i}`, golferEmail: `${TAG}-p${i}@test.local`, players: 1, greenFeeTotal: 0, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 0, status: 'confirmed', paymentStatus: 'manual' });
  // Plain inserts at once on one course → 2..26, none twice.
  const made = await Promise.all(Array.from({ length: 25 }, (_, i) => prisma.booking.create({ data: row(a.course.id, tt.id, i), select: { ref: true } })));
  const refs = made.map(m => m.ref!).sort((x, y) => x - y);
  check('25 concurrent bookings on one course: numbers 2–26, none twice', JSON.stringify(refs) === JSON.stringify(Array.from({ length: 25 }, (_, i) => i + 2)), refs);
  const forced = await prisma.booking.create({ data: { ...row(a.course.id, tt.id, 101), ref: 1 }, select: { ref: true } });
  check('a ref sent by the caller is replaced by the sequence', forced.ref === 27, forced.ref);
  await prisma.booking.createMany({ data: [row(a.course.id, tt.id, 102), row(a.course.id, tt.id, 103)] });
  const last = await prisma.booking.findMany({ where: { courseId: a.course.id, golferName: { in: ['Par 102', 'Par 103'] } }, select: { ref: true } });
  check('createMany numbers each row', last.map(l => l.ref).sort().join() === '28,29', last);

  // Numbering must never make a Serializable booking fail (final review, PR B). Pinned
  // deterministically, not by a rate (a rate depends on autovacuum and the plan): T2 takes its
  // snapshot, T1 books at the same course (or another) and commits, then T2 books a DIFFERENT
  // tee time. With the old counter-row trigger T2 failed with P2034 every time.
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const slot = (courseId: string, time: string) => prisma.teeTime.create({ data: { courseId, date, time, holes: 18, greenFeeCents: 0, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0, status: 'available' }, select: { id: true } });
  const interleave = async (first: { c: string; tt: string }, second: { c: string; tt: string }) => {
    let release!: () => void; const gate = new Promise<void>(r => { release = r; });
    let ready!: () => void; const snap = new Promise<void>(r => { ready = r; });
    const t2 = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1`; ready(); await gate;
      return tx.booking.create({ data: row(second.c, second.tt, 802), select: { ref: true } });
    }, { isolationLevel: 'Serializable', timeout: 20_000 }).then(v => ({ ok: true, ref: v.ref, code: null as string | null }), (e: { code?: string }) => ({ ok: false, ref: null, code: e?.code ?? 'error' }));
    await snap;
    const t1 = await prisma.$transaction(tx => tx.booking.create({ data: row(first.c, first.tt, 801), select: { ref: true } }), { isolationLevel: 'Serializable' });
    release();
    return { t1: t1.ref, t2: await t2 };
  };
  const [a1, a2, b1] = await Promise.all([slot(a.course.id, '08:00'), slot(a.course.id, '08:10'), slot(b.course.id, '08:00')]);
  const same = await interleave({ c: a.course.id, tt: a1.id }, { c: a.course.id, tt: a2.id });
  check('a Serializable booking is not failed by another at the same course committing first', same.t2.ok && same.t1 != null && same.t2.ref != null && same.t2.ref !== same.t1, same);
  const across = await interleave({ c: a.course.id, tt: a1.id }, { c: b.course.id, tt: b1.id });
  check('…nor by one at another course', across.t2.ok && across.t2.ref != null, across);

  // A test-course reset starts its numbers at 1 again.
  await prisma.$queryRaw`SELECT setval("bookref_seq"(${b.course.id}), 1, false)`;
  await prisma.booking.delete({ where: { id: b.booking.id } });
  const again = await prisma.booking.create({ data: row(b.course.id, (await prisma.teeTime.findFirstOrThrow({ where: { courseId: b.course.id } })).id, 500), select: { id: true, ref: true } });
  check('the sequence restart gives number 1 again', again.ref === 1, again.ref);
  b.booking = { ...b.booking, id: again.id, ref: again.ref } as typeof b.booking;

  const label = `GR${ca.number}-1`;
  for (const q of [label, label.toLowerCase(), `${ca.number}-1`]) {
    const hit = await operatorSearch(a.course.id, q, { contact: false, members: false });
    check(`the course's search finds its booking by "${q}" (no contact permission needed)`, hit.some(r => r.kind === 'booking' && r.id === a.booking.id && r.ref === label), hit);
  }
  // An exact GR number finds a booking older than the 60-day name window; a name search doesn't.
  const oldTt = await prisma.teeTime.create({ data: { courseId: a.course.id, date: '2025-01-15', time: '08:00', holes: 18, greenFeeCents: 0, cartFeeCents: 0, playersAvailable: 4, playersBooked: 1, status: 'available' } });
  const old = await prisma.booking.create({ data: { ...row(a.course.id, oldTt.id, 900), golferName: 'Zed Oldtimer' }, select: { id: true, ref: true } });
  const oldHit = await operatorSearch(a.course.id, `GR${ca.number}-${old.ref}`, { contact: false, members: false });
  check('an exact GR number finds a booking from before the 60-day window', oldHit.some(r => r.id === old.id), oldHit);
  check('…while its name alone does not', !(await operatorSearch(a.course.id, 'Zed Oldtimer', { contact: false, members: false })).some(r => r.id === old.id));
  check('…and another course still can\'t find it by that number', !(await operatorSearch(b.course.id, `GR${ca.number}-${old.ref}`, { contact: true, members: true })).some(r => r.id === old.id));
  const other = await operatorSearch(b.course.id, label, { contact: true, members: true });
  check('another course\'s search does not find it', !other.some(r => r.id === a.booking.id), other);
  const otherOwn = await operatorSearch(b.course.id, `GR${cb.number}-1`, { contact: false, members: false });
  check('…and its own GR number finds its own booking, not course A\'s', otherOwn.some(r => r.id === b.booking.id) && !otherOwn.some(r => r.id === a.booking.id), otherOwn);

  // Deleting a course takes its sequence with it.
  const seqBefore = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_class WHERE relkind = 'S' AND relname = ${'bookref_' + b.course.id}`;
  check('a course has its own booking sequence', Number(seqBefore[0].n) === 1);
}

cleanup().then(main).then(cleanup).then(async () => {
    const left = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_class WHERE relkind = 'S' AND relname LIKE ${'bookref_%'} AND relname NOT IN (SELECT 'bookref_' || left(id, 54) FROM "Course")`;
    check('deleted courses leave no booking sequence behind', Number(left[0].n) === 0, left);
  })
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });
