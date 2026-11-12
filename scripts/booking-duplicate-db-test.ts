// A double-tapped Book button (Cam via Build 2026-11-12, narrowed by the final review): an ONLINE
// submit identical to one made in the last DOUBLE_TAP_MS — same tee time, same email (exact, never a
// LIKE pattern), same name and party size, made by the golfer route — returns that booking instead of
// making a second. Anything else is a new booking: a wildcard email, an admin-made booking, a different
// party, an older booking. Plus source guards on the route.
// Needs a database. Run: npx tsx scripts/booking-duplicate-db-test.ts
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { prisma } from '../src/lib/prisma';
import { claimTeeTime, findDoubleTap, DOUBLE_TAP_MS } from '../src/lib/claim-tee-time';

const TAG = 'bookingdupdbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

const route = readFileSync('src/app/api/bookings/route.ts', 'utf8');
const lib = readFileSync('src/lib/claim-tee-time.ts', 'utf8');
const pre = route.indexOf('const tapped = await findDoubleTap(prisma');
check('route: the double-tap check runs before any promo, pack or card work', pre > 0 && pre < route.indexOf('reserveUse(promo.id)') && pre < route.indexOf('stripe.setupIntents') && pre < route.indexOf('takeRounds('));
const dupBlock = route.slice(route.indexOf('if (claimed.duplicate) {'), route.indexOf('// FEE-AT-BOOKING (Cam 2026-10-24)'));
check('route: a same-instant duplicate gives back the promo and pack, and returns before the fee, texts and emails',
  /releaseUse\(promo\.id\)/.test(dupBlock) && /giveBack\(prisma, pack\.lineId, pack\.seats\)/.test(dupBlock) && /return doubleTapResponse\(claimed\.id\)/.test(dupBlock)
  && route.indexOf('if (claimed.duplicate) {') < route.indexOf('chargeBookingFee(claimed.id)') && route.indexOf('if (claimed.duplicate) {') < route.indexOf('optInAndConfirm('));
check('route: a golfer email must look like an email', /if \(typeof golferEmail !== 'string' \|\| !\/\^\[\^\\s@\]\+@/.test(route));
check('lib: exact, case-folded email (lower() = lower()), never ILIKE / mode insensitive', /lower\("golferEmail"\) = lower\(\$\{email\}\)/.test(lib) && !/golferEmail: \{ equals: golfer, mode: 'insensitive'/.test(lib));
check('lib: only bookings the golfer route made (termsAcceptedAt), in the last 2 minutes, same name and party', /"termsAcceptedAt" IS NOT NULL AND "createdAt" >= \$\{since\}/.test(lib) && /"players" = \$\{players\}/.test(lib) && DOUBLE_TAP_MS === 120_000);
check('only the online claim dedupes', /if \(opts\.online\) \{\s+const mine = await findDoubleTap\(tx, data\)/.test(lib));

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
  // What the golfer route sends (termsAcceptedAt is stamped only there).
  const online = (teeTimeId: string, email: string, players = 2, name = 'Jane Doe') => ({ teeTimeId, courseId: c.id, golferName: name, golferEmail: email, players, greenFeeTotal: 0, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 0, status: 'confirmed', paymentStatus: 'manual', source: 'online', termsAcceptedAt: new Date(), checkInToken: randomUUID() });
  const actor = { type: 'golfer' } as const;

  // 1. Two identical submits at the same instant, 10 rounds: one booking, the other gets it back.
  for (let round = 0; round < 10; round++) {
    const t = await slot();
    const email = `${TAG}-g${round}@test.local`;
    const [r1, r2] = await Promise.all([claimTeeTime(online(t.id, email) as never, actor, { online: true }), claimTeeTime(online(t.id, email.toUpperCase()) as never, actor, { online: true })]);
    const made = await prisma.booking.count({ where: { teeTimeId: t.id } });
    const tt = await prisma.teeTime.findUniqueOrThrow({ where: { id: t.id }, select: { playersBooked: true } });
    check(`round ${round + 1}: two identical submits at once (email in any case) — one booking, one duplicate`,
      made === 1 && r1.id === r2.id && [r1.duplicate, r2.duplicate].filter(Boolean).length === 1 && tt.playersBooked === 2, { made, r1, r2, tt });
  }

  // 2. A repeat of a booking that filled the time gets it back, not "full".
  {
    const t = await slot();
    const first = await claimTeeTime(online(t.id, `${TAG}-full@test.local`, 4) as never, actor, { online: true });
    const again = await claimTeeTime(online(t.id, `${TAG}-full@test.local`, 4) as never, actor, { online: true });
    check('a repeat of a booking that filled the time gets the booking back, not "full"', again.duplicate === true && again.id === first.id, { first, again });
  }

  // 3. The review's leak: a wildcard or another golfer's email never returns their booking.
  {
    const t = await slot();
    const victim = await claimTeeTime(online(t.id, 'jane_doe@victim.example', 2) as never, actor, { online: true });
    for (const probe of ['%', 'j%', 'ja%', '%@victim.example', 'jane_doe@victim.%', 'janeXdoe@victim.example']) {
      check(`findDoubleTap("${probe}") finds nothing (no LIKE patterns)`, (await findDoubleTap(prisma, { teeTimeId: t.id, golferEmail: probe, golferName: 'Jane Doe', players: 2 })) === null);
    }
    check('…the exact email with a different name finds nothing', (await findDoubleTap(prisma, { teeTimeId: t.id, golferEmail: 'jane_doe@victim.example', golferName: 'Someone Else', players: 2 })) === null);
    check('…the exact repeat (same name and party) does', (await findDoubleTap(prisma, { teeTimeId: t.id, golferEmail: 'JANE_DOE@victim.example', golferName: ' jane doe ', players: 2 }))?.id === victim.id);
  }

  // 4. A real second booking: a different party, or an older booking, is made.
  {
    const t = await slot();
    const a = await claimTeeTime(online(t.id, `${TAG}-two@test.local`, 2) as never, actor, { online: true });
    const b = await claimTeeTime(online(t.id, `${TAG}-two@test.local`, 1) as never, actor, { online: true });
    check('the same golfer booking a different party size makes a second booking', a.id !== b.id && !b.duplicate);
    const t2 = await slot();
    const old = await claimTeeTime(online(t2.id, `${TAG}-later@test.local`, 2) as never, actor, { online: true });
    await prisma.booking.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - DOUBLE_TAP_MS - 1000) } });
    const later = await claimTeeTime(online(t2.id, `${TAG}-later@test.local`, 2) as never, actor, { online: true });
    check('the same booking again more than two minutes later is a new booking (friends days later)', later.id !== old.id && !later.duplicate);
  }

  // 5. Admin, counter and staff bookings never match (no termsAcceptedAt, even with source 'online').
  {
    const t = await slot();
    const adminMade = await claimTeeTime({ ...online(t.id, `${TAG}-adm@test.local`, 1), termsAcceptedAt: null } as never, { type: 'admin' } as never);
    const golfer = await claimTeeTime(online(t.id, `${TAG}-adm@test.local`, 1) as never, actor, { online: true });
    check('an admin-made booking (source defaults to online) is never handed to a golfer', golfer.id !== adminMade.id && !golfer.duplicate);
    const t2 = await slot();
    const s1 = await claimTeeTime({ ...online(t2.id, `${TAG}-walk@test.local`, 1), source: 'walk_in' } as never, { type: 'staff' } as never);
    const s2 = await claimTeeTime({ ...online(t2.id, `${TAG}-walk@test.local`, 1), source: 'walk_in' } as never, { type: 'staff' } as never);
    check('staff bookings for the same email both book (never deduped)', s1.id !== s2.id && !s2.duplicate);
    const t3 = await slot();
    const gone = await claimTeeTime(online(t3.id, `${TAG}-again@test.local`, 1) as never, actor, { online: true });
    await prisma.booking.update({ where: { id: gone.id }, data: { status: 'cancelled' } });
    const back = await claimTeeTime(online(t3.id, `${TAG}-again@test.local`, 1) as never, actor, { online: true });
    check('after cancelling, the same golfer can book that time again', back.id !== gone.id && !back.duplicate);
  }
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });
