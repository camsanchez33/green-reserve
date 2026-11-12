// The booking claim (lib/claim-tee-time) is Serializable. Two claims at the same moment can
// conflict even on DIFFERENT tee times, and the loser used to get "That time just filled up"
// (CONFLICT) on an empty time — about 1–2% of simultaneous claims (measured 2026-11-12). It now
// runs again in a fresh transaction, up to CLAIM_ATTEMPTS times. This reproduces the race and
// checks the retry never lets a real race through: the last spots still go to exactly as many
// players as fit, and a once-per-golfer promo is still used once.
// Needs a database. Run: npx tsx scripts/claim-retry-db-test.ts
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { prisma } from '../src/lib/prisma';
import { claimTeeTime, CLAIM_ATTEMPTS, TeeTimeClaimError } from '../src/lib/claim-tee-time';

const TAG = 'claimretrydbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

const src = readFileSync('src/lib/claim-tee-time.ts', 'utf8');
check('the claim retries a serialization failure, then answers CONFLICT', CLAIM_ATTEMPTS === 8 && /code === 'P2034'\) \{\s+if \(attempt < CLAIM_ATTEMPTS\)/.test(src) && /throw new TeeTimeClaimError\('CONFLICT'\)/.test(src));
check('…and each attempt is its own Serializable transaction', /async function claimOnce[\s\S]*prisma\.\$transaction\([\s\S]*isolationLevel: 'Serializable'/.test(src));

const DATE = '2031-06-01';
async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.promoCode.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
async function course(n: string) {
  const op = await prisma.courseOperator.create({ data: { name: n, email: `${TAG}-${n}@test.local`, password: 'x' } });
  return prisma.course.create({ data: { name: `${TAG} ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'T', state: 'CA', zipCode: '90210', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24 } });
}
const time = (i: number) => `${String(6 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}`;
const teeTime = (courseId: string, i: number, spots = 4) => prisma.teeTime.create({ data: { courseId, date: DATE, time: time(i), holes: 18, greenFeeCents: 0, cartFeeCents: 0, playersAvailable: spots, playersBooked: 0, status: 'available' } });
const booking = (courseId: string, teeTimeId: string, n: number, extra: Record<string, unknown> = {}) =>
  // A pre-generated unique checkInToken, as the real callers send: a retried attempt must reuse it cleanly.
  ({ teeTimeId, courseId, checkInToken: randomUUID(), golferName: `Claim ${n}`, golferEmail: `${TAG}-g${n}@test.local`, players: 1, greenFeeTotal: 0, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 0, status: 'confirmed', paymentStatus: 'manual', ...extra });
const actor = { type: 'system' } as const;
const outcome = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof TeeTimeClaimError ? e.code : `error: ${(e as Error)?.message ?? e}`));

async function main() {
  const A = await course('a'), B = await course('b');

  // 1. The race that used to fail: claims at the same moment, each on its own empty time.
  for (const [label, plan] of [['8 at once at one course', [[A.id, 8]]], ['4 each at two courses at once', [[A.id, 4], [B.id, 4]]]] as const) {
    const tally: Record<string, number> = {};
    for (let round = 0; round < 15; round++) {
      const jobs: Promise<string>[] = [];
      for (const [cid, n] of plan) {
        const times = await Promise.all(Array.from({ length: n }, (_, i) => teeTime(cid, i)));
        times.forEach((t, i) => jobs.push(outcome(claimTeeTime(booking(cid, t.id, round * 100 + i) as never, actor))));
      }
      for (const r of await Promise.all(jobs)) tally[r] = (tally[r] ?? 0) + 1;
      await prisma.bookingEvent.deleteMany({ where: { courseId: { in: [A.id, B.id] } } });
      await prisma.booking.deleteMany({ where: { courseId: { in: [A.id, B.id] } } });
      await prisma.teeTime.deleteMany({ where: { courseId: { in: [A.id, B.id] } } });
    }
    check(`every claim on an empty time succeeds: ${label} (15 rounds)`, Object.keys(tally).length === 1 && tally.ok === 120, tally);
  }

  // 2. A real race for the last spots: 6 golfers, 4 spots — exactly 4 get in, the rest are told it's full.
  for (let round = 0; round < 5; round++) {
    const t = await teeTime(A.id, 0, 4);
    const res = await Promise.all(Array.from({ length: 6 }, (_, i) => outcome(claimTeeTime(booking(A.id, t.id, 500 + round * 10 + i) as never, actor))));
    const after = await prisma.teeTime.findUniqueOrThrow({ where: { id: t.id }, select: { playersBooked: true, status: true } });
    const made = await prisma.booking.count({ where: { teeTimeId: t.id } });
    const ok = res.filter(r => r === 'ok').length;
    // The two who miss out are told the time filled: FULL, or CONFLICT when six at once used up their
    // attempts — true either way. What must never happen is a fifth player getting in.
    check(`round ${round + 1}: 6 golfers for 4 spots — exactly 4 booked, never over capacity`,
      ok === 4 && made === 4 && after.playersBooked === 4 && after.status === 'full' && res.every(r => ['ok', 'FULL', 'SPOTS', 'CONFLICT'].includes(r)), { res, after, made });
    await prisma.bookingEvent.deleteMany({ where: { courseId: A.id } });
    await prisma.booking.deleteMany({ where: { teeTimeId: t.id } });
    await prisma.teeTime.delete({ where: { id: t.id } });
  }

  // 3. A once-per-golfer promo, used twice at once by one golfer on two times: one gets it.
  const promo = await prisma.promoCode.create({ data: { courseId: A.id, code: 'ONCE', kind: 'percent', value: 10, onePerGolfer: true } });
  for (let round = 0; round < 5; round++) {
    const [t1, t2] = await Promise.all([teeTime(A.id, 1), teeTime(A.id, 2)]);
    const same = { golferEmail: `${TAG}-promo@test.local`, promoCodeId: promo.id };
    const res = await Promise.all([t1, t2].map((t, i) => outcome(claimTeeTime(booking(A.id, t.id, 900 + i, same) as never, actor))));
    check(`round ${round + 1}: one golfer, a once-per-golfer promo twice at once — one booking, the other PROMO_USED`,
      res.filter(r => r === 'ok').length === 1 && res.filter(r => r === 'PROMO_USED').length === 1, res);
    await prisma.bookingEvent.deleteMany({ where: { courseId: A.id } });
    await prisma.booking.deleteMany({ where: { courseId: A.id } });
    await prisma.teeTime.deleteMany({ where: { courseId: A.id } });
  }
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });
