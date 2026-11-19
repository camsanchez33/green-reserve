// MEM-RENEW (Cam 2026-10-30: auto-renew "up to course", golfers told and agreeing with a required
// box; reminders 30 days yearly / 7 monthly; a declined renewal "up to course"): a membership on
// automatic renewal is reminded, then charged once per term on the saved card; a decline emails a
// pay link and, when the tier says so, retries once. Needs a database (no Stripe — the charge is
// injected). Run: npx tsx scripts/membership-autorenew-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { reminderLeadDays, renewalCents, autoRenewTermsText, remindersDue, markReminded, chargesDue, chargeRenewal, stopAutoRenew, RETRY_DAYS, setEndDateByStaff } from '../src/lib/membership-autorenew';

const TAG = 'autorenewdbtest';
const DAY = 86_400_000;
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseSettingChange.deleteMany({ where: { courseId: { in: ids } } });
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

  // Staff move "Runs until" by hand (Build 2026-11-19): a later date still to come clears a declined renewal; the
  // charge then waits for a fresh notice for the new date, never charges twice for a term, and every change is logged.
  const actor = { type: 'operator' as const, id: op.id, name: 'Owner' };
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
  // What the route does: the row read now, and the day the staff member's card showed.
  const setEnd = async (id: string, next: Date | null, was?: string) => { const row = await fresh(id); return setEndDateByStaff(row, { was: was ?? day(row.expiresAt), next }, actor, now); };
  const fresh = (id: string) => prisma.courseMembership.findUniqueOrThrow({ where: { id } });
  const audits = (id: string) => prisma.courseSettingChange.findMany({ where: { courseId: c.id, field: `membership.expiresAt:${id}` }, orderBy: { createdAt: 'asc' } });
  const x = await mk(yearly.id, new Date(now.getTime() - DAY));
  await prisma.courseMembership.update({ where: { id: x.id }, data: { autoRenewRemindedFor: x.expiresAt, renewalRemindedAt: new Date(now.getTime() - 31 * DAY) } });
  ok('(set-up) declined at the end of the term, a retry pending', (await chargeRenewal(x.id, declining, now)).status === 'declined' && !!(await fresh(x.id)).autoRenewRetryAt);
  const newEnd = new Date(`${new Date(now.getTime() + 31 * DAY).toISOString().slice(0, 10)}T00:00:00Z`);
  const ext = await setEnd(x.id, newEnd);
  const x1 = await fresh(x.id);
  ok('staff extend to a later date: the declined flag and the retry are cleared, the date moved', ext.ok && ext.cleared && x1.autoRenewFailedAt === null && x1.autoRenewRetryAt === null && x1.expiresAt?.getTime() === newEnd.getTime(), { ext, x1: [x1.autoRenewFailedAt, x1.autoRenewRetryAt, x1.expiresAt] });
  const xa = await audits(x.id);
  ok('…logged: who, the date before and after', xa.length === 1 && xa[0].actorType === 'operator' && xa[0].actorId === op.id && xa[0].actorName === 'Owner' && xa[0].before === x.expiresAt!.toISOString().slice(0, 10) && xa[0].after === newEnd.toISOString().slice(0, 10), xa);
  const n0 = charges.length;
  ok('…not charged now: the term runs into the future', (await chargeRenewal(x.id, paying, now)).status === 'skipped' && !(await chargesDue(now)).some(r => r.id === x.id) && charges.length === n0);
  const onNewDate = new Date(newEnd.getTime() + 60_000);
  ok('…not charged on the new date without a fresh reminder for it', !(await chargesDue(onNewDate)).some(r => r.id === x.id));
  ok('…the reminder for the new date comes in its usual window', (await remindersDue(new Date(newEnd.getTime() - 20 * DAY))).some(r => r.id === x.id));
  await markReminded(x.id, newEnd, renewalCents(yearly).totalCents, now);
  ok('…reminded: due on the new date', (await chargesDue(onNewDate)).some(r => r.id === x.id));
  const xp = await chargeRenewal(x.id, paying, onNewDate);
  const xp2 = await chargeRenewal(x.id, paying, onNewDate);
  ok('…charged once for that term, never twice', xp.status === 'paid' && xp2.status === 'skipped' && charges.length === n0 + 1 && !(await chargesDue(onNewDate)).some(r => r.id === x.id), { xp, xp2, n: charges.length - n0 });

  // Paid through a later date meanwhile: staff's stale edit is refused, and nothing is charged.
  const y = await mk(yearly.id, new Date(now.getTime() - DAY), { autoRenewFailedAt: now, autoRenewRetryAt: new Date(now.getTime() + RETRY_DAYS * DAY) });
  const shownOnCard = day(y.expiresAt);
  const paidThrough = new Date(now.getTime() + 365 * DAY);
  await prisma.courseMembership.update({ where: { id: y.id }, data: { lastPaidAt: now, expiresAt: paidThrough, autoRenewFailedAt: null, autoRenewRetryAt: null } });
  // The route reads the fresh (paid) row; the card still shows the old day.
  const yRes = await setEnd(y.id, new Date(now.getTime() + 30 * DAY), shownOnCard);
  const y1 = await fresh(y.id);
  ok('a renewal paid after staff opened the member: their edit is refused, the paid date stands, nothing logged', !yRes.ok && y1.expiresAt?.getTime() === paidThrough.getTime() && (await audits(y.id)).length === 0, { yRes, y1: y1.expiresAt });
  const n1 = charges.length;
  ok('…and a membership paid through the date is never charged', (await chargeRenewal(y.id, paying, now)).status === 'skipped' && (await chargeRenewal(y.id, paying, new Date(now.getTime() + 200 * DAY))).status === 'skipped' && charges.length === n1);
  // A shorter date on a paid-through membership with an old flag: logged, the flag stays, no charge before its date.
  await prisma.courseMembership.update({ where: { id: y.id }, data: { autoRenewFailedAt: now } });
  const yShort = await setEnd(y.id, new Date(now.getTime() + 200 * DAY));
  ok('a shorter date clears nothing (logged)', yShort.ok && !yShort.cleared && (await fresh(y.id)).autoRenewFailedAt !== null && (await audits(y.id)).length === 1, yShort);

  // A later date that is already past, or a blank one: logged, nothing cleared, no reminder.
  const z = await mk(yearly.id, new Date(now.getTime() - 3 * DAY), { autoRenewFailedAt: now, autoRenewRetryAt: new Date(now.getTime() + RETRY_DAYS * DAY) });
  const zPast = await setEnd(z.id, new Date(now.getTime() - DAY));
  const z1 = await fresh(z.id);
  ok('a later date that has already passed clears nothing', zPast.ok && !zPast.cleared && z1.autoRenewFailedAt !== null && z1.autoRenewRetryAt !== null && !(await remindersDue(now)).some(r => r.id === z.id), zPast);
  const zBlank = await setEnd(z.id, null);
  const za = await audits(z.id);
  ok('a blank date clears nothing and is logged with an empty after', zBlank.ok && !zBlank.cleared && (await fresh(z.id)).autoRenewFailedAt !== null && za.length === 2 && za[1].after === '', za);
  const zSame = await setEnd(z.id, null);
  ok('the same date again: nothing written', zSame.ok && !zSame.cleared && (await audits(z.id)).length === 2);
  // The member card sends "Runs until" with every edit: the same day back keeps a paid term's time and logs nothing.
  const xNow = await fresh(x.id);
  const sameDay = await setEnd(x.id, new Date(`${xNow.expiresAt!.toISOString().slice(0, 10)}T00:00:00Z`));
  ok('an edit that sends the same day back changes nothing (the paid term\'s time of day stays, no log)', sameDay.ok && !sameDay.cleared && (await fresh(x.id)).expiresAt?.getTime() === xNow.expiresAt?.getTime() && (await audits(x.id)).length === 1, sameDay);

  // Dues being paid right now (a renewal charge or the card reader): the date waits.
  const w = await mk(yearly.id, new Date(now.getTime() - DAY), { autoRenewFailedAt: now, duesChargeStartedAt: now });
  const wRes = await setEnd(w.id, new Date(now.getTime() + 60 * DAY));
  const w1 = await fresh(w.id);
  ok('a charge in flight: refused, nothing changed or logged', !wRes.ok && w1.expiresAt?.getTime() === w.expiresAt?.getTime() && w1.autoRenewFailedAt !== null && (await audits(w.id)).length === 0, wRes);
  await prisma.courseMembership.update({ where: { id: w.id }, data: { duesChargeStartedAt: null, duesReaderId: 'tmr_x' } });
  ok('…dues on the card reader: refused too', !(await setEnd(w.id, new Date(now.getTime() + 60 * DAY))).ok);
  { const xr = await fresh(x.id); ok('…another course\'s membership is never written', !(await setEndDateByStaff({ ...xr, courseId: 'another-course' }, { was: day(xr.expiresAt), next: new Date(now.getTime() + 500 * DAY) }, actor, now)).ok); }
  // Extend by mistake, then put the old date back: the old reminder is gone with the flag, so no charge re-arms.
  const v = await mk(yearly.id, new Date(`${day(new Date(now.getTime() - DAY))}T00:00:00Z`));
  await prisma.courseMembership.update({ where: { id: v.id }, data: { autoRenewRemindedFor: v.expiresAt, renewalRemindedAt: new Date(now.getTime() - 31 * DAY) } });
  await chargeRenewal(v.id, declining, now);
  await setEnd(v.id, new Date(now.getTime() + 40 * DAY));
  const vBack = await setEnd(v.id, v.expiresAt);
  const v1 = await fresh(v.id);
  ok('extend, then put the old date back: no charge re-armed, no reminder for the old date', vBack.ok && v1.expiresAt?.getTime() === v.expiresAt?.getTime() && v1.autoRenewRemindedFor === null && !(await chargesDue(now)).some(r => r.id === v.id), { v1: [v1.autoRenewRemindedFor, v1.autoRenewFailedAt] });
  const memRoute = readFileSync('src/app/api/operator/members/route.ts', 'utf8');
  ok('the members route sets "Runs until" only through setEndDateByStaff, as the signed-in login, 409 when refused', memRoute.includes('await setEndDateByStaff(current, { was, next: expiresAt ? new Date(expiresAt) : null }, actor)') && memRoute.includes("const was = body.expiresAtWas;") && memRoute.includes('await settleStaleDuesReader(membership);') && !/^\s+expiresAt: expiresAt !== undefined/m.test(memRoute) && memRoute.includes("? { type: 'staff' as const, id: session.staffId ?? '', name: me?.name ?? '' }") && /if \(!set\.ok\) return NextResponse\.json\(\{ error: [^}]+\}, \{ status: 409 \}\)/.test(memRoute));

  const card = readFileSync('src/components/dashboard/members/MemberCard.tsx', 'utf8');
  ok('the member card sends "Runs until" only when changed, with the day it showed', card.includes("const dates = edit.expiresAt !== was ? { expiresAt: edit.expiresAt || null, expiresAtWas: was } : {};") && card.includes('...dates,') && !card.includes('expiresAt: edit.expiresAt || null, name'));
  // Wiring.
  // Memberships item 1: the pay link's charge is lib/dues-payment (by 'golfer'); staff paying never turn renewal on.
  const pay = readFileSync('src/app/api/membership/[id]/route.ts', 'utf8') + readFileSync('src/lib/dues-payment.ts', 'utf8');
  ok('the dues link takes the required box on an auto-renew tier, and keeps the exact terms and the card', pay.includes("by: 'golfer', autoRenewConsent, autoRenewTerms") && pay.includes("const renews = opts.by === 'golfer' && !!m.tier?.autoRenew;") && pay.includes("if (renews && opts.autoRenewConsent !== true)") && pay.includes('autoRenewTerms: autoTerms') && pay.includes('savedPaymentMethodId: paymentMethodId'));
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
