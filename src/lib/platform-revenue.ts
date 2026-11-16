// GreenReserve's own revenue by source, from the money ledger (MoneyMove.platformFeeCents: taken, less given back), by
// month in the platform's timezone. Revenue by source (Cam 2026-11-16): the $1.50 booking fee, the 1% shop service fee
// (SHOP-FEE-1) and the 1% on dues and season passes are each their own line (lib/finance-period revenueSource). TEST-2:
// real courses only. Used by /api/admin/finance; scripts/revenue-by-source-db-test.ts runs it against a database.
//
// A round paid by card carries the 1% on the shop items added to it inside its application fee
// (lib/shop roundApplicationFeeCents). Its shop part (shopCents) is the row's fee in proportion to the booking's
// shop fee over every round fee the booking paid in — finance-period roundShopShareCents, in SQL — and is moved
// from the round's source to shopFees. A booking fee on a no-show or cancelled booking is noShowLateFees.
import { prisma } from './prisma';
import { PLATFORM_TZ } from './admin-day';
import { revenueSource, REVENUE_SOURCES, type RevenueSource } from './finance-period';

type MonthRow = { month: string; what: string; cents: bigint; shopCents: bigint | null };

export const emptySources = (): Record<RevenueSource, number> => ({ serviceFees: 0, noShowLateFees: 0, shopFees: 0, membershipDues: 0, other: 0 });
export const sourcesTotal = (s: Record<RevenueSource, number>) => REVENUE_SOURCES.reduce((n, k) => n + s[k], 0);

/** GreenReserve's fees by month ('YYYY-MM') and source, for money that moved in [from, to). */
export async function feesBySourceByMonth(from: Date, to: Date): Promise<Map<string, Record<RevenueSource, number>>> {
  const rows = await prisma.$queryRaw<MonthRow[]>`
      SELECT to_char((m."at" AT TIME ZONE 'UTC') AT TIME ZONE ${PLATFORM_TZ}, 'YYYY-MM') AS month,
             CASE WHEN m."what" = 'booking_fee' AND (b."noShowAt" IS NOT NULL OR b."status" = 'cancelled') THEN 'booking_fee_no_show_late' ELSE m."what" END AS what,
             SUM(CASE WHEN m."direction" = 'out' THEN -m."platformFeeCents" ELSE m."platformFeeCents" END)::bigint AS cents,
             SUM(CASE WHEN m."what" = 'round' AND b."shopFeeCents" > 0
                      THEN (CASE WHEN m."direction" = 'out' THEN -1 ELSE 1 END)
                           * LEAST(m."platformFeeCents", COALESCE(ROUND(m."platformFeeCents"::numeric * b."shopFeeCents" / NULLIF(fin."inCents", 0)), 0))
                      ELSE 0 END)::bigint AS "shopCents"
      FROM "MoneyMove" m JOIN "Course" c ON c."id" = m."courseId" LEFT JOIN "Booking" b ON b."id" = m."bookingId"
      LEFT JOIN LATERAL (SELECT SUM(x."platformFeeCents") AS "inCents" FROM "MoneyMove" x
                         WHERE x."bookingId" = m."bookingId" AND x."what" = 'round' AND x."direction" = 'in') fin ON m."what" = 'round'
      WHERE c."isTest" = false AND m."platformFeeCents" > 0 AND m."at" >= (${from}::timestamptz AT TIME ZONE 'UTC') AND m."at" < (${to}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY 1, 2`;
  const byMonth = new Map<string, Record<RevenueSource, number>>();
  for (const r of rows) {
    const s = byMonth.get(r.month) ?? emptySources();
    const shop = Number(r.shopCents ?? 0);
    s[revenueSource(r.what)] += Number(r.cents) - shop;
    s.shopFees += shop;
    byMonth.set(r.month, s);
  }
  return byMonth;
}
