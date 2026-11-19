// renewalPending on GET /api/member/<slug>/session (Build 2026-11-19): true only when an automatic renewal charge will
// actually be attempted for this term (lib/membership-autorenew renewalWillCharge, the same conditions remindersDue,
// chargesDue and chargeRenewal use). Always a boolean; false for residents.
// Run: npx tsx scripts/renewal-pending-test.ts
import { readFileSync } from 'fs';
import { renewalWillCharge, renewalCents, reminderLeadDays } from '../src/lib/membership-autorenew';

let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || i === '' ? '' : ' — ' + JSON.stringify(i)}`); if (!c) failed++; };

const DAY = 86_400_000;
const now = new Date('2026-11-19T12:00:00Z');
const at = (days: number) => new Date(now.getTime() + days * DAY);
const tier = { autoRenew: true, active: true, annualFeeCents: 50000, termMonths: 12 };
const cents = renewalCents(tier).totalCents;
const base = {
  status: 'active', autoRenew: true, savedCustomerId: 'cus_1', savedPaymentMethodId: 'pm_1', autoRenewFailedAt: null as Date | null, autoRenewRetryAt: null as Date | null,
  autoRenewRemindedFor: null as Date | null, autoRenewRemindedCents: null as number | null, expiresAt: at(10) as Date | null, tier: tier as typeof tier | null,
};
const course = { stripeAccountId: 'acct_1' as string | null, stripeAccountActive: true };
const w = (m: Partial<typeof base>, c: Partial<typeof course> = {}) => renewalWillCharge({ ...base, ...m }, { ...course, ...c }, now);

ok('everything in place, 10 days before a yearly renewal: pending', w({}) === true);
ok('inside the notice window to the day (30 days for a yearly term)', reminderLeadDays(12) === 30 && w({ expiresAt: at(30) }) === true && w({ expiresAt: at(30.01) }) === false);
ok('a monthly term: 7 days', w({ expiresAt: at(7), tier: { ...tier, termMonths: 1 } }) === true && w({ expiresAt: at(8), tier: { ...tier, termMonths: 1 } }) === false);
ok('auto-renew off: false', w({ autoRenew: false }) === false);
ok('no saved card: false', w({ savedCustomerId: '' }) === false && w({ savedPaymentMethodId: '' }) === false);
ok('the course\'s Stripe not active: false', w({}, { stripeAccountActive: false }) === false && w({}, { stripeAccountId: '' }) === false && w({}, { stripeAccountId: null }) === false);
ok('the tier inactive, or no longer renewing automatically: false', w({ tier: { ...tier, active: false } }) === false && w({ tier: { ...tier, autoRenew: false } }) === false && w({ tier: null }) === false);
ok('a failure already (declined, or a retry waiting): false', w({ autoRenewFailedAt: at(-1) }) === false && w({ autoRenewRetryAt: at(2) }) === false);
ok('membership not active, or no end date: false', w({ status: 'cancelled' }) === false && w({ expiresAt: null }) === false);
ok('no dues to charge: false', w({ tier: { ...tier, annualFeeCents: 0 } }) === false);
ok('past the date with this term\'s reminder for today\'s amount: pending (the run charges it)', w({ expiresAt: at(-1), autoRenewRemindedFor: at(-1), autoRenewRemindedCents: cents }) === true);
ok('past the date with no reminder for this term: false (the run never charges it)', w({ expiresAt: at(-1) }) === false && w({ expiresAt: at(-1), autoRenewRemindedFor: at(-400), autoRenewRemindedCents: cents }) === false);
ok('past the date, reminded of a different amount: false', w({ expiresAt: at(-1), autoRenewRemindedFor: at(-1), autoRenewRemindedCents: cents + 1 }) === false);
ok('always a boolean', [w({}), w({ tier: null }), w({ expiresAt: null }), w({}, { stripeAccountId: null })].every(v => typeof v === 'boolean'));

// The route: every response carries renewalPending as a boolean; the resident-only one is false.
const route = readFileSync('src/app/api/member/[courseSlug]/session/route.ts', 'utf8');
ok('the resident-only response sends renewalPending: false', /membershipType: 'Resident'[\s\S]*renewalPending: false,[\s\S]*upcoming,\s*\}\);/.test(route));
ok('the member response sends renewalWillCharge(membership, course)', route.includes('renewalPending: renewalWillCharge(membership, course),'));
ok('the course read carries the Stripe fields it needs (never sent on the response)', route.includes('stripeAccountId: true, stripeAccountActive: true') && !/stripeAccount\w*:\s*course\./.test(route));
ok('the conditions match the charge run\'s own', (() => {
  const lib = readFileSync('src/lib/membership-autorenew.ts', 'utf8');
  return lib.includes("where: { autoRenew: true, status: 'active', tier: { autoRenew: true, active: true }") && lib.includes("if (!m.course.stripeAccountActive || !m.course.stripeAccountId) return { status: 'skipped'")
    && lib.includes("if (!m.savedCustomerId || !m.savedPaymentMethodId) return { status: 'skipped'");
})());

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
