// MEM-ACCT part 2 (Cam 2026-10-30: statements "monthly on the 1st, due in 15 days"; paid "course
// decides per tier"; the card saved with a "separate box on first statement"; a declined charge
// gets a "pay link + one retry in 3 days"; GreenReserve takes only the carried booking fees).
// Needs a database. Run: npx tsx scripts/member-statements-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { periodFor, closeStatements, chargeStatement, autoChargesDue, autoChargeStatement, markStatementPaidOffline, pastDue, statementForPage, DUE_DAYS } from '../src/lib/member-statements';
import { addCharge, accountBalance } from '../src/lib/member-account';
import { daySummary } from '../src/lib/register-close';
import { nextCharge } from '../src/lib/member-statements';
import { todayIn } from '../src/lib/course-time';
import { WIPED_TABLES } from '../src/lib/data-reset';

const TAG = 'memberstatementsdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const DAY = 86_400_000;

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.memberCharge.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.memberStatement.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
let calls = 0;
const okCharge = async (o: { amountCents: number }) => { calls++; return { id: `pi_${TAG}_${calls}`, amount: o.amountCents, status: 'succeeded' }; };
const badCharge = async () => { calls++; throw new Error('Your card was declined.'); };

(async () => {
  await cleanup();
  ok('Nov 1 bills October; Jan 1 bills December', periodFor('2026-11-01').period === '2026-10' && periodFor('2026-11-17').firstOfMonth === '2026-11-01' && periodFor('2027-01-01').period === '2026-12');
  ok('the new table is listed for the launch wipe', (WIPED_TABLES as readonly string[]).includes('MemberStatement'));

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Statements GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_test', stripeAccountActive: true } });
  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', accountOn: true, accountSettle: 'auto' } });
  const mk = (n: string, extra: Record<string, unknown> = {}) => prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: n, inviteEmail: `${TAG}+${n}@t.local`, status: 'active', ...extra } });
  const pat = await mk('pat', { accountCustomerId: 'cus_x', accountPaymentMethodId: 'pm_saved' });
  const lee = await mk('lee');
  const kim = await mk('kim');
  const line = (m: string, cents: number, at: string, fee = 0) => prisma.$transaction(async tx => { const r = await addCharge(tx, { courseId: c.id, membershipId: m, kind: cents < 0 ? 'credit' : 'round', amountCents: cents, feeCents: fee, note: 'x' }, new Date(at)); if (!r.ok) throw new Error(r.error); await tx.memberCharge.update({ where: { id: r.id }, data: { createdAt: new Date(at) } }); return r.id; });
  await line(pat.id, 10000, '2026-10-05T12:00:00Z', 300);
  await line(pat.id, 5150, '2026-10-20T12:00:00Z', 150);
  await line(pat.id, -2000, '2026-10-25T12:00:00Z');
  const nov = await line(pat.id, 4000, '2026-11-01T02:00:00Z'); // after the 1st began: next month
  await line(lee.id, 6000, '2026-10-10T12:00:00Z');
  await line(kim.id, 1000, '2026-10-10T12:00:00Z');
  await line(kim.id, -3000, '2026-10-11T12:00:00Z'); // a net credit

  ok('before the 1st nothing closes', (await closeStatements(c.id, new Date('2026-10-31T20:00:00Z'))).closed === 0);
  const now = new Date('2026-11-01T06:00:00Z');
  const r = await closeStatements(c.id, now);
  ok('on the 1st: a statement for each member who owes; a net credit makes none', r.closed === 2 && r.ids.length === 2, r);
  const st = await prisma.memberStatement.findUniqueOrThrow({ where: { membershipId_period: { membershipId: pat.id, period: '2026-10' } } });
  ok('Pat\'s October: $131.50 (credit taken off), fees $4.50, due in 15 days, charged in 3 (card saved)', st.totalCents === 13150 && st.feeCents === 450 && st.dueAt.getTime() === now.getTime() + DUE_DAYS * DAY && st.autoChargeAt?.getTime() === now.getTime() + 3 * DAY - 3_600_000, st);
  ok('…its lines point to it; the November line is still unbilled', (await prisma.memberCharge.count({ where: { statementId: st.id } })) === 3 && (await prisma.memberCharge.findUniqueOrThrow({ where: { id: nov } })).statementId === null);
  const leeSt = await prisma.memberStatement.findUniqueOrThrow({ where: { membershipId_period: { membershipId: lee.id, period: '2026-10' } } });
  ok('Lee has no saved card: a pay link only', leeSt.autoChargeAt === null);
  ok('closing again is a no-op', (await closeStatements(c.id, new Date('2026-11-02T06:00:00Z'))).closed === 0 && (await prisma.memberStatement.count({ where: { courseId: c.id } })) === 2);
  ok('the balance counts the open statement and the new line', (await accountBalance(pat.id)) === 13150 + 4000);
  ok('Kim\'s credit carries to next month', (await accountBalance(kim.id)) === -2000 && (await prisma.memberStatement.count({ where: { membershipId: kim.id } })) === 0);

  // Automatic charge: not before its day; then once.
  ok('not due before its day', !(await autoChargesDue(new Date(now.getTime() + 2 * DAY))).some(s => s.id === st.id));
  const due = (await autoChargesDue(new Date(now.getTime() + 3 * DAY))).filter(s => s.id === st.id);
  ok('due on day 3 (Lee\'s pay-link statement never is)', due.length === 1 && !(await autoChargesDue(new Date(now.getTime() + 3 * DAY))).some(s => s.id === leeSt.id));
  const declined = await autoChargeStatement(due[0], badCharge, new Date(now.getTime() + 3 * DAY));
  const afterD = await prisma.memberStatement.findUniqueOrThrow({ where: { id: st.id } });
  ok('declined: still open, one retry 3 days later', declined.status === 'declined' && afterD.status === 'open' && afterD.autoRetryAt?.getTime() === now.getTime() + 6 * DAY - 3_600_000 && !afterD.chargeStartedAt, afterD);
  ok('…the page and email now give the retry date, never the passed one', nextCharge(afterD)?.getTime() === afterD.autoRetryAt?.getTime() && nextCharge({ autoChargeAt: afterD.autoChargeAt, autoFailedAt: afterD.autoFailedAt, autoRetryAt: null }) === null);
  const retry = (await autoChargesDue(new Date(now.getTime() + 6 * DAY))).filter(s => s.id === st.id);
  const declined2 = retry.length ? await autoChargeStatement(retry[0], badCharge, new Date(now.getTime() + 6 * DAY)) : null;
  ok('declined again: no more tries', !!declined2 && declined2.status === 'declined' && (await prisma.memberStatement.findUniqueOrThrow({ where: { id: st.id } })).autoRetryAt === null && !(await autoChargesDue(new Date(now.getTime() + 9 * DAY))).some(s => s.id === st.id));

  // Past due blocks new charges (credits still fine).
  const late = new Date(now.getTime() + 16 * DAY);
  ok('past its due date: past due', await pastDue(pat.id, prisma, late));
  const blocked = await prisma.$transaction(tx => addCharge(tx, { courseId: c.id, membershipId: pat.id, kind: 'round', amountCents: 500 }, late));
  ok('…a new charge is refused, a credit is not', !blocked.ok && /past due/.test(blocked.ok ? '' : blocked.error) && (await prisma.$transaction(tx => addCharge(tx, { courseId: c.id, membershipId: pat.id, kind: 'credit', amountCents: -100, note: 'x' }, late))).ok);

  // Paid on the pay link: claimed once, ledgered with the carried fees, then paid.
  calls = 0;
  const [p1, p2] = await Promise.all([
    chargeStatement(st.id, { customerId: 'cus_y', paymentMethodId: 'pm_1', actor: 'golfer' }, async o => { await new Promise(r => setTimeout(r, 150)); return okCharge(o); }),
    chargeStatement(st.id, { customerId: 'cus_y', paymentMethodId: 'pm_2', actor: 'golfer' }, async o => { await new Promise(r => setTimeout(r, 150)); return okCharge(o); }),
  ]);
  const paidSt = await prisma.memberStatement.findUniqueOrThrow({ where: { id: st.id } });
  const mv = await prisma.moneyMove.findMany({ where: { courseId: c.id, what: 'account' } });
  ok('two taps at once: one charge, $131.50, paid', calls === 1 && [p1, p2].filter(x => x.status === 'paid').length === 1 && paidSt.status === 'paid' && !!paidSt.paidAt && paidSt.paymentIntentId.startsWith('pi_'), { calls, p1, p2 });
  ok('…on the ledger as member account money with GreenReserve\'s $4.50', mv.length === 1 && mv[0].amountCents === 13150 && mv[0].platformFeeCents === 450 && mv[0].method === 'card' && mv[0].direction === 'in');
  ok('…no longer past due; paying again is refused', !(await pastDue(pat.id, prisma, late)) && (await chargeStatement(st.id, { customerId: 'c', paymentMethodId: 'pm_3', actor: 'golfer' }, okCharge)).status === 'skipped');

  // One intent per statement: a decline, then a second card, confirm the SAME intent; a lost reply is read back.
  const one = await prisma.memberStatement.create({ data: { courseId: c.id, membershipId: kim.id, period: '2026-08', closedAt: now, dueAt: new Date(now.getTime() + 30 * DAY), totalCents: 1800, payToken: `${TAG}-one` } });
  const seen: string[] = [];
  const stripeLike = (outcome: 'decline' | 'ok') => async (o: Parameters<typeof okCharge>[0] & { existingIntentId: string; intentKey: string; onCreated: (id: string) => Promise<unknown> }) => {
    const id = o.existingIntentId || `pi_${o.intentKey}`;
    if (!o.existingIntentId) await o.onCreated(id);
    seen.push(id);
    if (outcome === 'decline') throw new Error('declined');
    return { id, amount: o.amountCents, status: 'succeeded' };
  };
  await chargeStatement(one.id, { customerId: 'c', paymentMethodId: 'pm_a', actor: 'golfer' }, stripeLike('decline') as never);
  const paidOne = await chargeStatement(one.id, { customerId: 'c', paymentMethodId: 'pm_b', actor: 'golfer' }, stripeLike('ok') as never);
  ok('a declined card then another card: one intent, created once, paid once', seen.length === 2 && seen[0] === seen[1] && seen[0] === `pi_statement-intent-${one.id}` && paidOne.status === 'paid' && (await prisma.memberStatement.findUniqueOrThrow({ where: { id: one.id } })).paymentIntentId === seen[0], seen);
  const procSt = await prisma.memberStatement.create({ data: { courseId: c.id, membershipId: kim.id, period: '2026-07', closedAt: now, dueAt: new Date(now.getTime() + 30 * DAY), totalCents: 900, payToken: `${TAG}-proc` } });
  const proc = await chargeStatement(procSt.id, { customerId: 'c', paymentMethodId: 'pm_c', actor: 'system' }, (async (o: { amountCents: number; onCreated: (id: string) => Promise<unknown> }) => { await o.onCreated('pi_proc'); return { id: 'pi_proc', amount: o.amountCents, status: 'processing' }; }) as never);
  const procRow = await prisma.memberStatement.findUniqueOrThrow({ where: { id: procSt.id } });
  ok('a payment still processing keeps its claim (no second try, not shown as declined)', proc.status === 'skipped' && procRow.status === 'open' && !!procRow.chargeStartedAt && !procRow.autoFailedAt);

  // Paid at the shop.
  ok('marked paid at the shop: needs cash or check', !(await markStatementPaidOffline(c.id, leeSt.id, 'venmo')).ok);
  const off = await markStatementPaidOffline(c.id, leeSt.id, 'check');
  const offMv = await prisma.moneyMove.findFirst({ where: { courseId: c.id, what: 'account', membershipId: lee.id } });
  ok('…by check: paid_offline, on the ledger as other money', off.ok && (await prisma.memberStatement.findUniqueOrThrow({ where: { id: leeSt.id } })).status === 'paid_offline' && offMv?.method === 'other' && offMv.amountCents === 6000);
  // Cash for a statement goes in the drawer: the day's close-out expects it.
  const cashSt = await prisma.memberStatement.create({ data: { courseId: c.id, membershipId: kim.id, period: '2026-09', closedAt: now, dueAt: now, totalCents: 2500, payToken: `${TAG}-cash` } });
  const before = await daySummary(c.id, todayIn('UTC'));
  await markStatementPaidOffline(c.id, cashSt.id, 'cash');
  const after = await daySummary(c.id, todayIn('UTC'));
  ok('a statement paid in cash is in the day\'s expected cash', before.ok && after.ok && after.value.otherCash.cents - before.value.otherCash.cents === 2500, { b: before.ok && before.value.otherCash, a: after.ok && after.value.otherCash });
  ok('…twice is refused; another course can\'t', !(await markStatementPaidOffline(c.id, leeSt.id, 'cash')).ok && !(await markStatementPaidOffline('nope', leeSt.id, 'cash')).ok);
  // The Stripe side is driven for real in scripts/statement-intent-db-test.ts; here: the claim comes before any stop.
  ok('paid at the shop: claimed first, then the card payment checked and stopped', (() => { const f = readFileSync('src/lib/member-statements.ts', 'utf8'); const fn = f.slice(f.indexOf('export async function markStatementPaidOffline')); return fn.indexOf('const claimed = await prisma.memberStatement.updateMany') > 0 && fn.indexOf('const claimed') < fn.indexOf('paymentIntents.cancel(') && fn.indexOf('paymentIntents.cancel(') < fn.indexOf("status: 'paid_offline'"); })());
  ok('the statement page needs its token', (await statementForPage(st.id, 'wrong')) === null && !!(await statementForPage(st.id, st.payToken)));

  // Wiring.
  const route = readFileSync('src/app/api/statement/[id]/route.ts', 'utf8');
  ok('the pay link and the automatic charge both use one intent per statement', route.includes('chargeOneIntent);') && !route.includes('chargeOnConnectedAccount'));
  ok('the pay link: saving the card needs the separate box, only on an automatic tier; it can be turned off', route.includes("const saveCard = body.saveCard === true && m.tier?.accountSettle === 'auto';") && route.includes("if (saveCard && body.agree !== true)") && route.includes("body.action === 'stop_card'") && route.includes('expectedTotalCents'));
  const page = readFileSync('src/app/statement/[id]/page.tsx', 'utf8');
  ok('the box is never ticked for them', page.includes('const [saveCard, setSaveCard] = useState(false);'));
  const cron = readFileSync('src/app/api/cron/send-reminders/route.ts', 'utf8');
  ok('the cron bills any course with unbilled lines — accounts turned off or not', cron.includes('memberCharges: { some: { statementId: null } }'));
  ok('the daily cron closes, emails, and charges', cron.includes('closeStatements(c.id, now)') && cron.includes('emailStatement(sid)') && cron.includes('autoChargeStatement(s, chargeOneIntent, now)') && cron.includes('sendStatementDeclinedEmail'));
  const api = readFileSync('src/app/api/operator/member-accounts/route.ts', 'utf8');
  ok('staff: paid at the shop and email again need members.edit and stay on this course', api.includes("requirePermission(session, 'members.edit')") && api.includes('where: { id: b.statementId, courseId: session.courseId }'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('member-statements-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
