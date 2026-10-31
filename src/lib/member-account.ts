// MEM-ACCT (Cam 2026-10-30: member billing — "their own green & cart fees, guest fees, pro shop
// sales, food & drink (later)"; settling "course decides per tier"; a limit "course sets one per
// tier"; GreenReserve's fee "collect it on the statement"):
//
//  • A tier with accountOn lets its ACTIVE members (lib/member-rates membershipLive) put things on
//    their account. Each is ONE MemberCharge line: a round — the whole group, the member's guests
//    included — or a shop sale. Staff credit a mistake back with a negative line; nothing is ever
//    deleted or edited.
//  • The balance is every line not yet billed on a statement (part 2 adds statements). A charge that
//    would take the balance past the tier's limit is refused, under a row lock on the membership so
//    two counters can't both fit under it.
//  • A round put on account is settled like cash at the counter (lib/counter-pay settleAtCounter,
//    paymentStatus 'on_account'): checked in, the hold fee given back. It is not money yet — nothing
//    goes in the ledger until the statement is paid. An online booking's GreenReserve fee rides on the
//    line (feeCents) and is taken when the statement is paid; a counter booking has none.
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { membershipLive } from './member-rates';
import { pastDue } from './member-statements';

type Tx = Prisma.TransactionClient;
type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

export const MAX_CREDIT_CENTS = 1_000_000;

/** Pure: whether a charge fits under the limit (null = no limit). Credits always fit. */
export const fitsLimit = (balanceCents: number, amountCents: number, limitCents: number | null) =>
  amountCents <= 0 || limitCents == null || balanceCents + amountCents <= limitCents;

/** The member's balance: every line not billed on a statement yet, plus statements not paid yet (part 2). */
export async function accountBalance(membershipId: string, db: Tx | typeof prisma = prisma): Promise<number> {
  const [r, open] = await Promise.all([
    db.memberCharge.aggregate({ where: { membershipId, statementId: null }, _sum: { amountCents: true } }),
    db.memberStatement.aggregate({ where: { membershipId, status: 'open' }, _sum: { totalCents: true } }),
  ]);
  return (r._sum.amountCents ?? 0) + (open._sum.totalCents ?? 0);
}

/** The course's members who can charge to an account right now, with their balance and limit (the counter's picker). */
export async function accountMembers(courseId: string, q = '') {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { memberGraceDays: true, timezone: true } });
  if (!course) return [];
  const term = q.trim().slice(0, 60);
  const rows = await prisma.courseMembership.findMany({
    where: {
      courseId, status: 'active', tier: { accountOn: true },
      ...(term ? { OR: [{ inviteName: { contains: term, mode: 'insensitive' } }, { inviteEmail: { contains: term, mode: 'insensitive' } }, { golfer: { OR: [{ firstName: { contains: term, mode: 'insensitive' } }, { lastName: { contains: term, mode: 'insensitive' } }] } }] } : {}),
    },
    select: { id: true, inviteName: true, expiresAt: true, status: true, golfer: { select: { firstName: true, lastName: true } }, tier: { select: { name: true, accountLimitCents: true } } },
    orderBy: { inviteName: 'asc' },
    take: 40,
  });
  const live = rows.filter(m => membershipLive(m, course));
  const ids = live.map(m => m.id);
  const [sums, open] = ids.length ? await Promise.all([
    prisma.memberCharge.groupBy({ by: ['membershipId'], where: { membershipId: { in: ids }, statementId: null }, _sum: { amountCents: true } }),
    prisma.memberStatement.groupBy({ by: ['membershipId'], where: { membershipId: { in: ids }, status: 'open' }, _sum: { totalCents: true } }),
  ]) : [[], []];
  const bal = new Map<string, number>();
  for (const s of sums) bal.set(s.membershipId, s._sum.amountCents ?? 0);
  for (const s of open) bal.set(s.membershipId, (bal.get(s.membershipId) ?? 0) + (s._sum.totalCents ?? 0));
  return live.map(m => ({
    id: m.id,
    name: (m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}`.trim() : '') || m.inviteName,
    tierName: m.tier?.name ?? '',
    balanceCents: bal.get(m.id) ?? 0,
    limitCents: m.tier?.accountLimitCents ?? null,
  }));
}

/**
 * Put a line on a member's account, inside the caller's transaction. Checks the membership is this
 * course's, active and on a tier with accounts, and that it fits the limit (credits always do).
 */
export async function addCharge(tx: Tx, line: { courseId: string; membershipId: string; kind: 'round' | 'shop' | 'credit'; amountCents: number; feeCents?: number; bookingId?: string; shopSaleId?: string; note?: string; createdBy?: string }, now = new Date()): Promise<{ ok: true; id: string; balanceCents: number } | Fail> {
  if (!Number.isInteger(line.amountCents)) return fail(400, 'Enter an amount in cents.');
  // One counter at a time per member: the limit check and the new line commit together.
  await tx.$queryRaw`SELECT id FROM "CourseMembership" WHERE id = ${line.membershipId} FOR UPDATE`;
  const m = await tx.courseMembership.findFirst({
    where: { id: line.membershipId, courseId: line.courseId },
    select: { status: true, expiresAt: true, course: { select: { memberGraceDays: true, timezone: true } }, tier: { select: { accountOn: true, accountLimitCents: true } } },
  });
  if (!m) return fail(404, 'That member isn’t on this course.');
  if (line.kind !== 'credit') {
    if (!m.tier?.accountOn) return fail(409, 'This member’s tier doesn’t have an account — turn it on in Members → Tiers.');
    if (!membershipLive(m, m.course, now)) return fail(409, 'This membership isn’t active, so nothing can go on its account.');
  }
  // Part 2: a statement left unpaid past its due date stops new charges until it is paid.
  if (line.kind !== 'credit' && await pastDue(line.membershipId, tx, now)) return fail(409, 'This member has a statement past due — it needs paying before anything else goes on the account.');
  const balance = await accountBalance(line.membershipId, tx);
  if (!fitsLimit(balance, line.amountCents, m.tier?.accountLimitCents ?? null)) {
    const lim = m.tier!.accountLimitCents!;
    return fail(409, `That would take the account to $${((balance + line.amountCents) / 100).toFixed(2)}, past its $${(lim / 100).toFixed(2)} limit.`);
  }
  const row = await tx.memberCharge.create({
    data: { courseId: line.courseId, membershipId: line.membershipId, kind: line.kind, amountCents: line.amountCents, feeCents: Math.max(0, line.feeCents ?? 0), bookingId: line.bookingId, shopSaleId: line.shopSaleId, note: (line.note ?? '').slice(0, 200), createdBy: (line.createdBy ?? '').slice(0, 80) },
    select: { id: true },
  });
  return { ok: true, id: row.id, balanceCents: balance + line.amountCents };
}

/** Staff: credit an amount back (a mistake, a refund of an account charge). Needs a reason. */
export async function creditAccount(courseId: string, membershipId: string, amountCents: unknown, reason: unknown, createdBy: string) {
  const cents = Number(amountCents);
  if (!Number.isInteger(cents) || cents <= 0 || cents > MAX_CREDIT_CENTS) return fail(400, 'Enter a credit from $0.01 to $10,000.');
  const why = String(reason ?? '').trim();
  if (!why) return fail(400, 'Say why — the member sees it on their statement.');
  return prisma.$transaction(tx => addCharge(tx, { courseId, membershipId, kind: 'credit', amountCents: -cents, note: why, createdBy }));
}

/** A member's account for the Members page: balance, limit and the lines not yet billed, newest first. */
export async function accountView(courseId: string, membershipId: string) {
  const m = await prisma.courseMembership.findFirst({ where: { id: membershipId, courseId }, select: { id: true, accountPaymentMethodId: true, tier: { select: { accountOn: true, accountLimitCents: true, accountSettle: true } } } });
  if (!m) return null;
  const lines = await prisma.memberCharge.findMany({
    where: { membershipId, statementId: null }, orderBy: { createdAt: 'desc' }, take: 200,
    select: { id: true, kind: true, amountCents: true, note: true, createdBy: true, createdAt: true, bookingId: true, shopSaleId: true },
  });
  const statements = await prisma.memberStatement.findMany({ where: { membershipId }, orderBy: { period: 'desc' }, take: 24, select: { id: true, period: true, totalCents: true, status: true, dueAt: true, paidAt: true, autoChargeAt: true, autoFailedAt: true } });
  const unbilled = lines.reduce((s, l) => s + l.amountCents, 0);
  const openCents = statements.filter(s => s.status === 'open').reduce((s, x) => s + x.totalCents, 0);
  return { accountOn: !!m.tier?.accountOn, limitCents: m.tier?.accountLimitCents ?? null, settle: m.tier?.accountSettle ?? 'link', balanceCents: unbilled + openCents, unbilledCents: unbilled, lines, statements, cardSaved: !!m.accountPaymentMethodId };
}

/** Validate a tier's account settings (Members → Tiers). */
export function readAccountSettings(b: Record<string, unknown>): { ok: true; data: { accountOn?: boolean; accountLimitCents?: number | null; accountSettle?: string } } | { ok: false; error: string } {
  const data: { accountOn?: boolean; accountLimitCents?: number | null; accountSettle?: string } = {};
  // Part 2: how statements are paid — 'link' (an emailed pay link) or 'auto' (the card the member saved for it).
  if (b.accountSettle !== undefined) {
    if (b.accountSettle !== 'link' && b.accountSettle !== 'auto') return { ok: false, error: 'Pick how statements are paid.' };
    data.accountSettle = b.accountSettle;
  }
  if (b.accountOn !== undefined) data.accountOn = b.accountOn === true;
  if (b.accountLimitCents !== undefined) {
    if (b.accountLimitCents === null || b.accountLimitCents === '') data.accountLimitCents = null;
    else {
      const n = Number(b.accountLimitCents);
      if (!Number.isInteger(n) || n < 100 || n > 10_000_000) return { ok: false, error: 'The account limit is $1 to $100,000, or blank for none.' };
      data.accountLimitCents = n;
    }
  }
  return { ok: true, data };
}
