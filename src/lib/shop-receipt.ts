// RECEIPT-3 (Cam 2026-11-09: "this is the receipt text, not even a link"; "if I click receipt as the course I should be
// able to see it, not just send to them"). A pro shop sale's receipt — one shape, shown three ways:
//  • to staff, in place on Pro shop → Sales (components/dashboard/shop/ShopReceiptBody);
//  • to the customer, on /receipt/shop/[id]?token=… (the same body, the course's bar on top);
//  • linked from the texted receipt (the text is only the link; the page is the receipt).
// The page's secret is ShopSale.receiptToken, minted the first time a receipt goes out — separate from payToken, which
// marks a sale sent as a pay link. Only a paid sale has a receipt.
import { randomUUID, timingSafeEqual } from 'crypto';
import { prisma } from './prisma';

export type ShopReceipt = {
  ref: string; courseName: string; brandColor: string; logoUrl: string; location: string;
  paidAt: string; paidWith: string; soldBy: string; customerName: string;
  lines: { name: string; unitPriceCents: number; quantity: number }[];
  discountCents: number; discountNote: string; taxCents: number; totalCents: number;
  cashTenderedCents: number | null; refundedCents: number;
};

const PAID = ['paid_cash', 'paid_card', 'paid_account'];
import { saleRef } from './sale-ref';
const paidWithOf = (status: string) => (status === 'paid_card' ? 'Card' : status === 'paid_account' ? 'On account' : 'Cash');

type Row = {
  id: string; number: number | null; status: string; totalCents: number; taxCents: number; discountCents: number; discountNote: string; cashTenderedCents: number | null;
  refundedCents: number; paidAt: Date | null; createdAt: Date; soldBy: string; customerName: string;
  lines: { name: string; unitPriceCents: number; quantity: number }[];
  course: { name: string; brandColor: string | null; logoUrl: string | null; city: string; state: string; timezone: string | null };
};
const SELECT = {
  id: true, number: true, status: true, totalCents: true, taxCents: true, discountCents: true, discountNote: true, cashTenderedCents: true, refundedCents: true,
  paidAt: true, createdAt: true, soldBy: true, customerName: true, receiptToken: true,
  lines: { orderBy: { id: 'asc' as const }, select: { name: true, unitPriceCents: true, quantity: true } },
  course: { select: { name: true, brandColor: true, logoUrl: true, city: true, state: true, timezone: true } },
};

export function receiptView(s: Row): ShopReceipt {
  return {
    ref: saleRef(s.id, s.number), courseName: s.course.name, brandColor: s.course.brandColor ?? '', logoUrl: s.course.logoUrl ?? '',
    location: [s.course.city, s.course.state].filter(Boolean).join(', '),
    paidAt: (s.paidAt ?? s.createdAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: s.course.timezone || 'America/New_York' }),
    paidWith: paidWithOf(s.status), soldBy: s.soldBy, customerName: s.customerName,
    lines: s.lines, discountCents: s.discountCents ?? 0, discountNote: s.discountNote ?? '', taxCents: s.taxCents, totalCents: s.totalCents,
    cashTenderedCents: s.status === 'paid_cash' ? s.cashTenderedCents : null, refundedCents: s.refundedCents ?? 0,
  };
}

/** Staff: the receipt of one of the course's paid sales. */
export async function staffShopReceipt(courseId: string, saleId: string): Promise<ShopReceipt | null> {
  const s = await prisma.shopSale.findFirst({ where: { id: saleId, courseId }, select: SELECT });
  return s && PAID.includes(s.status) ? receiptView(s as Row) : null;
}

/** The customer's page: a paid sale whose receipt was sent, with its secret. */
export async function publicShopReceipt(saleId: string, token: string): Promise<ShopReceipt | null> {
  if (!token || token.length > 100) return null;
  const s = await prisma.shopSale.findUnique({ where: { id: saleId }, select: SELECT });
  if (!s || !s.receiptToken || !PAID.includes(s.status)) return null;
  const a = Buffer.from(s.receiptToken), b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return receiptView(s as Row);
}

/** The receipt page's link for a paid sale of this course — the secret is minted once, then reused. */
export async function shopReceiptUrl(courseId: string, saleId: string): Promise<string | null> {
  await prisma.shopSale.updateMany({ where: { id: saleId, courseId, receiptToken: '' }, data: { receiptToken: randomUUID() } });
  const s = await prisma.shopSale.findFirst({ where: { id: saleId, courseId }, select: { receiptToken: true } });
  if (!s?.receiptToken) return null;
  return `${process.env.NEXT_PUBLIC_URL ?? ''}/receipt/shop/${saleId}?token=${s.receiptToken}`;
}
