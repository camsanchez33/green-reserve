// MEM-ACCT (Cam 2026-10-30: member billing — "their own green & cart fees, guest fees, pro shop
// sales, food & drink (later)"; settling "course decides per tier"; a limit "course sets one per
// tier"; GreenReserve's fee "collect it on the statement"):
//
//  • A tier with accountOn lets its ACTIVE members (lib/member-rates membershipLive) put things on
//    their account. Each is ONE MemberCharge line: a round — the whole group, the member's guests
//    included — or a shop sale. Staff credit a mistake back with a negative line. The one exception
//    (Cam 2026-10-31): a line put on the wrong member moves to the right one before it is billed
//    (moveCharge) — the same line, same date, on the other account.
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
export async function addCharge(tx: Tx, line: { courseId: string; membershipId: string; kind: 'round' | 'shop' | 'credit'; amountCents: number; feeCents?: number; bookingId?: string; shopSaleId?: string; note?: string; createdBy?: string; createdAt?: Date }, now = new Date()): Promise<{ ok: true; id: string; balanceCents: number } | Fail> {
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
    data: { courseId: line.courseId, membershipId: line.membershipId, kind: line.kind, amountCents: line.amountCents, feeCents: Math.max(0, line.feeCents ?? 0), bookingId: line.bookingId, shopSaleId: line.shopSaleId, note: (line.note ?? '').slice(0, 200), createdBy: (line.createdBy ?? '').slice(0, 80), ...(line.createdAt ? { createdAt: line.createdAt } : {}) },
    select: { id: true },
  });
  return { ok: true, id: row.id, balanceCents: balance + line.amountCents };
}

/**
 * MEM-ACCT (Cam 2026-10-31, "move to the right member"): a round or shop sale put on the wrong
 * member's account moves to another member, before it is billed on a statement. The round stays
 * checked in, nothing is charged or refunded; the new member's limit, active membership and
 * past-due block are checked as for any new charge. Both members are locked (in id order) so a
 * statement close can't bill the line while it moves.
 */
export async function moveCharge(courseId: string, chargeId: unknown, toMembershipId: unknown, movedBy: string) {
  if (typeof chargeId !== 'string' || !chargeId) return fail(400, 'Pick the charge to move.');
  if (typeof toMembershipId !== 'string' || !toMembershipId) return fail(400, 'Pick the member it goes on.');
  return prisma.$transaction(async tx => {
    const c = await tx.memberCharge.findFirst({ where: { id: chargeId, courseId }, select: { membershipId: true, kind: true, shopSaleId: true } });
    if (!c) return fail(404, 'That charge isn’t on this course.');
    if (c.kind === 'credit') return fail(409, 'A credit stays where it was given — give the other member their own.');
    if (c.membershipId === toMembershipId) return fail(400, 'It’s already on that member’s account.');
    if (!(await tx.courseMembership.findFirst({ where: { id: toMembershipId, courseId }, select: { id: true } }))) return fail(404, 'That member isn’t on this course.');
    // Lock order as a void takes it: the sale first, then the members (in id order, as the statement close does one).
    if (c.shopSaleId) await tx.$queryRaw`SELECT id FROM "ShopSale" WHERE id = ${c.shopSaleId} FOR UPDATE`;
    for (const id of [c.membershipId, toMembershipId].sort()) await tx.$queryRaw`SELECT id FROM "CourseMembership" WHERE id = ${id} FOR UPDATE`;
    // Read again under the locks: a statement may have just billed it, or a void taken it off.
    const line = await tx.memberCharge.findFirst({ where: { id: chargeId, courseId, membershipId: c.membershipId }, select: { kind: true, amountCents: true, feeCents: true, bookingId: true, shopSaleId: true, note: true, statementId: true, createdAt: true } });
    if (!line) return fail(409, 'This charge just changed — refresh and look again.');
    if (line.statementId) return fail(409, 'It’s already on a statement — credit it there and charge the right member.');
    await tx.memberCharge.delete({ where: { id: chargeId } });
    const moved = await addCharge(tx, { courseId, membershipId: toMembershipId, kind: line.kind as 'round' | 'shop', amountCents: line.amountCents, feeCents: line.feeCents, bookingId: line.bookingId ?? undefined, shopSaleId: line.shopSaleId ?? undefined, note: line.note, createdBy: movedBy, createdAt: line.createdAt });
    if (!moved.ok) throw new MoveRefused(moved.status, moved.error);
    // A shop sale's receipt goes to whoever it's on now.
    if (line.shopSaleId) {
      const to = await tx.courseMembership.findUniqueOrThrow({ where: { id: toMembershipId }, select: { inviteName: true, inviteEmail: true, golfer: { select: { firstName: true, lastName: true, email: true } } } });
      await tx.shopSale.update({ where: { id: line.shopSaleId }, data: { customerName: ((to.golfer ? `${to.golfer.firstName} ${to.golfer.lastName}`.trim() : '') || to.inviteName).slice(0, 80), customerEmail: (to.golfer?.email || to.inviteEmail || '').toLowerCase().slice(0, 200), customerPhone: '' } });
    }
    return { ok: true as const, id: moved.id, balanceCents: moved.balanceCents };
  }).catch(err => { if (err instanceof MoveRefused) return fail(err.status, err.message); throw err; });
}
class MoveRefused extends Error { constructor(public status: number, message: string) { super(message); } }

/**
 * Pure: GreenReserve's fee a credit against a round line gives back. Crediting the whole round undoes it
 * (like a waived booking: the fee comes back); a part credit is a discount on a round that was played,
 * which keeps the fee — the same as a staff refund of a played round (lib/staff-refund).
 */
export function creditFeeBack(line: { amountCents: number; feeCents: number }, creditCents: number) {
  return line.feeCents > 0 && creditCents >= line.amountCents ? line.feeCents : 0;
}

/**
 * Staff: credit an amount back (a mistake, a refund of an account charge). Needs a reason.
 * Audit 2026-10-31: crediting the whole of an unbilled round ("Credit back" on its line) also takes
 * GreenReserve's fee off that line, so the course never pays our fee on a round it credited back
 * (creditFeeBack). A part credit, or one not tied to a round, leaves the fee alone.
 */
export async function creditAccount(courseId: string, membershipId: string, amountCents: unknown, reason: unknown, createdBy: string, chargeId?: unknown) {
  const cents = Number(amountCents);
  if (!Number.isInteger(cents) || cents <= 0 || cents > MAX_CREDIT_CENTS) return fail(400, 'Enter a credit from $0.01 to $10,000.');
  const why = String(reason ?? '').trim();
  if (!why) return fail(400, 'Say why — the member sees it on their statement.');
  if (chargeId != null && (typeof chargeId !== 'string' || !chargeId)) return fail(400, 'Pick the charge to credit.');
  return prisma.$transaction(async tx => {
    if (chargeId) {
      // Locked first (addCharge takes the same lock, and a statement close takes it before billing lines).
      await tx.$queryRaw`SELECT id FROM "CourseMembership" WHERE id = ${membershipId} FOR UPDATE`;
      const line = await tx.memberCharge.findFirst({ where: { id: chargeId as string, courseId, membershipId, kind: 'round', statementId: null }, select: { id: true, amountCents: true, feeCents: true } });
      if (!line) return fail(404, 'That round isn’t unbilled on this member’s account — refresh and look again.');
      if (cents > line.amountCents) return fail(400, `At most $${(line.amountCents / 100).toFixed(2)} can be credited against this round.`);
      // The credit goes on first; only then does the round's fee come off (never one without the other).
      const added = await addCharge(tx, { courseId, membershipId, kind: 'credit', amountCents: -cents, note: why, createdBy });
      const back = creditFeeBack(line, cents);
      if (added.ok && back > 0) await tx.memberCharge.update({ where: { id: line.id }, data: { feeCents: line.feeCents - back } });
      return added;
    }
    return addCharge(tx, { courseId, membershipId, kind: 'credit', amountCents: -cents, note: why, createdBy });
  });
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
