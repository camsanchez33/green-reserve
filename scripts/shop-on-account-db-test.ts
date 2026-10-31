// MEM-ACCT 1b (Cam 2026-10-31: pro shop on account): the register puts items on a member's
// account — the sale and its account line commit together, the limit and the past-due block
// hold, stock is taken, nothing is cash in the drawer, nothing goes in the money ledger (that
// happens when the statement is paid); a refund is a credit on the same account; a same-day
// void takes the line off, unless it is already on a statement.
// Needs a database. Run: npx tsx scripts/shop-on-account-db-test.ts
import { prisma } from '../src/lib/prisma';
import { createSale, refundSale, voidCashSale } from '../src/lib/shop-sales';
import { accountBalance } from '../src/lib/member-account';
import { daySummary } from '../src/lib/register-close';

const TAG = 'shoponaccountdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  const courseId = { in: ids };
  await prisma.memberCharge.deleteMany({ where: { courseId } });
  await prisma.memberStatement.deleteMany({ where: { courseId } });
  await prisma.moneyMove.deleteMany({ where: { courseId } });
  await prisma.shopSaleRefund.deleteMany({ where: { courseId } });
  await prisma.shopSaleLine.deleteMany({ where: { sale: { courseId } } });
  await prisma.shopSale.deleteMany({ where: { courseId } });
  await prisma.shopItem.deleteMany({ where: { courseId } });
  await prisma.courseMembership.deleteMany({ where: { courseId } });
  await prisma.membershipTier.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { id: courseId } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Shop ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const c = await mk('a');
  const other = await mk('b');
  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', accountOn: true, accountLimitCents: 10000 } });
  const plain = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Social' } });
  const pat = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: 'Pat Member', inviteEmail: `${TAG}+pat@t.local`, status: 'active' } });
  const sam = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: plain.id, inviteName: 'Sam Social', status: 'active' } });
  const foreign = await prisma.courseMembership.create({ data: { courseId: other.id, tierId: null, inviteName: 'Elsewhere', status: 'active' } });
  const balls = await prisma.shopItem.create({ data: { courseId: c.id, name: 'Balls', priceCents: 2000, stockCount: 10 } });
  const stock = async () => (await prisma.shopItem.findUniqueOrThrow({ where: { id: balls.id } })).stockCount;
  const sell = (membershipId: string | undefined, qty: number, extra: Record<string, unknown> = {}) =>
    createSale({ courseId: c.id, lines: [{ shopItemId: balls.id, quantity: qty }], pay: 'account', membershipId, soldBy: 'Front desk', ...extra });

  ok('no member picked: refused', !(await sell(undefined, 1)).ok);
  ok('another course\'s member: refused, no sale', !(await sell(foreign.id, 1)).ok && (await prisma.shopSale.count({ where: { courseId: c.id } })) === 0);
  const notOn = await sell(sam.id, 1);
  ok('a tier without accounts: refused, no sale left behind, no stock taken', !notOn.ok && (await prisma.shopSale.count({ where: { courseId: c.id } })) === 0 && (await stock()) === 10, notOn);

  const a = await sell(pat.id, 2);
  const line = a.ok ? await prisma.memberCharge.findUnique({ where: { shopSaleId: a.value.id } }) : null;
  ok('two balls on Pat\'s account: paid_account, $40, the member\'s name on the sale', a.ok && a.value.status === 'paid_account' && a.value.totalCents === 4000 && a.value.customerName === 'Pat Member', a);
  ok('…one shop line on the account, saying what it was', line?.kind === 'shop' && line.amountCents === 4000 && line.membershipId === pat.id && /Balls ×2/.test(line.note) && line.createdBy === 'Front desk', line);
  ok('…stock taken; balance $40', (await stock()) === 8 && (await accountBalance(pat.id)) === 4000);
  ok('…no money in the ledger yet (it moves when the statement is paid)', (await prisma.moneyMove.count({ where: { courseId: c.id } })) === 0);

  const over = await sell(pat.id, 4); // $80 more → $120, past $100
  ok('past the $100 limit: refused with the reason, no sale, no stock taken', !over.ok && /limit/.test(over.error) && (await prisma.shopSale.count({ where: { courseId: c.id } })) === 1 && (await stock()) === 8, over);

  const day = await daySummary(c.id);
  ok('the close-out: not cash, not card', day.ok && day.value.cashSales.count === 0 && day.value.cashTakenCents === 0 && day.value.card.shopCents === 0, day);

  ok('a changed total is refused', !(await sell(pat.id, 1, { expectedItemsCents: 999 })).ok);

  // A refund of one ball: $20 back on the account as a credit.
  const rf = a.ok ? await refundSale(c.id, a.value.id, { lines: [{ lineId: a.value.lines[0].id, quantity: 1 }], reason: 'Wrong kind' }, 'Front desk') : null;
  const credit = await prisma.memberCharge.findFirst({ where: { membershipId: pat.id, kind: 'credit' } });
  const refundRow = a.ok ? await prisma.shopSaleRefund.findFirst({ where: { saleId: a.value.id } }) : null;
  ok('a return of one: done, credited $20 on the same account, back on the shelf', !!rf?.ok && rf.value.status === 'done' && credit?.amountCents === -2000 && /Wrong kind/.test(credit.note) && refundRow?.method === 'account' && (await accountBalance(pat.id)) === 2000 && (await stock()) === 9, { rf, credit });
  ok('…still no money in the ledger, nor cash in the close-out', (await prisma.moneyMove.count({ where: { courseId: c.id } })) === 0 && ((await daySummary(c.id)) as { ok: true; value: { cashRefunds: { count: number } } }).value.cashRefunds.count === 0);
  ok('…a refunded sale can\'t then be voided', a.ok && !(await voidCashSale(c.id, a.value.id)).ok);

  // A same-day void: the line comes off.
  const b = await sell(pat.id, 1);
  const v = b.ok ? await voidCashSale(c.id, b.value.id) : null;
  ok('a same-day void: voided, its line off the account, the ball back', !!v?.ok && v.value.status === 'void' && b.ok && (await prisma.memberCharge.count({ where: { shopSaleId: b.value.id } })) === 0 && (await accountBalance(pat.id)) === 2000 && (await stock()) === 9, v);

  // Already billed on a statement: refund it instead.
  const d = await sell(pat.id, 1);
  if (d.ok) {
    const st = await prisma.memberStatement.create({ data: { courseId: c.id, membershipId: pat.id, period: '2026-09', totalCents: 2000, closedAt: new Date(), dueAt: new Date(Date.now() + 864e5), payToken: `${TAG}-tok` } });
    await prisma.memberCharge.update({ where: { shopSaleId: d.value.id }, data: { statementId: st.id } });
    const nv = await voidCashSale(c.id, d.value.id);
    ok('billed on a statement: the void is refused, the sale stays', !nv.ok && /statement/.test(nv.error) && (await prisma.shopSale.findUniqueOrThrow({ where: { id: d.value.id } })).status === 'paid_account', nv);
    // That statement now past due: nothing new goes on.
    await prisma.memberStatement.update({ where: { id: st.id }, data: { dueAt: new Date(Date.now() - 864e5) } });
    const late = await sell(pat.id, 1);
    ok('a statement past due: refused', !late.ok && /past due/.test(late.error), late);
  } else ok('third sale', false, d);

  // Round packs never go on account.
  const pack = await prisma.roundPack.create({ data: { courseId: c.id, name: 'Ten', rounds: 10, priceCents: 5000 } }).catch(() => null);
  if (pack) {
    const pr = await createSale({ courseId: c.id, lines: [{ roundPackId: pack.id, quantity: 1 }], pay: 'account', membershipId: pat.id, soldBy: 'x', customerEmail: `${TAG}+pat@t.local` });
    ok('a round pack on account: refused', !pr.ok, pr);
    await prisma.roundPack.delete({ where: { id: pack.id } });
  }

  await cleanup(); await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
