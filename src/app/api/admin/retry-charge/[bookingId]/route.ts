import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { performCheckIn, collectPayment } from '@/lib/checkin-booking';
import { friendlyStripeError } from '@/lib/stripe-errors';

// REVISE_QUEUE A-06 item 4 — retry a failed check-in charge from the revenue
// page. Reuses the SAME vetted charge path staff use (no parallel money
// logic). Manager-plus (moves money). A hard decline replays the same failure
// honestly; a transient error clears.
//
// MP-1 fix-now #5: this used to call performCheckIn verbatim, so clearing a
// failed charge for a round days away ALSO marked the golfer checked in and
// emailed them a receipt. Charge-only is now the default; checking someone in
// from here requires an explicit checkIn:true, which the UI only sends after
// a confirm dialog that names what will happen.
export async function POST(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, MANAGER_PLUS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { bookingId } = await params;

  // Body is optional — a bare POST is charge-only, which is what the button
  // has always claimed to do.
  let checkIn = false;
  try {
    const body = await req.json();
    checkIn = body?.checkIn === true;
  } catch { /* no body — charge only */ }

  const result = checkIn ? await performCheckIn(bookingId) : await collectPayment(bookingId);
  if ('error' in result) {
    // Surface a plain-English version, never raw Stripe prose.
    return NextResponse.json({ error: friendlyStripeError(result.error), raw: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true, totalCharged: result.totalCharged, checkedIn: checkIn });
}
