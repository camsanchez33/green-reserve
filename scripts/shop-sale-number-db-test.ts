// PRO-SHOP sale numbers (Cam 2026-11-12, via Build): each course numbers its sales #1, #2, … from a counter row set by
// the "ShopSale_number_assign" trigger — never reused, no skips when a sale rolls back, no duplicates under load, and
// findable by "1047" or "#1047". Needs DATABASE_URL (the CI database): `npx tsx scripts/shop-sale-number-db-test.ts`.
import { prisma } from '../src/lib/prisma';
import { findSales } from '../src/lib/shop-sales';
import { staffShopReceipt } from '../src/lib/shop-receipt';
import { resetTestCourse } from '../src/lib/data-reset';

let failed = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!cond) failed++;
};
const TAG = 'salenumtest';

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopSaleCounter.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
async function course(n: string, isTest = false) {
  const op = await prisma.courseOperator.create({ data: { name: 'Op', email: `${TAG}${n}@test.local`, password: 'x' } });
  return prisma.course.create({ data: { name: TAG + n, slug: TAG + n, operatorId: op.id, address: '1', city: 'T', state: 'NY', zipCode: '10001', holes: 18, timezone: 'America/New_York', isTest }, select: { id: true } });
}
const sale = (courseId: string, extra: Record<string, unknown> = {}) =>
  prisma.shopSale.create({ data: { courseId, totalCents: 1000, status: 'paid_cash', paidAt: new Date(), soldBy: 'Isol', customerName: 'Sale Number', ...extra } as never, select: { id: true, number: true } });

async function main() {
  const a = await course('a', true), b = await course('b');

  const [a1, a2, a3] = [await sale(a.id), await sale(a.id), await sale(a.id)];
  ok('a course numbers its sales 1, 2, 3', [a1.number, a2.number, a3.number].join() === '1,2,3', [a1, a2, a3]);
  const b1 = await sale(b.id);
  ok('another course starts at its own 1', b1.number === 1, b1);
  const forced = await sale(b.id, { number: 999 });
  ok('a number can\'t be chosen by the caller: the trigger gives the next one (2)', forced.number === 2, forced);

  // No skips: a sale that rolls back (e.g. an account charge refused) gives its number back.
  await prisma.$transaction(async tx => {
    await tx.shopSale.create({ data: { courseId: a.id, totalCents: 1, soldBy: 'Isol' } });
    throw new Error('rollback');
  }).catch(() => {});
  const a4 = await sale(a.id);
  ok('a rolled-back sale gives its number back (the next is 4, not 5)', a4.number === 4, a4);

  // Never reused: deleting the newest sale doesn't lower the counter.
  await prisma.shopSale.delete({ where: { id: a4.id } });
  const a5 = await sale(a.id);
  ok('a deleted sale\'s number is never given again (next is 5)', a5.number === 5, a5);

  // Concurrency: a burst of sales at one course gets distinct, gapless numbers.
  const burst = await Promise.all(Array.from({ length: 20 }, () => sale(b.id)));
  const nums = burst.map(s => s.number!).sort((x, y) => x - y);
  ok('20 sales at once get 3…22, each once', nums.join() === Array.from({ length: 20 }, (_, i) => i + 3).join(), nums);

  // Search: "5", "#5" and "# 5" find sale #5; another course's #5 never shows.
  for (const q of ['5', '#5', '# 5']) {
    const r = await findSales(a.id, { q });
    ok(`search "${q}" finds sale #5 at this course`, r.ok && r.value.some(s => s.id === a5.id && s.number === 5), r.ok ? r.value.map(s => s.number) : r);
  }
  const rb = await findSales(b.id, { q: '#5' });
  ok('…and at another course finds its own #5, not this one', rb.ok && rb.value.every(s => s.id !== a5.id) && rb.value.some(s => s.number === 5));
  const big = await findSales(a.id, { q: '99999999999' });
  ok('a number too big for the column searches safely (no error)', big.ok);
  ok('every sale read carries its number', (await findSales(a.id, {})).ok && ((await findSales(a.id, {})) as { value: { number: number | null }[] }).value.every(s => typeof s.number === 'number'));

  // Final review: a bare number must find its sale even when over 100 newer sales contain those digits.
  {
    const c = await course('crowd');
    const first = Array.from({ length: 17 }, () => sale(c.id, { customerName: 'Early', createdAt: new Date(Date.now() - 5 * 86_400_000) }));
    await Promise.all(first);
    const eighteen = await sale(c.id, { customerName: 'The one', createdAt: new Date(Date.now() - 5 * 86_400_000) });
    for (let i = 0; i < 130; i++) await sale(c.id, { customerName: `Golfer 18${i}`, createdAt: new Date(Date.now() - (4 * 86_400_000 - i * 60_000)) });
    const r = await findSales(c.id, { q: '18' });
    ok('search "18" finds sale #18 first, though 130 newer sales mention 18', r.ok && r.value[0]?.id === eighteen.id && r.value[0].number === 18 && r.value.length === 100, r.ok ? { first: r.value[0]?.number, n: r.value.length } : r);
    ok('…and lists it once', r.ok && r.value.filter(x => x.id === eighteen.id).length === 1);
    // Older than the 90-day window: still found by its number.
    await prisma.shopSale.update({ where: { id: eighteen.id }, data: { createdAt: new Date(Date.now() - 200 * 86_400_000), paidAt: new Date(Date.now() - 200 * 86_400_000) } });
    const old = await findSales(c.id, { q: '#18' });
    ok('a sale older than 90 days is found by its number', old.ok && old.value[0]?.id === eighteen.id);
    const day = new Date().toISOString().slice(0, 10);
    const picked = await findSales(c.id, { q: '#18', day });
    ok('…but not on a day it wasn\'t made', picked.ok && !picked.value.some(x => x.id === eighteen.id));
    const rc = await staffShopReceipt(c.id, eighteen.id);
    ok('its receipt reads "#18", like the Sales list', rc?.ref === '#18', rc?.ref);
  }

  // A sale made before the column has no number: shown as null.
  await prisma.$executeRaw`UPDATE "ShopSale" SET "number" = NULL WHERE "id" = ${a1.id}`;
  const old = await findSales(a.id, { q: 'Sale Number' });
  ok('a sale from before numbers reads as null', old.ok && old.value.some(s => s.id === a1.id && s.number === null));
  const oldReceipt = await staffShopReceipt(a.id, a1.id);
  ok('…and its receipt keeps the old reference (last 8 of the id)', oldReceipt?.ref === a1.id.slice(-8).toUpperCase(), oldReceipt?.ref);

  // A test-course reset makes it like new: the next sale is #1 again.
  const reset = await resetTestCourse(a.id);
  ok('the test course resets', reset.ok, reset);
  const again = await sale(a.id);
  ok('…and its next sale is #1 again', again.number === 1, again);
  const bNext = await sale(b.id);
  ok('…while another course keeps counting (23)', bNext.number === 23, bNext);
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });
