// A double-tapped Book button (Cam via Build 2026-11-12): an ONLINE claim for a golfer email that
// already holds a confirmed online booking on the same tee time returns that booking (duplicate)
// instead of making a second. Counter and staff bookings never dedupe. Plus source guards on the
// route: a duplicate gives back the promo and pack it took, charges nothing and sends nothing.
// Needs a database. Run: npx tsx scripts/booking-duplicate-db-test.ts
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { prisma } from '../src/lib/prisma';
import { claimTeeTime } from '../src/lib/claim-tee-time';

const TAG = 'bookingdupdbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

const route = readFileSync('src/app/api/bookings/route.ts', 'utf8');
const dupBlock = route.slice(route.indexOf('if (claimed.duplicate) {'), route.indexOf('// FEE-AT-BOOKING (Cam 2026-10-24)'));
check('route: a duplicate gives back the promo and pack, and returns before the fee, texts and emails',
  /releaseUse\(promo\.id\)/.test(dupBlock) && /giveBack\(prisma, pack\.lineId, pack\.seats\)/.test(dupBlock) && /return NextResponse\.json\(\{\s*bookingId: claimed\.id, duplicate: true/.test(dupBlock)
  && route.indexOf('if (claimed.duplicate) {') < route.indexOf('chargeBookingFee(claimed.id)') && route.indexOf('if (claimed.duplicate) {') < route.indexOf('optInAndConfirm('));
check('only the online claim dedupes', /if \(opts\.online && golfer\)/.test(readFileSync('src/lib/claim-tee-time.ts', 'utf8')));

const DATE = '2031-07-01';
async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
const actor = { type: 'golfer' } as const;

async function main() {
  const op = await prisma.courseOperator.create({ data: { name: 'Op', email: `${TAG}@test.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: TAG, slug: TAG, operatorId: op.id, address: '1', city: 'T', state: 'CA', zipCode: '90210', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24 } });
  let n = 0;
  const slot = () => prisma.teeTime.create({ data: { courseId: c.id, date: DATE, time: `0${6 + Math.floor(n / 6)}:${(n++ % 6)}0`, holes: 18, greenFeeCents: 0, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0, status: 'available' } });
  const b = (teeTimeId: string, email: string, players = 2, source = 'online') => ({ teeTimeId, courseId: c.id, golferName: 'Dup', golferEmail: email, players, greenFeeTotal: 0, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 0, status: 'confirmed', paymentStatus: 'manual', source, checkInToken: randomUUID() });

  // 1. Two online submits at the same instant, 10 rounds.
  for (let round = 0; round < 10; round++) {
    const t = await slot();
    const email = `${TAG}-g${round}@test.local`;
    const [r1, r2] = await Promise.all([claimTeeTime(b(t.id, email) as never, actor, { online: true }), claimTeeTime(b(t.id, email.toUpperCase()) as never, actor, { online: true })]);
    const made = await prisma.booking.count({ where: { teeTimeId: t.id } });
    const tt = await prisma.teeTime.findUniqueOrThrow({ where: { id: t.id }, select: { playersBooked: true } });
    check(`round ${round + 1}: two submits at once (any case) — one booking, the other gets it back as a duplicate`,
      made === 1 && r1.id === r2.id && [r1.duplicate, r2.duplicate].filter(Boolean).length === 1 && tt.playersBooked === 2, { made, r1, r2, tt });
  }

  // 2. Even when the first filled the time, the repeat gets its booking back (not "full").
  {
    const t = await slot();
    const email = `${TAG}-full@test.local`;
    const first = await claimTeeTime(b(t.id, email, 4) as never, actor, { online: true });
    const again = await claimTeeTime(b(t.id, email, 4) as never, actor, { online: true });
    check('a repeat of a booking that filled the time gets the booking back, not "full"', again.duplicate === true && again.id === first.id && again.checkInToken === first.checkInToken, { first, again });
  }

  // 3. Different golfers, counter bookings and a cancelled booking are never deduped.
  {
    const t = await slot();
    const [x, y] = await Promise.all([claimTeeTime(b(t.id, `${TAG}-x@test.local`, 1) as never, actor, { online: true }), claimTeeTime(b(t.id, `${TAG}-y@test.local`, 1) as never, actor, { online: true })]);
    check('two different golfers on one time both book', x.id !== y.id && !x.duplicate && !y.duplicate);
    const t2 = await slot();
    const s1 = await claimTeeTime(b(t2.id, `${TAG}-walk@test.local`, 1, 'walk_in') as never, { type: 'staff' } as never);
    const s2 = await claimTeeTime(b(t2.id, `${TAG}-walk@test.local`, 1, 'walk_in') as never, { type: 'staff' } as never);
    check('counter/staff bookings for the same email both book (never deduped)', s1.id !== s2.id && !s1.duplicate && !s2.duplicate);
    const t3 = await slot();
    const gone = await claimTeeTime(b(t3.id, `${TAG}-again@test.local`, 1) as never, actor, { online: true });
    await prisma.booking.update({ where: { id: gone.id }, data: { status: 'cancelled' } });
    const back = await claimTeeTime(b(t3.id, `${TAG}-again@test.local`, 1) as never, actor, { online: true });
    check('after cancelling, the same golfer can book that time again', back.id !== gone.id && !back.duplicate);
  }
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });
