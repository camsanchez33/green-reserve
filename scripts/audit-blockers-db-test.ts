// Money audit of PRs #253–#276 (Cam 2026-10-31: "4 blockers in one PR"):
//  1. the dues pay link charges only the total (and auto-renew terms) the golfer was shown;
//  2. a tier's term is 1–36 whole months, and changing it on an auto-renew tier stops auto-renew;
//  3. a credit against a round gives back that round's share of GreenReserve's fee on the statement;
//  4. the day-before reminder and the no-card confirmation say the pay link opens on the day.
// Needs a database. Run: npx tsx scripts/audit-blockers-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { addCharge, creditAccount, creditFeeBack } from '../src/lib/member-account';
import { closeStatements } from '../src/lib/member-statements';

const TAG = 'auditblockersdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.memberCharge.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.memberStatement.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  // 1. Dues pay link
  const pay = read('src/app/api/membership/[id]/route.ts');
  const page = read('src/app/membership/[id]/page.tsx');
  ok('1. the GET gives the exact total in cents', pay.includes('    totalCents,\n'));
  ok('1. the POST refuses (and releases the claim) when the total or the auto-renew terms differ from what was shown',
    pay.includes('if (Number(expectedTotalCents) !== due.totalCents || (m.tier?.autoRenew && autoRenewTerms !== autoTerms)) {\n    await release();')
    && pay.indexOf('Number(expectedTotalCents) !== due.totalCents') < pay.indexOf('chargeOneIntent({'));
  ok('1. the page sends back the total and the terms it showed', page.includes('expectedTotalCents: info.totalCents') && page.includes('autoRenewTerms: info.autoRenewTerms'));

  // 2. Tier term
  const tiers = read('src/app/api/operator/tiers/route.ts');
  ok('2. the term is checked on create and on edit (1–36 whole months)', (tiers.match(/if \(!termOk\(/g) ?? []).length === 2 && tiers.includes('Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 36'));
  ok('2. a new term on an auto-renew tier stops auto-renew for its members, who are emailed', tiers.includes('if (tier.autoRenew && (!updated.autoRenew || updated.termMonths !== tier.termMonths)) {') && tiers.includes('data: STOP_DATA()'));

  // 3. Credit against a round
  ok('3. crediting the whole round gives its fee back', creditFeeBack({ amountCents: 5600, feeCents: 600 }, 5600) === 600);
  ok('3. a part credit keeps the fee (a discount on a played round, like a staff refund)', creditFeeBack({ amountCents: 5600, feeCents: 600 }, 2800) === 0);
  ok('3. a round with no fee gives nothing back', creditFeeBack({ amountCents: 5600, feeCents: 0 }, 5600) === 0);

  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Audit GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const other = await prisma.course.create({ data: { name: 'Other GC', slug: `${TAG}-b`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', accountOn: true } });
  const m = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: 'pat', inviteEmail: `${TAG}+pat@t.local`, status: 'active' } });
  const at = new Date('2026-10-10T12:00:00Z');
  const add = (kind: 'round' | 'shop', cents: number, fee = 0) => prisma.$transaction(async tx => { const r = await addCharge(tx, { courseId: c.id, membershipId: m.id, kind, amountCents: cents, feeCents: fee, note: kind }, at); if (!r.ok) throw new Error(r.error); await tx.memberCharge.update({ where: { id: r.id }, data: { createdAt: at } }); return r.id; });
  const round = await add('round', 5600, 600);
  const kept = await add('round', 4000, 400);
  await add('shop', 10000);
  const fee = async (id: string) => (await prisma.memberCharge.findUniqueOrThrow({ where: { id } })).feeCents;

  ok('3. another course can\'t credit against this round', (await creditAccount(other.id, m.id, 100, 'x', 'staff', round)).ok === false && await fee(round) === 600);
  ok('3. no more credit than the round cost', (await creditAccount(c.id, m.id, 5601, 'x', 'staff', round)).ok === false && await fee(round) === 600);
  const half = await creditAccount(c.id, m.id, 2800, 'Nine holes only', 'staff', round);
  ok('3. half credited: the fee stays on the round', half.ok === true && await fee(round) === 600);
  const full = await creditAccount(c.id, m.id, 5600, 'Rained out', 'staff', round);
  ok('3. the whole round credited: the round carries no fee', full.ok === true && await fee(round) === 0);
  const plain = await creditAccount(c.id, m.id, 500, 'Goodwill', 'staff');
  ok('3. a credit not tied to a round leaves every fee alone', plain.ok === true && await fee(kept) === 400);
  ok('3. credit lines never carry a fee', (await prisma.memberCharge.count({ where: { membershipId: m.id, kind: 'credit', feeCents: { not: 0 } } })) === 0);
  await prisma.memberCharge.updateMany({ where: { membershipId: m.id }, data: { createdAt: at } });

  const r = await closeStatements(c.id, new Date('2026-11-01T06:00:00Z'));
  const st = await prisma.memberStatement.findFirst({ where: { membershipId: m.id } });
  ok('3. the statement: $56 + $40 + $100 − $28 − $56 − $5 = $107, GreenReserve\'s fee only the uncredited round\'s $4', r.closed === 1 && st?.totalCents === 10700 && st?.feeCents === 400, st);
  ok('3. a billed round can\'t be credited against (its fee was taken with that statement)', (await creditAccount(c.id, m.id, 100, 'late', 'staff', kept)).ok === false);
  const ui = read('src/components/dashboard/MemberAccount.tsx');
  const route = read('src/app/api/operator/member-accounts/route.ts');
  ok('3. "Credit back" on a round line sends its id', ui.includes(">Credit back</button>") && ui.includes('...(credit.chargeId ? { chargeId: credit.chargeId } : {})') && route.includes('b.reason, session.email, b.chargeId)'));

  // 4. Emails
  const email = read('src/lib/email.ts');
  ok('4. the day-before reminder says the link opens tomorrow', email.includes('The link below opens tomorrow, the day of your round') && email.includes('Check In &amp; Pay Tomorrow &rarr;') && !email.includes('Check in and pay below before you head out, or do it'));
  ok('4. the no-card confirmation says online is on the day of the round', email.includes('or online from the link below on the day of your round.') && !email.includes('or use the link below to pay online.'));

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
  console.log('\nALL PASS');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
