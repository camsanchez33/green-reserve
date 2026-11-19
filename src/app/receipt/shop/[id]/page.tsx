// RECEIPT-3 (Cam 2026-11-09: "this is the receipt text, not even a link"): the customer's receipt for a pro shop sale,
// linked from the texted receipt. Token-gated (ShopSale.receiptToken), noindex, server-rendered; the only client
// JavaScript is the course look's footer and page background.
import type { Metadata } from 'next';
import { CourseHeaderBar } from '@/components/CourseHeaderBar';
import { ShopReceiptBody } from '@/components/dashboard/shop/ShopReceiptBody';
import { LookFooter } from '@/components/golfer/LookFooter';
import { lookPicked, lookSiteVars, lookBandHex } from '@/components/golfer/look';
import { LookBackground } from '@/components/golfer/useLookBackground';
import { publicShopReceipt } from '@/lib/shop-receipt';

export const metadata: Metadata = { title: 'Receipt', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// BOOKING-LOOK-1: the card reads the look's card colour (white on Light, as Card was).
const CARD_L = 'bg-card rounded-lg shadow-card';

export default async function ShopReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token } = await searchParams;
  const r = await publicShopReceipt(id, typeof token === 'string' ? token : '');
  // BOOKING-LOOK-1: the receipt wears the course look on screen (visual only); print is black on white below. An unknown
  // receipt is today's light page.
  const lc = r ? { booking_look: r.booking_look.accent ? { look: r.booking_look.look, accent: r.booking_look.accent } : null, brand_color: r.brandColor } : null;
  const vars = lc ? lookSiteVars(lc) : undefined;
  // PERS-1: the course photo runs under the band once the receipt payload carries it (asked of Build).
  const photoUrl = r ? (r as { photoUrl?: string | null }).photoUrl : null;
  return (
    <>
      <style>{`
        @media print {
          footer { display: none !important; }
          body { background: #fff !important; }
          .shop-receipt { background: #fff !important; box-shadow: none !important; }
          .shop-receipt * { color: #000 !important; background: transparent !important; border-color: #000 !important; }
          .shop-receipt img { display: none !important; }
        }
      `}</style>
      {lc && <LookBackground course={lc} />}
      <div style={vars} className="min-h-screen bg-paper px-4 py-10 print:bg-white">
        <div className="max-w-md mx-auto">
          {r && lc ? (
            <div className={`${CARD_L} overflow-hidden shop-receipt`}>
              <CourseHeaderBar courseName={r.courseName} accent={lookBandHex(lc)} logoUrl={r.logoUrl} photoUrl={photoUrl} right="Receipt" />
              <div className="px-6 py-6">
                {r.location && <p className="text-[13px] text-ink-muted mb-4">{r.location}</p>}
                <ShopReceiptBody r={r} />
                <p className="mt-6 text-[12.5px] text-ink-muted">Thank you for shopping at {r.courseName}.</p>
              </div>
            </div>
          ) : (
            <div className={`${CARD_L} px-6 py-8 text-center`}>
              <h1 className="font-serif text-[24px] font-semibold text-ink">Receipt not found</h1>
              <p className="mt-2 text-[14px] text-ink-soft">This link isn’t valid. Ask the pro shop to send the receipt again.</p>
            </div>
          )}
        </div>
      </div>
      <LookFooter vars={lc && lookPicked(lc) ? vars : undefined} />
    </>
  );
}
