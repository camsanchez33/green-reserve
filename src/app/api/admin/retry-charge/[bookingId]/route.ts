import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { performCheckIn } from '@/lib/checkin-booking';
import { friendlyStripeError } from '@/lib/stripe-errors';

// REVISE_QUEUE A-06 item 4 — retry a failed check-in charge from the revenue
// page. Reuses the SAME vetted performCheckIn charge path staff use (no
// parallel money logic); on success the booking is charged + checked in +
// receipted exactly as an in-person check-in. Manager-plus (moves money).
// A hard decline replays the same failure honestly; a transient error clears.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const session = await resolveAdminSession();
  if (!session || !requireRole(session, MANAGER_PLUS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { bookingId } = await params;

  const result = await performCheckIn(bookingId);
  if ('error' in result) {
    // Surface a plain-English version, never raw Stripe prose.
    return NextResponse.json({ error: friendlyStripeError(result.error), raw: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true, totalCharged: result.totalCharged });
}
