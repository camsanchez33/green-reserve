// Revamp 3 audit fix 7 (Cam 2026-10-29): "Not paid yet" is what is owed — a
// played round nobody paid for. A no-show staff marked is counted apart, and a
// round refunded in full is settled, not owed. Payments lists played rounds by
// tee time, so the list behind the number isn't the newest 200 bookings made.
// Needs a database. Run: npx tsx scripts/not-paid-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { computeAnalytics } from '../src/lib/analytics';
import { paymentStatus } from '../src/components/dashboard/money/PaymentsPanel';

const TAG = 'notpaiddbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};
const NOW = new Date('2031-05-14T12:00:00Z');
const DAY = '2031-05-13';

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: 'Owed GC', slug: `${TAG}-1`, operatorId: op.id, address: '1', city: 'T', state: 'CA', zipCode: '9', holes: 18, timezone: 'UTC' } });
  let n = 0;
  const book = async (extra: Record<string, unknown>) => {
    const t = await prisma.teeTime.create({ data: { courseId: course.id, date: DAY, time: `08:${String(n++).padStart(2, '0')}`, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });
    return prisma.booking.create({ data: { teeTimeId: t.id, courseId: course.id, golferName: 'G', golferEmail: `${TAG}@test.local`, players: 2,
      greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300, status: 'confirmed', paymentStatus: 'card_on_file', ...extra } });
  };
  await book({}); // played, never paid: owed
  await book({ noShowAt: new Date('2031-05-13T09:00:00Z') }); // a marked no-show
  await book({ status: 'completed', paymentStatus: 'refunded', checkedInAt: new Date('2031-05-13T08:00:00Z') }); // refunded in full
  await book({ status: 'completed', paymentStatus: 'paid', roundPaymentIntentId: 'pi_x', checkedInAt: new Date('2031-05-13T08:00:00Z') });

  const a = await computeAnalytics(course.id, { from: DAY, to: DAY }, NOW);
  check('not paid yet is the one round nobody paid for', a.revenue.outstandingBookings === 1 && a.revenue.outstandingCents === 10000, a.revenue);
  check('…the marked no-show is counted apart', a.revenue.noShowUnpaidBookings === 1 && a.revenue.noShowUnpaidCents === 10000, a.revenue);
  check('…a refunded round is neither owed nor expected', a.revenue.expectedCents === 30000 && a.revenue.collectedCents === 10000, a.revenue);

  // Payments: a no-show has its own list; a round later today is still to play (course time).
  const row = (o: Record<string, unknown>) => ({ status: 'confirmed', paymentStatus: 'card_on_file', cancellationFeeTotal: 0, noShowAt: null, teeTime: { date: '2031-05-14', time: '15:00', holes: 18 }, ...o }) as unknown as Parameters<typeof paymentStatus>[0];
  check('a no-show is not on the Not paid yet list', paymentStatus(row({ noShowAt: '2031-05-14T09:00:00Z', teeTime: { date: DAY, time: '08:00', holes: 18 } }), '2031-05-14', '12:00').group === 'noshow');
  check('a round later today is still to play', paymentStatus(row({}), '2031-05-14', '12:00').group === 'upcoming');
  check('…and owed once its time has gone', paymentStatus(row({}), '2031-05-14', '16:00').group === 'unpaid');

  const route = readFileSync('src/app/api/operator/bookings/route.ts', 'utf8');
  const money = readFileSync('src/app/dashboard/money/page.tsx', 'utf8');
  check('Payments reads played rounds by tee time, not the newest bookings made', route.includes("searchParams.get('played') === '1'") && money.includes("/api/operator/bookings?played=1") && money.includes('(played ?? [])'));
}

main().then(async () => { await cleanup(); await prisma.$disconnect(); if (failed) { console.error(`${failed} failed`); process.exit(1); } console.log('not-paid: all passed'); })
  .catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
