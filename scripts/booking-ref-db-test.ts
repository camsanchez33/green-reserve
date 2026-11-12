// BOOKING-REF (Cam 2026-11-12): every new booking gets a GR-number from a Postgres
// sequence; old ones (ref null) keep the 8-character id; the number finds the booking
// in the course's own search and nowhere else. Pure checks first, then a database.
// Needs a database. Run: npx tsx scripts/booking-ref-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { bookingRefLabel, courseRefLabel, parseRef, bookingRefFor } from '../src/lib/booking-ref';
import { operatorSearch } from '../src/lib/operator-search';

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
check('migration: course number column added with no default (no backfill), then the default set', mig.indexOf('ADD COLUMN "number" INTEGER;') >= 0 && mig.indexOf('ADD COLUMN "number"') < mig.indexOf('SET DEFAULT nextval') && !/SERIAL|UPDATE "Booking" SET|UPDATE "Course" SET "number"/i.test(mig));
check('migration: the booking number comes from a BEFORE INSERT trigger on the course counter', /BEFORE INSERT ON "Booking"/.test(mig) && /SET "bookingRefSeq" = "bookingRefSeq" \+ 1/.test(mig));

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
  const ca = await prisma.course.findUniqueOrThrow({ where: { id: a.course.id }, select: { number: true, bookingRefSeq: true } });
  const cb = await prisma.course.findUniqueOrThrow({ where: { id: b.course.id }, select: { number: true } });
  check('a new course gets a number from the sequence', ca.number != null && cb.number != null && cb.number > ca.number, { ca, cb });
  check('each course numbers its bookings from 1', a.booking.ref === 1 && b.booking.ref === 1 && ca.bookingRefSeq === 1, { a: a.booking.ref, b: b.booking.ref });
  check('bookingRefFor reads it', (await bookingRefFor(a.booking.id)) === `GR${ca.number}-1`);
  check('bookingRefFor on an unknown id falls back without throwing', (await bookingRefFor('nosuchbooking0')) === 'NOSUCHBO');

  // Concurrency: 25 inserts at once on one course → 2..26, no duplicates, no gaps.
  const tt = await prisma.teeTime.findFirstOrThrow({ where: { courseId: a.course.id } });
  const row = (i: number) => ({ teeTimeId: tt.id, courseId: a.course.id, golferName: `Par ${i}`, golferEmail: `${TAG}-p${i}@test.local`, players: 1, greenFeeTotal: 0, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 0, status: 'confirmed', paymentStatus: 'manual' });
  const made = await Promise.all(Array.from({ length: 25 }, (_, i) => prisma.booking.create({ data: row(i), select: { ref: true } })));
  const refs = made.map(m => m.ref!).sort((x, y) => x - y);
  check('25 concurrent bookings on one course: numbers 2–26, none twice', JSON.stringify(refs) === JSON.stringify(Array.from({ length: 25 }, (_, i) => i + 2)), refs);
  // A rolled-back insert gives its number back.
  await prisma.$transaction(async tx => { await tx.booking.create({ data: row(99) }); throw new Error('rollback'); }).catch(() => {});
  const next = await prisma.booking.create({ data: row(100), select: { ref: true } });
  check('a rolled-back booking leaves no gap', next.ref === 27, next.ref);
  // A value a caller sends is ignored — the counter is the only source.
  const forced = await prisma.booking.create({ data: { ...row(101), ref: 1 }, select: { ref: true } });
  check('a ref sent by the caller is replaced by the counter', forced.ref === 28, forced.ref);
  // createMany too (sample data uses it).
  await prisma.booking.createMany({ data: [row(102), row(103)] });
  const last = await prisma.booking.findMany({ where: { courseId: a.course.id, golferName: { in: ['Par 102', 'Par 103'] } }, select: { ref: true } });
  check('createMany numbers each row', last.map(l => l.ref).sort().join() === '29,30', last);

  const label = `GR${ca.number}-1`;
  for (const q of [label, label.toLowerCase(), `${ca.number}-1`]) {
    const hit = await operatorSearch(a.course.id, q, { contact: false, members: false });
    check(`the course's search finds its booking by "${q}" (no contact permission needed)`, hit.some(r => r.kind === 'booking' && r.id === a.booking.id && r.ref === label), hit);
  }
  const other = await operatorSearch(b.course.id, label, { contact: true, members: true });
  check('another course\'s search does not find it', !other.some(r => r.id === a.booking.id), other);
  const otherOwn = await operatorSearch(b.course.id, `GR${cb.number}-1`, { contact: false, members: false });
  check('…and its own GR number finds its own booking, not course A\'s', otherOwn.some(r => r.id === b.booking.id) && !otherOwn.some(r => r.id === a.booking.id), otherOwn);
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });
