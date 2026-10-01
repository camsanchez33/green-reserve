// UI-H-1 (HOMEPAGE_SPEC.md §4.2): every "Book a demo" on the homepage lands
// here, so the Cal.com link lives in one place (CALCOM_BOOKING_URL). The
// booking is tagged source=homepage so the Cal.com webhook can open an
// inquiry for it. With Cal.com off or misconfigured, the course gets the
// inquiry form instead of a dead link.
import { NextRequest, NextResponse } from 'next/server';
import { calcomBookingUrl } from '@/lib/calcom';

export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const base = calcomBookingUrl();
  if (!base) return NextResponse.redirect(new URL('/for-courses', req.url), 307);
  const url = new URL(base);
  url.searchParams.set('metadata[source]', 'homepage');
  return NextResponse.redirect(url.toString(), 307);
}
