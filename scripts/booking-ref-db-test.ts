// BOOKING-REF (Cam 2026-11-12): every new booking gets a GR-number from a Postgres
// sequence; old ones (ref null) keep the 8-character id; the number finds the booking
// in the course's own search and nowhere else. Pure checks first, then a database.
// Needs a database. Run: npx tsx scripts/booking-ref-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { bookingRefLabel, parseBookingRef, bookingRefFor } from '../src/lib/booking-ref';
import { operatorSearch } from '../src/lib/operator-search';

const TAG = 'bookingrefdbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

// ---- pure ----
check('label: GR-<ref>', bookingRefLabel({ id: 'cmabcdefgh', ref: 1042 }) === 'GR-1042');
check('label: falls back to the 8-character id while ref is null', bookingRefLabel({ id: 'cmabcdefgh', ref: null }) === 'CMABCDEF' && bookingRefLabel({ id: 'cmabcdefgh' }) === 'CMABCDEF');
for (const q of ['GR-1042', 'gr-1042', 'GR1042', 'GR 1042', '#GR-1042', ' gr-1042 ']) check(`parse "${q}" → 1042`, parseBookingRef(q) === 1042);
for (const q of ['1042', 'GR-', 'GR-0', 'GR-12a', 'Greg', 'GR-99999999999', 'GR--1']) check(`parse "${q}" → null`, parseBookingRef(q) === null);

// ---- sources ----
const email = readFileSync('src/lib/email.ts', 'utf8');
check('emails never print the raw booking id', !/Booking ID: \$\{data\.bookingId\}/.test(email) && !/Booking #\$\{data\.bookingId\.slice/.test(email));
check('emails print the GR label', (email.match(/Booking \$\{await bookingRefFor\(data\.bookingId\)\}/g) ?? []).length >= 8);
for (const f of ['src/app/manage/[bookingId]/page.tsx', 'src/app/receipt/[bookingId]/page.tsx']) {
  check(`${f} shows the GR label`, readFileSync(f, 'utf8').includes('bookingRef ??'));
}
const mig = readFileSync('prisma/migrations/20261112000000_booking_ref_expected_launch/migration.sql', 'utf8');
check('migration: the column is added with no default (no backfill), then the default is set', /ADD COLUMN "ref" INTEGER;/.test(mig) && mig.indexOf('ADD COLUMN "ref"') < mig.indexOf('SET DEFAULT nextval') && !/SERIAL|UPDATE "Booking"/i.test(mig));

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
  check('a new booking gets a ref from the sequence', a.booking.ref != null && b.booking.ref != null && b.booking.ref > a.booking.ref, { a: a.booking.ref, b: b.booking.ref });
  check('bookingRefFor reads it', (await bookingRefFor(a.booking.id)) === `GR-${a.booking.ref}`);
  check('bookingRefFor on an unknown id falls back without throwing', (await bookingRefFor('nosuchbooking0')) === 'NOSUCHBO');
  const hit = await operatorSearch(a.course.id, `GR-${a.booking.ref}`, { contact: false, members: false });
  check('the course\'s search finds its booking by GR-number (no contact permission needed)', hit.some(r => r.kind === 'booking' && r.id === a.booking.id && r.ref === `GR-${a.booking.ref}`), hit);
  const other = await operatorSearch(b.course.id, `GR-${a.booking.ref}`, { contact: true, members: true });
  check('another course\'s search does not find it', !other.some(r => r.id === a.booking.id), other);
  let dup = false;
  try { await prisma.booking.update({ where: { id: b.booking.id }, data: { ref: a.booking.ref } }); } catch { dup = true; }
  check('refs are unique', dup);
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });
