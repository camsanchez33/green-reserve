// PRICE-3 (Cam 2026-10-30: "Round packs" — sold "online + counter"; what a round covers and
// who can use it "course decides per pack"; GreenReserve's $1.50 a player "per round, when
// used"): a golfer prepays for N rounds, then each booking uses rounds instead of paying the
// green fee.
//
//  • A pack is sold as a LINE of a walk-up sale (lib/shop-sales) — cash, pay link or card
//    reader, with its receipt, ledger row and close-out place. The line copies the pack
//    (rounds, cart, guests, days good for); the holder is the sale's customer email. There
//    is no separate holding table: a holding is a line of a paid sale, so a void or a
//    return ends it with no second write to forget.
//  • Rounds left = packRounds × (quantity − returnedQty) − packRoundsUsed. A booking takes
//    its rounds with ONE conditional update (takeRounds), holding the sale row FOR SHARE so
//    a void or a refund in the same moment waits for it, and gives them back (giveBack) on
//    a cancel before the cutoff, when the course calls it off or waives, and for players
//    taken off before the cutoff — the same rule as the booking fee. A late cancel or a
//    no-show keeps them. (A counter booking takes its rounds just before the booking is made
//    and gives them back if it fails; a crash in between would leave them taken — staff give
//    them back by hand.)
//  • Holder only: the holder's seat is free (and its cart when the pack covers carts) —
//    stored as the member spot (memberRateCents 0), so party-size changes and partial
//    check-ins price the rest of the group as usual. Guests too: every player uses a round,
//    the whole green fee (and cart when covered) is $0; the group can shrink (rounds back
//    before the cutoff) but not grow on the pack.
//  • A pack replaces the rate: no member, resident, senior or junior rate and no promo code
//    on the same booking. Other players pay the public price (a last-minute deal applies).
//  • The booking fee ($1.50 a player) is charged as on any booking.
//  • PRICE-4 (Cam 2026-10-30: "up to course and has to have terms"): each pack says what an
//    unpaid pay link does when the pack changes — 'keep' holds what it was sent at; 'current'
//    closes it (closeStalePackLinks, after every edit and before an online Buy reuses it) so
//    the golfer buys again at the new price. The pay page shows packTermsText and the golfer
//    ticks a required box; the text they agreed to is kept on the sale (termsAgreed).
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { createSale, cancelSaleIntent, settleOpenSale } from './shop-sales';

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });
type Tx = Prisma.TransactionClient;

export const MAX_PACK_ROUNDS = 200;
export const PACK_NO_CODE = 'A promo code can’t be used with a round pack.';

export type OpenLinks = 'keep' | 'current';
export type PackRow = { id: string; name: string; rounds: number; priceCents: number; coversCart: boolean; guests: boolean; validDays: number | null; sellOnline: boolean; openLinks: OpenLinks; active: boolean };

/** Validate a pack from Settings → Pro shop. */
export function readPack(b: Record<string, unknown>): { ok: true; data: Omit<PackRow, 'id'> } | Fail {
  const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) return fail('Give the pack a name, like "10-round pass".');
  const rounds = Number(b.rounds);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_PACK_ROUNDS) return fail(`Rounds is 1 to ${MAX_PACK_ROUNDS}.`);
  const priceCents = Number(b.priceCents);
  if (!Number.isInteger(priceCents) || priceCents < 100 || priceCents > 1_000_000) return fail('Enter a price from $1 to $10,000.');
  const validDays = b.validDays === '' || b.validDays == null ? null : Number(b.validDays);
  if (validDays !== null && (!Number.isInteger(validDays) || validDays < 1 || validDays > 3650)) return fail('Good for is a number of days, or blank for no end.');
  const openLinks: OpenLinks = b.openLinks === 'current' ? 'current' : 'keep';
  return { ok: true, data: { name, rounds, priceCents, coversCart: b.coversCart === true, guests: b.guests === true, validDays, sellOnline: b.sellOnline === true, openLinks, active: b.active !== false } };
}

export const listPacks = (courseId: string) => prisma.roundPack.findMany({ where: { courseId }, orderBy: [{ active: 'desc' }, { priceCents: 'asc' }] });

const PAID = ['paid_cash', 'paid_card'];

/** Pure: rounds left on a line, and whether its time is up. */
export function packLeft(l: { packRounds: number; quantity: number; returnedQty: number; packRoundsUsed: number }) {
  return Math.max(0, l.packRounds * (l.quantity - l.returnedQty) - l.packRoundsUsed);
}
export function packExpiresAt(paidAt: Date | null, validDays: number | null): Date | null {
  return paidAt && validDays ? new Date(paidAt.getTime() + validDays * 86_400_000) : null;
}

export type Holding = { lineId: string; name: string; left: number; coversCart: boolean; guests: boolean; expiresAt: string | null; holderName: string; holderEmail: string };

const LINE_SELECT = {
  id: true, name: true, quantity: true, returnedQty: true, packRounds: true, packRoundsUsed: true, packCoversCart: true, packGuests: true, packValidDays: true,
  sale: { select: { customerName: true, customerEmail: true, paidAt: true } },
} as const;
type LineRow = Prisma.ShopSaleLineGetPayload<{ select: typeof LINE_SELECT }>;

function toHolding(l: LineRow): Holding {
  const exp = packExpiresAt(l.sale.paidAt, l.packValidDays);
  return { lineId: l.id, name: l.name, left: packLeft(l), coversCart: l.packCoversCart, guests: l.packGuests, expiresAt: exp ? exp.toISOString() : null, holderName: l.sale.customerName, holderEmail: l.sale.customerEmail };
}
const usable = (h: Holding, now: Date) => h.left > 0 && (!h.expiresAt || new Date(h.expiresAt) > now);

/** A holder's packs with rounds left, soonest to end first. */
export async function holdingsFor(courseId: string, email: string, now = new Date()): Promise<Holding[]> {
  const e = email.trim();
  if (!e) return [];
  const lines = await prisma.shopSaleLine.findMany({
    where: { roundPackId: { not: null }, sale: { courseId, status: { in: PAID }, customerEmail: { equals: e, mode: 'insensitive' } } },
    select: LINE_SELECT, take: 100,
  });
  return lines.map(toHolding).filter(h => usable(h, now)).sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'));
}

/** Staff: holders by name or email (the counter's pack picker and the holders list). */
export async function findHoldings(courseId: string, q: string, opts: { all?: boolean; byEmail?: boolean } = {}, now = new Date()): Promise<Holding[]> {
  const t = q.trim();
  const lines = await prisma.shopSaleLine.findMany({
    where: {
      roundPackId: { not: null },
      // Searching by email only for staff who may see emails — else the search would reveal them.
      sale: { courseId, status: { in: PAID }, ...(t ? { OR: [{ customerName: { contains: t, mode: 'insensitive' } }, ...(opts.byEmail ? [{ customerEmail: { contains: t, mode: 'insensitive' as const } }] : [])] } : {}) },
    },
    select: LINE_SELECT, orderBy: { sale: { paidAt: 'desc' } }, take: opts.all ? 500 : 20,
  });
  const all = lines.map(toHolding);
  return opts.all ? all : all.filter(h => usable(h, now));
}

/** One holding of this course by its line id (usable or not), or null. */
export async function holdingById(courseId: string, lineId: string): Promise<Holding | null> {
  const l = await prisma.shopSaleLine.findFirst({ where: { id: lineId, roundPackId: { not: null }, sale: { courseId, status: { in: PAID } } }, select: LINE_SELECT });
  return l ? toHolding(l) : null;
}

export class PackError extends Error {}

/**
 * Take `n` rounds from a holding for a booking, inside the caller's transaction. The sale
 * row is held FOR SHARE first, so a void or refund of it waits; the count is checked again
 * under the write. The holder must be `email` when given (online: the signed-in golfer).
 */
export async function takeRounds(tx: Tx, courseId: string, lineId: string, n: number, opts: { email?: string; now?: Date } = {}): Promise<Holding> {
  const now = opts.now ?? new Date();
  const line = await tx.shopSaleLine.findUnique({ where: { id: lineId }, select: { ...LINE_SELECT, roundPackId: true, saleId: true } });
  if (!line || !line.roundPackId) throw new PackError('That round pack isn’t on this course.');
  const sale = await tx.$queryRaw<{ courseId: string; status: string }[]>`SELECT "courseId", "status" FROM "ShopSale" WHERE "id" = ${line.saleId} FOR SHARE`;
  if (!sale[0] || sale[0].courseId !== courseId) throw new PackError('That round pack isn’t on this course.');
  if (!PAID.includes(sale[0].status)) throw new PackError('That round pack isn’t paid.');
  if (opts.email !== undefined && line.sale.customerEmail.toLowerCase() !== opts.email.trim().toLowerCase()) throw new PackError('That round pack belongs to someone else.');
  const h = toHolding(line);
  if (h.expiresAt && new Date(h.expiresAt) <= now) throw new PackError('That round pack has ended.');
  if (!Number.isInteger(n) || n < 1) throw new PackError('Use at least one round.');
  const done = await tx.$executeRaw`UPDATE "ShopSaleLine" SET "packRoundsUsed" = "packRoundsUsed" + ${n} WHERE "id" = ${lineId} AND "packRoundsUsed" + ${n} <= "packRounds" * ("quantity" - "returnedQty")`;
  if (done !== 1) throw new PackError(h.left > 0 ? `Only ${h.left} round${h.left === 1 ? '' : 's'} left on that pack.` : 'That round pack is used up.');
  return { ...h, left: h.left - n };
}

/** Give rounds back to a holding (never below zero). */
export async function giveBack(db: Tx | typeof prisma, lineId: string | null | undefined, n: number): Promise<void> {
  if (!lineId || n <= 0) return;
  await db.$executeRaw`UPDATE "ShopSaleLine" SET "packRoundsUsed" = GREATEST(0, "packRoundsUsed" - ${n}) WHERE "id" = ${lineId}`;
}

/** How many of a group use rounds: the holder alone, or every player when guests can (all of them, or the pack can't cover the group). */
export function packSeats(h: Pick<Holding, 'guests' | 'left'>, players: number): { ok: true; seats: number } | Fail {
  if (!h.guests) return { ok: true, seats: 1 };
  if (h.left < players) return fail(`Only ${h.left} round${h.left === 1 ? '' : 's'} left on that pack — book ${h.left} on it and the rest separately.`);
  return { ok: true, seats: players };
}

/**
 * The group's green and cart fees on a pack: `seats` players free (their cart too when the
 * pack covers carts), the rest at `publicGreen` / `cartFee`. Holder only: the holder's seat is
 * stored as the member spot — even alone — so a guest added later pays (lib/member-rates
 * partyFees). Guests too (every player on the pack): nothing to store; the group can't grow on
 * the pack (changePartySize refuses it).
 */
export function packPrice(o: { players: number; seats: number; guests: boolean; coversCart: boolean; publicGreen: number; cartFee: number; cart: boolean }) {
  const others = o.players - o.seats;
  const greenFeeTotal = others * o.publicGreen;
  const cartFeeTotal = o.cart ? (o.coversCart ? others : o.players) * o.cartFee : 0;
  const spot = o.guests ? { memberRateCents: null, memberCartCents: null } : { memberRateCents: 0, memberCartCents: o.cart ? (o.coversCart ? 0 : o.cartFee) : null };
  return { greenFeeTotal, cartFeeTotal, ...spot };
}

/**
 * A pack sale refunded OUTSIDE the app (the Stripe dashboard, a dispute): its packs end, so
 * the money and the rounds can't both go back to the holder. Any such refund, even part of
 * the sale, ends every pack on it (the safe side). Refunds made from the register return the
 * pack by item and never come here.
 */
export async function endPacksRefundedOutside(paymentIntentId: string | null | undefined): Promise<number> {
  if (!paymentIntentId) return 0;
  const sale = await prisma.shopSale.findFirst({ where: { paymentIntentId }, select: { id: true } });
  if (!sale) return 0;
  // Counted as returned (not as used): rounds a cancel later gives back can't bring the pack back.
  return prisma.$executeRaw`UPDATE "ShopSaleLine" SET "returnedQty" = "quantity" WHERE "saleId" = ${sale.id} AND "roundPackId" IS NOT NULL AND "returnedQty" < "quantity"`;
}

/**
 * A signed-in golfer buys a pack online: a walk-up sale on a pay link (/pay/shop/[id]), the
 * golfer's account email the holder. Buying the same pack again while its link is still
 * unpaid gives back that link — one open sale per golfer and pack, never a pile on the
 * register. (The register stops listing an unpaid online sale after a day and a half; its
 * link still works.)
 */
export async function buyPackOnline(courseId: string, packId: string, golfer: { email: string; name: string; phone: string }): Promise<{ ok: true; saleId: string; payToken: string } | { ok: false; status: number; error: string }> {
  const pack = await prisma.roundPack.findFirst({ where: { id: packId, courseId, active: true, sellOnline: true }, select: { id: true, openLinks: true } });
  if (!pack) return { ok: false, status: 404, error: 'That pack isn’t for sale online.' };
  // PRICE-4: a course that reprices unpaid links closes any stale one first (a close an edit missed heals here).
  if (pack.openLinks === 'current' && (await closeStalePackLinks(courseId, pack.id)).failed) return { ok: false, status: 409, error: 'That pack just changed — try again in a moment.' };
  const email = golfer.email.trim().toLowerCase();
  const open = await prisma.shopSale.findFirst({ where: { courseId, status: 'open', soldBy: 'online', customerEmail: email, payToken: { not: '' }, lines: { some: { roundPackId: pack.id } } }, orderBy: { createdAt: 'desc' }, select: { id: true, payToken: true } });
  if (open) return { ok: true, saleId: open.id, payToken: open.payToken };
  const sale = await createSale({ courseId, lines: [{ roundPackId: pack.id, quantity: 1 }], pay: 'link', soldBy: 'online', customerName: golfer.name, customerPhone: golfer.phone, customerEmail: email });
  if (!sale.ok) return { ok: false, status: sale.status, error: sale.error };
  return { ok: true, saleId: sale.value.id, payToken: sale.value.payToken };
}

type TermsLine = { name: string; packRounds: number; packCoversCart: boolean; packGuests: boolean; packValidDays: number | null };

/** PRICE-4: what the golfer agrees to before paying for a pack — built only from what the sale line carries. */
export function packTermsText(l: TermsLine, openLinks: OpenLinks, courseName: string): string {
  return [
    `${l.name}: ${l.packRounds} round${l.packRounds === 1 ? '' : 's'} at ${courseName}${l.packCoversCart ? ', cart included' : ''}.`,
    l.packGuests ? 'For you and the players in your bookings — one round a player.' : 'For you only — one round a booking, for your own place in the group.',
    l.packValidDays ? `Good for ${l.packValidDays} days from the day you pay; rounds not used by then end.` : 'No end date.',
    'Use them when you book online or at the pro shop. A round comes back if you cancel before the cancellation cutoff; a late cancel or a no-show uses it.',
    'The booking fee shown when you book still applies to each round.',
    'Once a round from this pack is used, the pack can’t be refunded.',
    openLinks === 'current' ? 'If the course changes this pack before you pay, this link closes and a new one is needed at the new price.' : 'The price on this link is held until you pay.',
  ].join(' ');
}

/** PRICE-4: the terms for a sale's pack lines ("" when it has none), with each pack's own link rule. */
export async function saleTerms(courseName: string, lines: (TermsLine & { roundPackId: string | null })[]): Promise<string> {
  const packLines = lines.filter(l => l.roundPackId && l.packRounds > 0);
  if (!packLines.length) return '';
  const packs = await prisma.roundPack.findMany({ where: { id: { in: packLines.map(l => l.roundPackId!) } }, select: { id: true, openLinks: true } });
  const rule = new Map(packs.map(p => [p.id, p.openLinks === 'current' ? 'current' as const : 'keep' as const]));
  return packLines.map(l => packTermsText(l, rule.get(l.roundPackId!) ?? 'keep', courseName)).join('\n\n');
}

type PackNow = { name: string; rounds: number; priceCents: number; coversCart: boolean; guests: boolean; validDays: number | null };
const lineMatchesPack = (l: TermsLine & { unitPriceCents: number }, p: PackNow) =>
  l.name === p.name && l.unitPriceCents === p.priceCents && l.packRounds === p.rounds && l.packCoversCart === p.coversCart && l.packGuests === p.guests && l.packValidDays === p.validDays;

/**
 * PRICE-4: the pay route's own check before charging — a line of a 'current' pack that no longer
 * matches it is never paid, even when the close after the edit failed: the link is closed here
 * (best effort) and the payment refused either way. Null = fine to charge.
 */
export async function stalePackLinkBlock(courseId: string, lines: (TermsLine & { roundPackId: string | null; unitPriceCents: number })[]): Promise<string | null> {
  const ids = [...new Set(lines.filter(l => l.roundPackId && l.packRounds > 0).map(l => l.roundPackId!))];
  if (!ids.length) return null;
  const packs = await prisma.roundPack.findMany({ where: { id: { in: ids }, courseId, openLinks: 'current' }, select: { id: true, name: true, rounds: true, priceCents: true, coversCart: true, guests: true, validDays: true } });
  for (const p of packs) {
    if (lines.every(l => l.roundPackId !== p.id || lineMatchesPack(l, p))) continue;
    await closeStalePackLinks(courseId, p.id);
    return 'The course changed this round pack before it was paid, so this link is closed. Nothing was charged.';
  }
  return null;
}

/**
 * PRICE-4: close every unpaid link (status 'open') with a line for this pack that no longer matches
 * it — its card intent stopped first, then the sale voided with a note the pay page shows. A
 * payment already going through ('paying') is never touched. Never throws.
 */
export async function closeStalePackLinks(courseId: string, packId: string): Promise<{ closed: number; failed: number }> {
  const pack = await prisma.roundPack.findFirst({ where: { id: packId, courseId }, select: { name: true, rounds: true, priceCents: true, coversCart: true, guests: true, validDays: true } });
  if (!pack) return { closed: 0, failed: 0 };
  const lines = await prisma.shopSaleLine.findMany({
    where: { roundPackId: packId, sale: { courseId, status: 'open' } },
    select: { saleId: true, name: true, unitPriceCents: true, packRounds: true, packCoversCart: true, packGuests: true, packValidDays: true, sale: { select: { soldBy: true } } },
  });
  const stale = new Map<string, string>();
  for (const l of lines) {
    if (!lineMatchesPack(l, pack)) stale.set(l.saleId, l.sale.soldBy === 'online' ? 'The course changed this round pack before it was paid — buy it again from the course’s page.' : 'The course changed this round pack before it was paid — ask the pro shop for a new link.');
  }
  let closed = 0, failed = 0;
  for (const [saleId, note] of stale) {
    try {
      if (await cancelSaleIntent(courseId, saleId)) { failed++; continue; }
      const r = await settleOpenSale(courseId, saleId, 'void', note);
      if (r.ok) closed++; else failed++;
    } catch (err) {
      failed++;
      console.error(JSON.stringify({ ev: 'round_pack.close_link.fail', saleId, error: err instanceof Error ? err.message : String(err) }));
    }
  }
  return { closed, failed };
}

/** Rounds a booking gives back now: a cancel before the cutoff, or the course calling it off / waiving. */
export async function releaseBookingRounds(bookingId: string, n?: number): Promise<void> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { packLineId: true, packRounds: true } });
  if (!b?.packLineId || b.packRounds <= 0) return;
  const k = Math.min(n ?? b.packRounds, b.packRounds);
  await prisma.$transaction(async tx => {
    const held = await tx.booking.updateMany({ where: { id: bookingId, packRounds: b.packRounds }, data: { packRounds: b.packRounds - k } });
    if (held.count) await giveBack(tx, b.packLineId, k);
  });
}
