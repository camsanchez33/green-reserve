// Low-stock email (Cam 2026-11-15, via Build: "Reminder by email", to "whoever's email is on it" — the course
// owner's login email). When stock is taken (a paid walk-up sale, an item added to a round) and a counted item is at
// or below its "Remind me when it's below" number (ShopItem.reorderAt, the same rule as the Low on Stock list,
// lib/shop-stock isLow), the owner gets one email naming every item that just went low.
//
//  • Once per drop: the email claims ShopItem.lowNoticeAt on each low row that has none, in one UPDATE … RETURNING,
//    so two sales at once never send twice. A database trigger clears it whenever the row stops being low
//    (migration 20261115010000), whichever path raised the count — so the next drop emails again.
//  • Never blocks a sale: callers run it after their transaction has committed, and it never throws. A send that
//    fails gives its claim back, so the next sale tries again.
//  • Course-wide sweep: an item that went low any other way (a count edited down) is picked up by the next sale.
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { sendLowStockEmail } from './email';

export type LowItem = { id: string; name: string; stockCount: number; reorderAt: number };

/** Claim the low rows of a course that haven't had their email yet. */
async function claimLow(courseId: string): Promise<LowItem[]> {
  return prisma.$queryRaw<LowItem[]>(Prisma.sql`
    UPDATE "ShopItem" SET "lowNoticeAt" = NOW()
    WHERE "courseId" = ${courseId} AND "active" = true AND "lowNoticeAt" IS NULL
      AND "stockCount" IS NOT NULL AND "reorderAt" IS NOT NULL AND "stockCount" <= "reorderAt"
    RETURNING "id", "name", "stockCount", "reorderAt"`);
}

/** Give claims back after a failed send (only rows still holding that claim). */
async function unclaim(ids: string[]) {
  if (ids.length) await prisma.shopItem.updateMany({ where: { id: { in: ids }, lowNoticeAt: { not: null } }, data: { lowNoticeAt: null } });
}

/** Email the course's owner about items that just went low. Never throws; returns how many items it named.
 *  `send` is for tests only. */
export async function notifyLowStock(courseId: string, send: typeof sendLowStockEmail = sendLowStockEmail): Promise<number> {
  let items: LowItem[] = [];
  try {
    items = await claimLow(courseId);
    if (!items.length) return 0;
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true, operator: { select: { name: true, email: true } } } });
    if (!course?.operator?.email) return items.length; // nobody to tell; the claim stands until the item is restocked
    await send({ courseId, courseName: course.name, ownerName: course.operator.name, ownerEmail: course.operator.email, items: items.sort((a, b) => a.name.localeCompare(b.name)) });
    return items.length;
  } catch (e) {
    console.error('Low-stock email failed:', e instanceof Error ? e.message : e);
    await unclaim(items.map(i => i.id)).catch(err => console.error('Low-stock unclaim failed:', err instanceof Error ? err.message : err));
    return 0;
  }
}
