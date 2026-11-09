// DRAWER-1 (Cam 2026-11-09: "if I closed with x amount it should tell me how much is in there and how much I should
// take out and leave a note … that should then correlate to the next morning and then you should have to re-open it";
// "shouldn't be able to start taking charges until the register is open"). The register is a loop: open (count against
// what was left) → sell → close out (count, leave a float, deposit the rest, note) → closed → reopen / next morning.
// Needs a database. Run: npx tsx scripts/drawer-cycle-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { openRegister, registerOpenFor, requireRegisterOpen } from '../src/lib/register-open';
import { closeDay, drawerBase } from '../src/lib/register-close';
import { addDaysStr } from '../src/lib/course-time';

const TAG = 'drawercycledbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.registerOpen.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.registerClose.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
const status = async (id: string) => { const v = await registerOpenFor(id); return v.ok ? v.value : null; };
const cashSale = (courseId: string, cents: number) => prisma.shopSale.create({ data: { courseId, status: 'paid_cash', paidAt: new Date(), totalCents: cents, soldBy: 't' } as never });

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Drawer', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });

  // 1. Not open: nothing can be charged.
  ok('not open: payments refused with "Open the register"', (await status(c.id))?.status === 'not_open' && /Open the register/.test((await requireRegisterOpen(c.id)) ?? ''));

  // 2. Open with $100 → open; payments allowed.
  await openRegister(c.id, { startingCashCents: 10000 }, 'am@t', 'open');
  ok('open: payments allowed', (await status(c.id))?.status === 'open' && (await requireRegisterOpen(c.id)) === null);

  // 3. Sell $50 cash, close out: counted $150, leave $100, deposit $50, note → closed.
  await cashSale(c.id, 5000);
  const cl = await closeDay(c.id, { countedCashCents: 15000, leaveInCents: 10000, note: 'Fives are low' }, 'pm@t');
  ok('close-out: $150 expected, even; leave $100, deposit $50', cl.ok && cl.value.expectedCashCents === 15000 && cl.value.differenceCents === 0 && cl.value.leaveInCents === 10000 && cl.value.depositCents === 5000, cl);
  const after = await status(c.id);
  ok('…the register is closed and payments are refused until it is reopened', after?.status === 'closed' && /reopen/i.test((await requireRegisterOpen(c.id)) ?? ''));
  ok('…the next opening sees $100 left, by whom, with the note', after?.handoff?.leaveInCents === 10000 && after.handoff.closedBy === 'pm@t' && after.handoff.note === 'Fives are low', after);
  ok('can\'t leave more than was counted', !(await closeDay(c.id, { countedCashCents: 5000, leaveInCents: 6000 }, 'pm@t')).ok);

  // 4. Reopen: a count that isn't what was left needs a reason.
  const wrong = await openRegister(c.id, { startingCashCents: 9000 }, 'am2@t', 'open');
  ok('reopen with $90 when $100 was left: refused without a reason', !wrong.ok && /say why/.test(wrong.error), wrong);
  const re = await openRegister(c.id, { startingCashCents: 10000 }, 'am2@t', 'open');
  ok('reopen with the $100 left: open again, kind reopen, leftCents recorded', re.ok && re.value.status === 'open' && re.value.current?.kind === 'reopen' && re.value.current.leftCents === 10000, re);
  ok('…the handoff is used up once it is opened', re.ok && re.value.handoff === null);

  // 5. A reopened session counts only what came in since the close-out: $100 float + $20 new sale = $120.
  await cashSale(c.id, 2000);
  const base = await drawerBase(c.id, (await status(c.id))!.day);
  ok('reopened session: float $100, the $50 before the close-out is not counted again', base.floatCents === 10000 && base.takenBaseCents === 5000, base);
  const cl2 = await closeDay(c.id, { countedCashCents: 12000, leaveInCents: 12000 }, 'pm@t');
  ok('…its close-out expects $120 and is even; leaving it all deposits $0', cl2.ok && cl2.value.expectedCashCents === 12000 && cl2.value.differenceCents === 0 && cl2.value.depositCents === 0, cl2);

  // 6. A recount while closed keeps it closed.
  await closeDay(c.id, { countedCashCents: 11900, leaveInCents: 10000 }, 'pm@t');
  ok('a recount while closed: still closed, the latest count stands as the handoff', (await status(c.id))?.status === 'closed' && (await status(c.id))?.handoff?.leaveInCents === 10000);

  // 6b. Review: closing out an older day late never reopens today's closed register, nor takes over the handoff.
  const today = (await status(c.id))!.day;
  const late = await closeDay(c.id, { day: addDaysStr(today, -2), openingFloatCents: 5000, countedCashCents: 5000, leaveInCents: 1 }, 'late@t');
  ok('a late close-out of an older day saves', late.ok, late);
  ok('…today stays closed and payments stay refused', (await status(c.id))?.status === 'closed' && !!(await requireRegisterOpen(c.id)));
  ok('…today\'s handoff is still today\'s $100, not the older day\'s', (await status(c.id))?.handoff?.leaveInCents === 10000);
  const tomorrow = await registerOpenFor(c.id, addDaysStr(today, 1));
  ok('…tomorrow morning: not open, sees today\'s $100 left, nothing "never closed"', tomorrow.ok && tomorrow.value.status === 'not_open' && tomorrow.value.handoff?.leaveInCents === 10000 && tomorrow.value.notClosed === null, tomorrow);

  // 6c. CI caught it: two people reopening at once — exactly one wins (the seq comes from the snapshot checked).
  const twice = await Promise.all([openRegister(c.id, { startingCashCents: 10000 }, 'x@t', 'open'), openRegister(c.id, { startingCashCents: 10000 }, 'y@t', 'open')]);
  ok('two reopening at once: exactly one wins', twice.filter(r => r.ok).length === 1, twice.map(r => r.ok ? r.value.current?.openedBy : r.error));
  const openSrc = readFileSync('src/lib/register-open.ts', 'utf8');
  ok('…and the seq always comes from the snapshot checked, never a second read (timing-proof)', openSrc.includes('const nextSeq = now.value.history.length;') && openSrc.includes('seq: nextSeq,') && !openSrc.includes("orderBy: { seq: 'desc' }"));

  // 7. Not given, "leave" defaults to the float (never more than counted) — older callers keep working.
  const c2 = await prisma.course.create({ data: { name: 'Drawer 2', slug: `${TAG}-b`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  await openRegister(c2.id, { startingCashCents: 10000 }, 'a', 'open');
  const d = await closeDay(c2.id, { countedCashCents: 8000 }, 'a');
  ok('no "leave" sent: leaves the float, capped at the count ($80 counted → $80 left, $0 out)', d.ok && d.value.leaveInCents === 8000 && d.value.depositCents === 0, d);

  // 8. Wiring: every place that takes money at the counter checks the register.
  const read = (p: string) => readFileSync(p, 'utf8');
  const sales = read('src/app/api/operator/shop-sales/route.ts'), bk = read('src/app/api/operator/bookings/route.ts'), rr = read('src/app/api/operator/reader-rounds/route.ts');
  // 4 since the 2026-11-09 security audit: new sales, cash on an open sale, a sale put on the reader, and a cash refund.
  ok('register sales (cash, reader, pay link, on account), cash on an open sale, a sale on the reader and a cash refund are refused while closed', (sales.match(/requireRegisterOpen\(g\.session\.courseId\)/g) ?? []).length === 4);
  ok('the tee sheet\'s Take cash, Pay separately + cash and the walk-in paying cash are refused while closed', (bk.match(/requireRegisterOpen\(session\.courseId\)/g) ?? []).length === 3);
  ok('a round on the card reader is refused while closed', rr.includes('requireRegisterOpen(g.session.courseId)'));
  ok('the Register shows only the opening until it is open', read('src/app/dashboard/shop/page.tsx').includes("view === 'register' && regStatus === 'open' && ("));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('drawer-cycle-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
