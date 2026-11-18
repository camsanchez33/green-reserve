// ALERTS-2: emails sent before ALERTS-2 link here. It used to delete on GET; now it sends the
// golfer to the stop page, which asks first (mail scanners open links).
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/api/alerts/stop/${encodeURIComponent(token)}`, req.url), 303);
}
