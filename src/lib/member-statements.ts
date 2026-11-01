// MEM-ACCT part 2 (Cam 2026-10-30: statements "monthly on the 1st, due in 15 days"; how they are
// paid "course decides per tier"; the card saved with a "separate box on first statement"; a
// declined auto-charge gets a "pay link + one retry in 3 days"; GreenReserve takes "just the
// carried booking fees"):
//
//  • On the 1st (the course's day) every member's lines from before then become ONE statement for
//    the month just ended, due 15 days later. A net credit, or nothing, makes no statement — it
//    carries to next month. Closing holds the same row lock as a new charge (lib/member-account).
//  • Paid on its pay link (/statement/[id]) by card; on a tier that charges automatically, the
//    member may tick a box there to have that card charged for later statements. With a card
//    saved, a statement is charged 3 days after it closes (the email says when); a decline emails
//    the pay link and tries once more 3 days later. Staff can mark one paid at the shop.
//  • ONE PaymentIntent per statement (lib/stripe chargeOneIntent): every attempt — the pay link with
//    any card, the automatic charge, its retry — confirms the same intent, so nothing can charge twice.
//  • Every payment is claimed first (chargeStartedAt), charged outside any transaction, put on the
//    ledger (MoneyMove 'account'), then marked paid. GreenReserve's application fee is the booking
//    fees carried on the lines (feeCents), never more than the statement.
//  • A statement still open after its due date blocks new charges on the account (addCharge).
import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import { todayIn } from './course-time';
import { teeTimeInstant } from './booking-events';
import { recordMove } from './money-ledger';
import { stripe } from './stripe';

export const DUE_DAYS = 15;
export const AUTO_CHARGE_DAYS = 3;
export const RETRY_DAYS = 3;
const DAY = 86_400_000;
const STALE_MS = 10 * 60_000;

/** Pure: the month a statement closed today bills (the one before), and the moment it ends (the 1st, 00:00 at the course). */
export function periodFor(today: string): { period: string; firstOfMonth: string } {
  const [y, m] = today.split('-').map(Number);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  return { period: `${py}-${String(pm).padStart(2, '0')}`, firstOfMonth: `${y}-${String(m).padStart(2, '0')}-01` };
}

/** What the member agrees to when they save the card for statements (kept on the membership as shown). */
export function statementCardTerms(courseName: string) {
  return `I agree that ${courseName} may charge this card for each monthly statement of my member account, ${AUTO_CHARGE_DAYS} days after it is emailed to me, until I turn this off. I can turn it off at any time from any statement email.`;
}

type CloseResult = { closed: number; skipped: number; ids: string[] };

/** Close last month for one course (safe to run any day: a month is closed once per member). */
export async function closeStatements(courseId: string, now = new Date()): Promise<CloseResult> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true } });
  if (!course) return { closed: 0, skipped: 0, ids: [] };
  const { period, firstOfMonth } = periodFor(todayIn(course.timezone, now));
  const cutoff = teeTimeInstant(course.timezone, firstOfMonth, '00:00');
  if (!cutoff || cutoff.getTime() > now.getTime()) return { closed: 0, skipped: 0, ids: [] };
  const owing = await prisma.memberCharge.groupBy({ by: ['membershipId'], where: { courseId, statementId: null, createdAt: { lt: cutoff } } });
  let closed = 0, skipped = 0;
  const ids: string[] = [];
  for (const { membershipId } of owing) {
    try {
      const made = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "CourseMembership" WHERE id = ${membershipId} FOR UPDATE`;
        if (await tx.memberStatement.findUnique({ where: { membershipId_period: { membershipId, period } }, select: { id: true } })) return false;
        const lines = await tx.memberCharge.findMany({ where: { membershipId, statementId: null, createdAt: { lt: cutoff } }, select: { id: true, amountCents: true, feeCents: true } });
        const total = lines.reduce((s, l) => s + l.amountCents, 0);
        if (total <= 0) return false; // nothing owed, or a credit: it carries to next month
        const m = await tx.courseMembership.findUniqueOrThrow({ where: { id: membershipId }, select: { accountPaymentMethodId: true, tier: { select: { accountSettle: true } } } });
        const auto = m.tier?.accountSettle === 'auto' && !!m.accountPaymentMethodId;
        const st = await tx.memberStatement.create({
          data: {
            courseId, membershipId, period, closedAt: now, dueAt: new Date(now.getTime() + DUE_DAYS * DAY), totalCents: total,
            feeCents: Math.min(total, lines.reduce((s, l) => s + l.feeCents, 0)), payToken: randomUUID(),
            // An hour early, so the daily run on day 3 (about the same time of day) is never a moment too soon.
            autoChargeAt: auto ? new Date(now.getTime() + AUTO_CHARGE_DAYS * DAY - 3_600_000) : null,
          },
          select: { id: true },
        });
        await tx.memberCharge.updateMany({ where: { id: { in: lines.map(l => l.id) } }, data: { statementId: st.id } });
        return st.id;
      });
      if (made) { closed++; ids.push(made); } else skipped++;
    } catch (err) {
      skipped++;
      console.error(JSON.stringify({ ev: 'member_statement.close.fail', courseId, membershipId, error: err instanceof Error ? err.message : String(err) }));
    }
  }
  return { closed, skipped, ids };
}

// The real one is lib/stripe chargeOneIntent: ONE PaymentIntent per statement (paymentIntentId), every attempt confirming it.
export type Charger = (o: { existingIntentId: string; intentKey: string; onCreated: (id: string) => Promise<unknown>; customerId: string; paymentMethodId: string; connectedAccountId: string; amountCents: number; applicationFeeCents: number; description: string; metadata: Record<string, string> }) => Promise<{ id: string; amount: number; status: string; application_fee_amount?: number | null }>;
export type PayResult = { status: 'paid'; amountCents: number } | { status: 'declined'; error: string } | { status: 'skipped'; why: string };

/** Charge one statement to a card: claim, charge, ledger, mark paid. The caller says which card and key. */
export async function chargeStatement(statementId: string, card: { customerId: string; paymentMethodId: string; actor: 'golfer' | 'system' }, charge: Charger, now = new Date()): Promise<PayResult> {
  const st = await prisma.memberStatement.findUnique({ where: { id: statementId }, select: { id: true, courseId: true, membershipId: true, period: true, totalCents: true, feeCents: true, status: true, paymentIntentId: true, course: { select: { name: true, stripeAccountId: true, stripeAccountActive: true } } } });
  if (!st || st.status !== 'open') return { status: 'skipped', why: 'already paid' };
  if (!st.course.stripeAccountId || !st.course.stripeAccountActive) return { status: 'skipped', why: 'course not taking payments' };
  const claimed = await prisma.memberStatement.updateMany({ where: { id: st.id, status: 'open', OR: [{ chargeStartedAt: null }, { chargeStartedAt: { lt: new Date(now.getTime() - STALE_MS) } }] }, data: { chargeStartedAt: now } });
  if (!claimed.count) return { status: 'skipped', why: 'being paid now' };
  const release = () => prisma.memberStatement.updateMany({ where: { id: st.id, chargeStartedAt: now }, data: { chargeStartedAt: null } });
  let pi: { id: string; amount: number; status: string; application_fee_amount?: number | null };
  try {
    pi = await charge({
      existingIntentId: st.paymentIntentId, intentKey: `statement-intent-${st.id}`,
      onCreated: id => prisma.memberStatement.update({ where: { id: st.id }, data: { paymentIntentId: id } }),
      customerId: card.customerId, paymentMethodId: card.paymentMethodId, connectedAccountId: st.course.stripeAccountId,
      amountCents: st.totalCents, applicationFeeCents: st.feeCents,
      description: `Member account ${st.period} - ${st.course.name}`,
      metadata: { statementId: st.id, membershipId: st.membershipId },
    });
  } catch (err) {
    await release();
    return { status: 'declined', error: err instanceof Error ? err.message : 'Card declined' };
  }
  // Stripe is still settling it: keep the claim (a later run or the member's next try reads the same intent).
  if (pi.status === 'processing') return { status: 'skipped', why: 'payment processing' };
  if (pi.status !== 'succeeded') { await release(); return { status: 'declined', error: `The card needs the member (${pi.status}).` }; }
  // The money moved: on the ledger first.
  await recordMove({ courseId: st.courseId, what: 'account', direction: 'in', method: 'card', account: 'course', amountCents: pi.amount, platformFeeCents: pi.application_fee_amount ?? st.feeCents, stripeId: pi.id, membershipId: st.membershipId, actor: card.actor, note: `Statement ${st.period}` });
  const done = await prisma.memberStatement.updateMany({ where: { id: st.id, status: 'open', chargeStartedAt: now }, data: { status: 'paid', paidAt: now, paymentIntentId: pi.id, chargeStartedAt: null, autoRetryAt: null } });
  if (!done.count) console.error(JSON.stringify({ ev: 'member_statement.pay.state_changed', statementId: st.id, paymentIntentId: pi.id }));
  return { status: 'paid', amountCents: pi.amount };
}

/** Automatic charges due now (first try, or the one retry), for the daily cron. */
export async function autoChargesDue(now = new Date()) {
  return prisma.memberStatement.findMany({
    where: {
      status: 'open',
      OR: [{ autoChargeAt: { lte: now }, autoFailedAt: null }, { autoRetryAt: { lte: now } }],
      membership: { accountPaymentMethodId: { not: '' }, tier: { accountSettle: 'auto' } },
    },
    select: { id: true, autoFailedAt: true, membership: { select: { accountCustomerId: true, accountPaymentMethodId: true } } },
    take: 200,
  });
}

/** Charge one due automatic statement; a decline sets the one retry (or ends the tries). */
export async function autoChargeStatement(s: Awaited<ReturnType<typeof autoChargesDue>>[number], charge: Charger, now = new Date()): Promise<PayResult & { retryAt?: Date | null }> {
  const r = await chargeStatement(s.id, { customerId: s.membership.accountCustomerId, paymentMethodId: s.membership.accountPaymentMethodId, actor: 'system' }, charge, now);
  if (r.status !== 'declined') return r;
  const retryAt = s.autoFailedAt ? null : new Date(now.getTime() + RETRY_DAYS * DAY - 3_600_000);
  await prisma.memberStatement.update({ where: { id: s.id }, data: { autoFailedAt: now, autoRetryAt: retryAt } });
  return { ...r, retryAt };
}

/** Staff: a statement paid at the shop (cash or check). */
export async function markStatementPaidOffline(courseId: string, statementId: string, method: unknown, now = new Date()) {
  const how = method === 'check' ? 'check' : method === 'cash' || method === undefined ? 'cash' : null;
  if (!how) return { ok: false as const, status: 400, error: 'Say whether it was cash or a check.' };
  const st = await prisma.memberStatement.findFirst({ where: { id: statementId, courseId }, select: { id: true, totalCents: true, feeCents: true, membershipId: true, period: true, status: true, chargeStartedAt: true, paymentIntentId: true, course: { select: { stripeAccountId: true } } } });
  if (!st) return { ok: false as const, status: 404, error: 'That statement isn’t on this course.' };
  // Claim it first (one payment at a time), so a card payment in flight is never stopped mid-way.
  const claimed = await prisma.memberStatement.updateMany({ where: { id: st.id, status: 'open', OR: [{ chargeStartedAt: null }, { chargeStartedAt: { lt: new Date(now.getTime() - STALE_MS) } }] }, data: { chargeStartedAt: now } });
  if (!claimed.count) return { ok: false as const, status: 409, error: st.status === 'open' ? 'A card payment for it is going through — wait a few minutes.' : 'That statement is already paid.' };
  const release = () => prisma.memberStatement.updateMany({ where: { id: st.id, chargeStartedAt: now }, data: { chargeStartedAt: null } });
  // A card payment was started on it: ask Stripe, and stop it so it can never go through after the
  // cash is taken (the pro-shop pay link does the same, lib/shop-sales cancelSaleIntent).
  if (st.paymentIntentId && st.course.stripeAccountId) {
    const acct = { stripeAccount: st.course.stripeAccountId };
    let pi;
    try { pi = await stripe.paymentIntents.retrieve(st.paymentIntentId, {}, acct); }
    catch (err) { await release(); return { ok: false as const, status: 502, error: `Couldn’t check the card payment (${err instanceof Error ? err.message : 'Stripe error'}) — try again.` }; }
    if (pi.status === 'succeeded') {
      await recordMove({ courseId, what: 'account', direction: 'in', method: 'card', account: 'course', amountCents: pi.amount, platformFeeCents: pi.application_fee_amount ?? st.feeCents, stripeId: pi.id, membershipId: st.membershipId, actor: 'system', note: `Statement ${st.period}` });
      await prisma.memberStatement.updateMany({ where: { id: st.id, status: 'open', chargeStartedAt: now }, data: { status: 'paid', paidAt: now, chargeStartedAt: null, autoRetryAt: null } });
      return { ok: false as const, status: 409, error: 'This statement was just paid by card — nothing to take.' };
    }
    if (pi.status === 'processing') { await release(); return { ok: false as const, status: 409, error: 'A card payment for it is still going through — wait a few minutes.' }; }
    if (pi.status !== 'canceled') {
      try { await stripe.paymentIntents.cancel(pi.id, {}, acct); }
      catch (err) { await release(); return { ok: false as const, status: 502, error: `Couldn’t stop the card payment (${err instanceof Error ? err.message : 'Stripe error'}) — nothing was changed. Try again.` }; }
    }
  }
  const done = await prisma.memberStatement.updateMany({ where: { id: st.id, status: 'open', chargeStartedAt: now }, data: { status: 'paid_offline', paidAt: now, chargeStartedAt: null, autoRetryAt: null } });
  if (!done.count) return { ok: false as const, status: 409, error: 'That statement just changed — refresh and look again.' };
  await recordMove({ courseId, what: 'account', direction: 'in', method: how === 'cash' ? 'cash' : 'other', account: 'course', amountCents: st.totalCents, membershipId: st.membershipId, actor: 'staff', note: `Statement ${st.period}, ${how} at the course` });
  return { ok: true as const };
}

/** Email one statement to its member (the cron, right after it closes; staff "Email statement"). */
export async function emailStatement(statementId: string): Promise<'sent' | 'no_email' | 'not_found'> {
  const st = await prisma.memberStatement.findUnique({ where: { id: statementId }, select: { id: true, period: true, totalCents: true, dueAt: true, autoChargeAt: true, autoFailedAt: true, autoRetryAt: true, status: true, payToken: true, course: { select: { name: true } }, membership: { select: { inviteName: true, inviteEmail: true, golfer: { select: { email: true, firstName: true, lastName: true } } } }, _count: { select: { lines: true } } } });
  if (!st) return 'not_found';
  const email = st.membership.golfer?.email || st.membership.inviteEmail;
  if (!email) return 'no_email';
  const { sendStatementEmail } = await import('./email');
  await sendStatementEmail({
    name: st.membership.inviteName || [st.membership.golfer?.firstName, st.membership.golfer?.lastName].filter(Boolean).join(' '),
    email, courseName: st.course.name, period: st.period, totalCents: st.totalCents, lineCount: st._count.lines, dueAt: st.dueAt,
    chargeOn: st.status === 'open' ? nextCharge(st) : null, payLink: statementLink(st),
  });
  return 'sent';
}

/** When the saved card will next be charged: the retry after a decline, the first try, or never (both tried). */
export const nextCharge = (st: { autoChargeAt: Date | null; autoFailedAt: Date | null; autoRetryAt: Date | null }) => st.autoRetryAt ?? (st.autoFailedAt ? null : st.autoChargeAt);

export const statementLink = (st: { id: string; payToken: string }) => `${process.env.NEXT_PUBLIC_URL}/statement/${st.id}?token=${st.payToken}`;

/** A statement open past its due date: the account takes no new charges. */
export async function pastDue(membershipId: string, db: { memberStatement: typeof prisma.memberStatement } = prisma, now = new Date()) {
  return !!(await db.memberStatement.findFirst({ where: { membershipId, status: 'open', dueAt: { lt: now } }, select: { id: true } }));
}

/** The member's statement page: the statement, its lines and the course (token-gated). */
export async function statementForPage(id: string, token: string) {
  if (!token) return null;
  const st = await prisma.memberStatement.findUnique({
    where: { id },
    include: {
      course: { select: { name: true, brandColor: true, logoUrl: true, stripeAccountId: true, stripeAccountActive: true } },
      membership: { select: { id: true, inviteName: true, inviteEmail: true, accountPaymentMethodId: true, golfer: { select: { email: true, firstName: true, lastName: true } }, tier: { select: { name: true, accountSettle: true } } } },
    },
  });
  if (!st || st.payToken !== token) return null;
  const lines = await prisma.memberCharge.findMany({ where: { statementId: st.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, note: true, kind: true, amountCents: true } });
  return { st, lines };
}
