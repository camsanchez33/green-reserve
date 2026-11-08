// SEATS-1 (Cam 2026-11-08: "if they want to close the time they can close it by one individual spot or as many as
// there are"): the time card's Open seats − N + stepper closes open seats one at a time and reopens them; booked
// groups are never touched; closed seats show as grey "Closed" cells; the generator never resizes such a time.
// Source pins always; the DB part runs when DATABASE_URL is set (CI).
// Run: npx tsx scripts/seats-closed-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

const schema = read('prisma/schema.prisma');
const mig = read('prisma/migrations/20261108000000_seats_closed/migration.sql');
const lib = read('src/lib/tee-time-seats.ts');
const route = read('src/app/api/operator/tee-times/route.ts');
const engine = read('src/lib/tee-sheet-engine.ts');
const rows = read('src/components/dashboard/TeeSheetRows.tsx');
const page = read('src/app/dashboard/page.tsx');

ok('TeeTime.seatsClosed, additive with a default', schema.includes('seatsClosed       Int            @default(0)') && mig.includes('ADD COLUMN "seatsClosed" INTEGER NOT NULL DEFAULT 0') && !/DROP|RENAME|ALTER COLUMN/i.test(mig));
ok('the route closes seats through the one lib call, behind sheet.block', route.includes("import { setSeatsClosed } from '@/lib/tee-time-seats';") && route.includes('await setSeatsClosed(session.courseId, String(id), seatsClosed)') && route.includes("requirePermission(session, 'sheet.block')"));
ok('the write re-checks the read (no booking or close in between) and never goes below who is booked', lib.includes('playersAvailable: tt.playersAvailable, seatsClosed: tt.seatsClosed, playersBooked: { lte: available }') && lib.includes('if (want > free)'));
ok('an event time is the event\'s', lib.includes('if (tt.eventId) return { ok: false, status: 409'));
ok('the generator never deletes a time with closed seats', engine.includes('t.seatsClosed === 0 && t._count.bookings === 0') && engine.includes('staffOnly: false, seatsClosed: 0, bookings: { none: {} } }'));
ok('the sheet sizes columns by the whole time and draws closed seats as "Closed"', rows.includes('s.playersAvailable + (s.seatsClosed ?? 0)') && rows.includes('>Closed</span>'));
ok('the card: Open seats − N of M +, − closes, + reopens', page.includes('aria-label="Close a seat"') && page.includes('onClick={() => setSeatsClosed(panelSlot, closed + 1)}') && page.includes('aria-label="Reopen a seat"') && page.includes('onClick={() => setSeatsClosed(panelSlot, closed - 1)}') && page.includes('await loadTimes(selectedDate, true); // quiet'));
ok('the Counter only choice is gone from the card', !page.includes("['counter', 'Counter only']") && !page.includes('timeOpts'));

async function db() {
  const { prisma } = await import('../src/lib/prisma');
  const { setSeatsClosed } = await import('../src/lib/tee-time-seats');
  const TAG = `seats-${Date.now()}`;
  const op = await prisma.courseOperator.create({ data: { name: 'Seats Test', email: `${TAG}@test.local`, password: 'x' } });
  const mkCourse = (slug: string) => prisma.course.create({ data: { name: slug, slug, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18, timezone: 'UTC' } });
  const course = await mkCourse(TAG);
  try {
    let minute = 0;
    const mk = (extra: Record<string, unknown> = {}) => prisma.teeTime.create({ data: { courseId: course.id, date: '2026-11-20', time: `08:${String(minute++).padStart(2, '0')}`, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0, status: 'available', ...extra } as never });
    const t = await mk();
    let r = await setSeatsClosed(course.id, t.id, 1);
    let row = await prisma.teeTime.findUniqueOrThrow({ where: { id: t.id } });
    ok('close one: 3 open, 1 closed', r.ok && row.playersAvailable === 3 && row.seatsClosed === 1 && row.status === 'available');
    r = await setSeatsClosed(course.id, t.id, 4);
    row = await prisma.teeTime.findUniqueOrThrow({ where: { id: t.id } });
    ok('close them all: 0 open, full', r.ok && row.playersAvailable === 0 && row.seatsClosed === 4 && row.status === 'full');
    r = await setSeatsClosed(course.id, t.id, 0);
    row = await prisma.teeTime.findUniqueOrThrow({ where: { id: t.id } });
    ok('reopen all: back to 4', r.ok && row.playersAvailable === 4 && row.seatsClosed === 0 && row.status === 'available');

    const b = await mk({ playersBooked: 2 });
    r = await setSeatsClosed(course.id, b.id, 3);
    ok('a booked seat never closes', !r.ok && r.status === 409);
    r = await setSeatsClosed(course.id, b.id, 2);
    row = await prisma.teeTime.findUniqueOrThrow({ where: { id: b.id } });
    ok('the two open seats around a group close; the time is full', r.ok && row.playersAvailable === 2 && row.seatsClosed === 2 && row.status === 'full');

    const blk = await mk({ status: 'blocked' });
    r = await setSeatsClosed(course.id, blk.id, 1);
    row = await prisma.teeTime.findUniqueOrThrow({ where: { id: blk.id } });
    ok('a blocked time stays blocked', r.ok && row.status === 'blocked' && row.seatsClosed === 1);

    const other = await mkCourse(`${TAG}-o`);
    try { r = await setSeatsClosed(other.id, t.id, 1); ok('another course cannot touch it', !r.ok && r.status === 404); }
    finally { await prisma.course.delete({ where: { id: other.id } }); }

    // The guard's shape: a write keyed on a stale read misses. (The source pin above is what ties setSeatsClosed
    // to this where clause.)
    const race = await prisma.teeTime.updateMany({ where: { id: t.id, playersAvailable: 3, seatsClosed: 0 }, data: { seatsClosed: 1 } });
    ok('a stale read writes nothing', race.count === 0);
    ok('bad input is refused', !(await setSeatsClosed(course.id, t.id, -1)).ok && !(await setSeatsClosed(course.id, t.id, 1.5)).ok);
  } finally {
    await prisma.teeTime.deleteMany({ where: { courseId: course.id } });
    await prisma.course.delete({ where: { id: course.id } });
    await prisma.courseOperator.delete({ where: { id: op.id } });
    await prisma.$disconnect();
  }
}

(async () => {
  if (process.env.DATABASE_URL) await db(); else console.log('SKIP  DB part (no DATABASE_URL)');
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})();
