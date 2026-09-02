import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { archivePair, restorePair } from '@/lib/lifecycle';
import { closureImpact, cancelFutureBookingsForClosure, notifyOperatorOfClosure } from '@/lib/course-closure';

// Thin wrapper — all lifecycle mutation logic lives in src/lib/lifecycle.ts
// (LIFECYCLE PARITY LAW) so /admin/courses* and /admin/inquiries* can never
// drift into one-sided archive/restore/delete.
//
// DELETION DOCTRINE (RUN_QUEUE): anything that ever became a course is
// never permanently deleted — archive only. hard_delete is intentionally
// NOT an action this route accepts anymore (it used to be, owner-only);
// deletePair() still exists in lifecycle.ts for a deliberate owner-run
// pre-launch test-data cleanup script, but there is no UI or API path to
// it from the admin app itself.
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { courseId, action, cancelBookings } = await req.json();
  if (!courseId || !action) return NextResponse.json({ error: 'Missing courseId or action' }, { status: 400 });

  if (action === 'archive') {
  // MP-5b: closing a course is a booking-consequence action, and it used to
  // pretend it was not. Refuse to strand golfers: if standing future bookings
  // exist, the caller must have SEEN the count and asked for them to be
  // cancelled. A 409 carrying the impact is how the confirm gets its numbers.
  //
  // Cancel BEFORE flipping the flag. If a refund fails we abort with the course
  // still live and every booking still valid, which is the recoverable failure;
  // flipping first would leave golfers holding tee times at a dead page.
    let cancelled = 0;
    const impact = await closureImpact(courseId);
    if (impact.bookings > 0) {
      if (cancelBookings !== true) {
        return NextResponse.json({
          error: `${impact.bookings} upcoming booking${impact.bookings === 1 ? '' : 's'} would be left stranded at a course golfers can no longer see.`,
          needsBookingDecision: true,
          impact,
        }, { status: 409 });
      }
      const cancelResult = await cancelFutureBookingsForClosure(courseId);
      cancelled = cancelResult.cancelled;
      if (cancelResult.failed.length > 0) {
        return NextResponse.json({
          error: `${cancelResult.failed.length} booking${cancelResult.failed.length === 1 ? '' : 's'} could not be cancelled, so the course has NOT been archived and nobody has been stranded. Resolve these in Stripe, then try again.`,
          cancelled: cancelResult.cancelled,
          failed: cancelResult.failed,
        }, { status: 502 });
      }
    }

    const result = await archivePair(courseId, session.name);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'Course not found' ? 404 : 400 });

    // The operator learns their course stopped taking bookings from us, not
    // from a golfer ringing the pro shop.
    const operatorNotified = await notifyOperatorOfClosure(courseId, 'archived', cancelled);
    return NextResponse.json({ success: true, changed: result.changed, cancelledBookings: cancelled, operatorNotified });
  }

  if (action === 'restore') {
    const result = await restorePair(courseId, session.name);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'Course not found' ? 404 : 400 });
    return NextResponse.json({ success: true, changed: result.changed });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
