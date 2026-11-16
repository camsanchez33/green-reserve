// @brain shop-service-fee
// SHOP-FEE-1 (Cam 2026-11-16): whether GreenReserve's 1% service fee on card
// pro-shop items applies to a course. Server only.
//
// "It must not charge any course until that course has accepted an Operator
// Agreement version that names it. Gate it per course on the accepted version,
// not one global switch." So a course is ON only when it holds an acceptance of
// a version at or after SHOP_FEE_FIRST_VERSION, of exactly the text that was
// published (the acceptance's hash equals the AgreementVersion row's), and that
// row has taken effect. Until Cam publishes the version, no course is ON, even
// one that signed it; a course that never re-accepts stays OFF for good.
//
// The fee itself (1% of the items before tax, half up) is shopServiceFeeCents
// in ./booking-fees, which is client-safe.
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { SHOP_FEE_FIRST_VERSION, shopServiceFeeCents } from './booking-fees';

type Db = Pick<Prisma.TransactionClient, 'agreementAcceptance' | 'agreementVersion'>;

/** A version names the fee when it is a YYYY-MM version at or after SHOP_FEE_FIRST_VERSION (anything else never does). */
export const namesShopFee = (version: string) => /^\d{4}-\d{2}$/.test(version) && version >= SHOP_FEE_FIRST_VERSION;

/** True when GreenReserve's shop fee applies to this course's card sales now. */
export async function shopFeeOn(courseId: string, db: Db = prisma, now: Date = new Date()): Promise<boolean> {
  const signed = (await db.agreementAcceptance.findMany({
    where: { courseId, document: 'operator_agreement', legacy: false },
    select: { version: true, textHash: true },
  })).filter(a => namesShopFee(a.version) && !!a.textHash);
  if (!signed.length) return false;
  const live = await db.agreementVersion.findMany({
    where: { document: 'operator_agreement', version: { in: signed.map(a => a.version) }, effectiveAt: { lte: now } },
    select: { version: true, textHash: true },
  });
  return live.some(v => signed.some(a => a.version === v.version && a.textHash === v.textHash));
}

let liveCache: { at: number; value: boolean } | null = null;

/**
 * True once an Operator Agreement version that names the fee is published and in effect — the day
 * the public wording (/terms, the golfer terms version) starts naming it. Cached a minute per process;
 * never throws (a database hiccup reads as "not yet", which only leaves the older, still-true wording up).
 */
export async function shopFeeVersionLive(now: Date = new Date()): Promise<boolean> {
  if (liveCache && now.getTime() - liveCache.at < 60_000) return liveCache.value;
  let value = false;
  try {
    const rows = await prisma.agreementVersion.findMany({ where: { document: 'operator_agreement', effectiveAt: { lte: now } }, select: { version: true } });
    value = rows.some(r => namesShopFee(r.version));
  } catch { value = false; }
  liveCache = { at: now.getTime(), value };
  return value;
}

/** The fee a card payment of `itemsCents` (shop items before tax) carries at this course: 0 when the course is not ON. */
export async function shopFeeForCourse(courseId: string, itemsCents: number, db: Db = prisma): Promise<number> {
  if (shopServiceFeeCents(itemsCents) <= 0) return 0;
  return (await shopFeeOn(courseId, db)) ? shopServiceFeeCents(itemsCents) : 0;
}
