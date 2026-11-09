// RECEIPT-3 (Cam 2026-11-09: "this is the receipt text, not even a link"): the customer's receipt for a pro shop sale,
// linked from the texted receipt. Token-gated (ShopSale.receiptToken), noindex, server-rendered — no client JavaScript.
import type { Metadata } from 'next';
import { CourseHeaderBar } from '@/components/CourseHeaderBar';
import { Card } from '@/components/ui/Card';
import { ShopReceiptBody } from '@/components/dashboard/shop/ShopReceiptBody';
import { publicShopReceipt } from '@/lib/shop-receipt';

export const metadata: Metadata = { title: 'Receipt', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ShopReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token } = await searchParams;
  const r = await publicShopReceipt(id, typeof token === 'string' ? token : '');
  return (
    <div className="min-h-screen bg-paper px-4 py-10">
      <div className="max-w-md mx-auto">
        {r ? (
          <Card className="overflow-hidden">
            <CourseHeaderBar courseName={r.courseName} accent={r.brandColor} logoUrl={r.logoUrl} right="Receipt" />
            <div className="px-6 py-6">
              {r.location && <p className="text-[13px] text-ink-muted mb-4">{r.location}</p>}
              <ShopReceiptBody r={r} />
              <p className="mt-6 text-[12.5px] text-ink-muted">Thank you for shopping at {r.courseName}.</p>
            </div>
          </Card>
        ) : (
          <Card className="px-6 py-8 text-center">
            <h1 className="font-serif text-[24px] font-semibold text-ink">Receipt not found</h1>
            <p className="mt-2 text-[14px] text-ink-soft">This link isn’t valid. Ask the pro shop to send the receipt again.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
