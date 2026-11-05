// AUDIT-1 (security audit 2026-11-05, S1): one TeeTime row per slot, on a real database.
// The unique index TeeTime_slot_key refuses a second row for a slot; generation's insert
// skips one; and deleting a round (its rows go to no-round, SET NULL) first clears the
// open side of any slot it would share with a no-round time.
// Run: npx tsx scripts/tee-time-slot-db-test.ts
import { prisma } from '../src/lib/prisma';
import { roundDeleteClashes } from '../src/lib/tee-sheet-engine';

const TAG = 'ttslot';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + JSON.stringify(i)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseProduct.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Slot GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC' } });
  const day = '2030-06-01';
  const slot = (time: string, productId: string | null, playersBooked = 0) => prisma.teeTime.create({ data: { courseId: c.id, date: day, time, productId, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked } });
  const book = (teeTimeId: string) => prisma.booking.create({ data: { courseId: c.id, teeTimeId, golferName: 'G', golferEmail: `${TAG}@g.local`, players: 2, greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 10000 } });

  await slot('06:00', null);
  const dup = await slot('06:00', null).then(() => 'created', (e: { code?: string }) => e.code);
  ok('a second row for the same slot is refused by the database', dup === 'P2002', dup);
  const skipped = await prisma.teeTime.createMany({ data: [{ courseId: c.id, date: day, time: '06:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0 }], skipDuplicates: true });
  ok('…and generation\'s insert skips it instead of doubling the tee', skipped.count === 0);

  const round = await prisma.courseProduct.create({ data: { courseId: c.id, label: 'Back nine', holes: 9 } });
  ok('two different rounds can start at the same time', (await slot('06:00', round.id).then(() => true, () => false)));

  // 07:00 — the round's time is open, a no-round time there is booked: the round's goes.
  const r7 = await slot('07:00', round.id); const n7 = await slot('07:00', null, 2); await book(n7.id);
  // 08:00 — the round's time is booked, the no-round time is open: the no-round one goes.
  const r8 = await slot('08:00', round.id, 2); await book(r8.id); const n8 = await slot('08:00', null);
  const clear = await roundDeleteClashes(c.id, round.id);
  ok('deleting a round: the open side of each shared slot is cleared first', clear.ok && clear.drop.includes(r7.id) && clear.drop.includes(n8.id) && !clear.drop.includes(n7.id) && !clear.drop.includes(r8.id), clear);
  if (clear.ok) await prisma.teeTime.deleteMany({ where: { id: { in: clear.drop } } });
  const gone = await prisma.courseProduct.delete({ where: { id: round.id } }).then(() => 'deleted', (e: { code?: string }) => e.code);
  ok('…then the round deletes, its booked times kept with no round', gone === 'deleted' && (await prisma.teeTime.findUnique({ where: { id: r8.id } }))?.productId === null, gone);

  // Two booked times at one slot can't be merged: refused, nothing changed.
  const round2 = await prisma.courseProduct.create({ data: { courseId: c.id, label: 'Front nine', holes: 9 } });
  const r9 = await slot('09:00', round2.id, 1); await book(r9.id); const n9 = await slot('09:00', null, 1); await book(n9.id);
  const refused = await roundDeleteClashes(c.id, round2.id);
  ok('two booked groups at one slot: the round delete is refused with what to move', !refused.ok && refused.error.includes('09:00'), refused);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
