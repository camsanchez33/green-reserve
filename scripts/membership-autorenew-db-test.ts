// MEM-RENEW (Cam 2026-10-30: auto-renew "up to course", golfers told and agreeing with a required
// box; reminders 30 days yearly / 7 monthly; a declined renewal "up to course"): a membership on
// automatic renewal is reminded, then charged once per term on the saved card; a decline emails a
// pay link and, when the tier says so, retries once. Needs a database (no Stripe — the charge is
// injected). Run: npx tsx scripts/membership-autorenew-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { reminderLeadDays, renewalCents, autoRenewTermsText, remindersDue, markReminded, chargesDue, chargeRenewal, stopAutoRenew, RETRY_DAYS } from '../src/lib/membership-autorenew';

const TAG = 'autorenewdbtest';
const DAY = 86_400_000;
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

const charges: { key: string; amount: number; fee: number }[] = [];
const paying = async (o: { intentKey: string; amountCents: number; applicationFeeCents: number }) => { charges.push({ key: o.intentKey, amount: o.amountCents, fee: o.applicationFeeCents }); return { id: `pi_${TAG}_${charges.length}`, amount: o.amountCents, status: 'succeeded' }; };
const declining = async () => { throw new Error('Your card was declined.'); };

(async () => {
  await cleanup();
  ok('reminder 30 days ahead yearly, 7 monthly', reminderLeadDays(12) === 30 && reminderLeadDays(1) === 7);
  const rc = renewalCents({ annualFeeCents: 80000 });
  ok('$800 renews at $808 (dues + 1%), no initiation', rc.duesCents === 80000 && rc.feeCents === 800 && rc.totalCents === 80800, rc);
  const terms = autoRenewTermsText({ courseName: 'Pines', tierName: 'Unlimited', termMonths: 12, annualFeeCents: 80000 });
  ok('the terms say the amount, how often, the reminder and how to turn it off', terms.includes('$808.00') && terms.includes('every year') && terms.includes('30 days before') && /turn automatic renewal off/i.test(terms), terms);

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Renew GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', stripeAccountId: 'acct_test', stripeAccountActive: true } });
  const yearly = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Unlimited', annualFeeCents: 80000, autoRenew: true, autoRenewRetry: true } });
  const noRetry = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Monthly', annualFeeCents: 9900, termMonths: 1, autoRenew: true, autoRenewRetry: false } });
  const now = new Date();
  const price: Record<string, number> = { [yearly.id]: renewalCents(yearly).totalCents, [noRetry.id]: renewalCents(noRetry).totalCents };
  const mk = (tierId: string, expiresAt: Date, extra: Record<string, unknown> = {}) => prisma.courseMembership.create({ data: { courseId: c.id, tierId, autoRenewRemindedCents: price[tierId], status: 'active', paymentStatus: 'paid', lastPaidAt: new Date(now.getTime() - 300 * DAY), expiresAt, inviteName: 'Pat', inviteEmail: `${TAG}+${Math.random()}@t.local`, payToken: 'tok', autoRenew: true, autoRenewConsentAt: now, savedCustomerId: 'cus_x', savedPaymentMethodId: 'pm_x', ...extra } });

  // Reminder first, once per term.
  const a = await mk(yearly.id, new Date(now.getTime() + 20 * DAY));
  ok('20 days before a yearly renewal: the reminder is due', (await remindersDue(now)).some(r => r.id === a.id));
  const far = await mk(yearly.id, new Date(now.getTime() + 40 * DAY));
  ok('40 days before: not yet', !(await remindersDue(now)).some(r => r.id === far.id));
  await markReminded(a.id, a.expiresAt!, renewalCents({ annualFeeCents: 80000 }).totalCents, now);
  ok('…sent once per term', !(await remindersDue(now)).some(r => r.id === a.id));
  ok('…and not charged before its date', !(await chargesDue(now)).some(r => r.id === a.id));

  // On the renewal date, after the full notice: charged once, on the ledger, a new term.
  const b = await mk(yearly.id, new Date(now.getTime() - DAY), { autoRenewRemindedFor: null });
  await prisma.courseMembership.update({ where: { id: b.id }, data: { autoRenewRemindedFor: b.expiresAt, renewalRemindedAt: new Date(now.getTime() - 31 * DAY) } });
  ok('renewal date passed and reminded 31 days ago: due', (await chargesDue(now)).some(r => r.id === b.id));
  const paid = await chargeRenewal(b.id, paying, now);
  const bAfter = await prisma.courseMembership.findUniqueOrThrow({ where: { id: b.id } });
  ok('charged $808 with a $8 fee, the term extended a year', paid.status === 'paid' && charges.at(-1)?.amount === 80800 && charges.at(-1)?.fee === 800 && !!bAfter.expiresAt && bAfter.expiresAt.getTime() > now.getTime() + 360 * DAY, { paid, bAfter: bAfter.expiresAt });
  ok('…on the ledger', !!(await prisma.moneyMove.findFirst({ where: { membershipId: b.id, what: 'dues', amountCents: 80800, platformFeeCents: 800 } })));
  ok('…and not charged twice', (await chargeRenewal(b.id, paying, now)).status === 'skipped' && !(await chargesDue(now)).some(r => r.id === b.id));

  // A late reminder pushes the charge back.
  const late = await mk(yearly.id, new Date(now.getTime() - DAY));
  await prisma.courseMembership.update({ where: { id: late.id }, data: { autoRenewRemindedFor: late.expiresAt, renewalRemindedAt: new Date(now.getTime() - 2 * DAY) } });
  ok('reminded only 2 days ago: not charged until the 30 days have run', !(await chargesDue(now)).some(r => r.id === late.id));
  ok('never reminded: never charged', !(await chargesDue(now)).some(r => r.id === far.id));

  // Declined: one retry 3 days later when the tier says so.
  const d = await mk(yearly.id, new Date(now.getTime() - DAY));
  await prisma.courseMembership.update({ where: { id: d.id }, data: { autoRenewRemindedFor: d.expiresAt, renewalRemindedAt: new Date(now.getTime() - 31 * DAY) } });
  const dec = await chargeRenewal(d.id, declining, now);
  const dAfter = await prisma.courseMembership.findUniqueOrThrow({ where: { id: d.id } });
  ok('declined: a retry set for 3 days later, no new term', dec.status === 'declined' && dec.retry && !!dAfter.autoRenewRetryAt && Math.abs(dAfter.autoRenewRetryAt.getTime() - (now.getTime() + RETRY_DAYS * DAY)) < 1000 && dAfter.expiresAt?.getTime() === d.expiresAt?.getTime(), { dec, dAfter: dAfter.autoRenewRetryAt });
  ok('…not tried again before then', !(await chargesDue(now)).some(r => r.id === d.id));
  const later = new Date(now.getTime() + RETRY_DAYS * DAY + 60_000);
  ok('…tried again on the day', (await chargesDue(later)).some(r => r.id === d.id));
  const dec2 = await chargeRenewal(d.id, declining, later);
  ok('…declined again: no more tries', dec2.status === 'declined' && !dec2.retry && !(await chargesDue(new Date(later.getTime() + 10 * DAY))).some(r => r.id === d.id), dec2);

  const m = await mk(noRetry.id, new Date(now.getTime() - DAY));
  await prisma.courseMembership.update({ where: { id: m.id }, data: { autoRenewRemindedFor: m.expiresAt, renewalRemindedAt: new Date(now.getTime() - 8 * DAY) } });
  ok('monthly: due a week after its reminder', (await chargesDue(now)).some(r => r.id === m.id));
  const decM = await chargeRenewal(m.id, declining, now);
  ok('a tier with no retry: declined once, pay link only', decM.status === 'declined' && !decM.retry && !(await prisma.courseMembership.findUniqueOrThrow({ where: { id: m.id } })).autoRenewRetryAt);

  // Turning it off.
  ok('staff of another course can\'t turn it off', !(await stopAutoRenew(a.id, 'another-course')));
  ok('turned off: no reminders, no charges, the membership stays', (await stopAutoRenew(a.id, c.id)) && !(await remindersDue(new Date(now.getTime() + 25 * DAY))).some(r => r.id === a.id) && (await prisma.courseMembership.findUniqueOrThrow({ where: { id: a.id } })).status === 'active');

  // Review fixes.
  const t = await mk(yearly.id, new Date(now.getTime() - DAY));
  await prisma.courseMembership.update({ where: { id: t.id }, data: { autoRenewRemindedFor: t.expiresAt, renewalRemindedAt: new Date(now.getTime() - 31 * DAY) } });
  await prisma.membershipTier.update({ where: { id: yearly.id }, data: { annualFeeCents: 90000 } });
  ok('the dues went up after the reminder: not charged, reminded again at the new price', !(await chargesDue(now)).some(r => r.id === t.id) && (await chargeRenewal(t.id, paying, now)).status === 'skipped');
  await prisma.membershipTier.update({ where: { id: yearly.id }, data: { annualFeeCents: 80000 } });
  const other = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', annualFeeCents: 200000 } });
  await prisma.courseMembership.update({ where: { id: t.id }, data: { tierId: other.id } });
  ok('on a tier that doesn\'t renew automatically: never charged', !(await chargesDue(now)).some(r => r.id === t.id) && (await chargeRenewal(t.id, paying, now)).status === 'skipped');
  const s1 = await mk(yearly.id, new Date(now.getTime() + 20 * DAY), { renewalRemindedAt: now, autoRenewRemindedFor: new Date(now.getTime() + 20 * DAY) });
  await stopAutoRenew(s1.id, c.id);
  const s1a = await prisma.courseMembership.findUniqueOrThrow({ where: { id: s1.id } });
  ok('turned off after the reminder: the ordinary pay-link reminder still comes this term', s1a.renewalRemindedAt === null && !s1a.autoRenew);
  // Dues at the course moved to lib/membership-dues markDuesPaidAtCourse (MEM-ACCT hardening).
  const membersRoute = readFileSync('src/app/api/operator/members/route.ts', 'utf8') + readFileSync('src/lib/membership-dues.ts', 'utf8');
  ok('a member moved to another tier stops renewing automatically and is told', membersRoute.includes('if (tierId && tierId !== membership.tierId && membership.autoRenew)') && membersRoute.includes('data: STOP_DATA()'));
  ok('cash at the shop settles a declined renewal, so the next term renews', /autoRenewFailedAt: null,\n\s+autoRenewRetryAt: null,/.test(membersRoute));
  const page = readFileSync('src/app/membership/[id]/page.tsx', 'utf8');
  ok('the reminder and declined emails\' link offers "turn off" before any payment', page.includes('{info.autoRenewOn && <div className="mb-4"><AutoRenewOff id={id} token={token} /></div>}'));

  // Wiring.
  const pay = readFileSync('src/app/api/membership/[id]/route.ts', 'utf8');
  ok('the dues link takes the required box on an auto-renew tier, and keeps the exact terms and the card', pay.includes("if (m.tier?.autoRenew && autoRenewConsent !== true)") && pay.includes('autoRenewTerms: autoTerms') && pay.includes('savedPaymentMethodId: paymentMethodId'));
  const cron = readFileSync('src/app/api/cron/send-reminders/route.ts', 'utf8');
  ok('auto-renew members get their reminder, not a pay link; charges and declines run daily', cron.includes('autoRenew: false,') && cron.includes('chargeRenewal(m.id, chargeOneIntent, now)') && cron.includes('sendAutoRenewDeclinedEmail'));
  const off = readFileSync('src/app/api/membership/[id]/auto-renew/route.ts', 'utf8');
  ok('turning it off from the email link needs the link\'s token, and is rate limited', off.includes('token !== m.payToken') && off.includes("rateLimit('membership:autorenew:"));
  const tiers = readFileSync('src/app/api/operator/tiers/route.ts', 'utf8');
  ok('a course turning auto-renew off on a tier stops it for its members and tells them', tiers.includes('if (tier.autoRenew && (!updated.autoRenew || updated.termMonths !== tier.termMonths))') && tiers.includes('sendAutoRenewOffEmail'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('membership-autorenew-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
