// Takes cash (Cam 2026-11-17: "Takes cash" OFF means no cash anywhere). When a
// course's Course.takesCash is off, every path that puts cash in or takes it
// out of the drawer refuses, in the lib function that records it, so every
// route that reaches it is covered: register cash sales and their cash refunds
// and voids, tee-sheet Take cash / split + cash / walk-in cash (all through
// ringUpCash), settleAtCounter's cash path, dues, statements and event cash.
// Checks, charge-to-account, the card reader and pay links are unchanged.
// Turning it off never touches money that has already moved: nothing here
// rewrites a sale, payment or ledger row; it only refuses new cash.
// With cash off there is no drawer, so the register needn't be open to take a
// card (lib/register-open requireRegisterOpen).

import { prisma } from './prisma';

export const CASH_OFF = 'This course doesn’t take cash — take a card or send a pay link. The owner can turn cash on in Settings.';

/** null when the course takes cash; otherwise the plain error every cash path answers with. */
export async function cashRefused(courseId: string): Promise<string | null> {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { takesCash: true } });
  if (!c) return 'Course not found.';
  return c.takesCash ? null : CASH_OFF;
}
