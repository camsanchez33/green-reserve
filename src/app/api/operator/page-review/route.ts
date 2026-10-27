import { NextResponse } from 'next/server';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { pageReview } from '@/lib/page-review';

// Onboarding step 1 (Cam 2026-10-27): the owner's booking page, part by part,
// in golfers' words (src/lib/page-review.ts). Owner only, like approve-page and
// request-changes, which record what they decide. Read-only.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const review = await pageReview(session.courseId);
  if (!review) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  return NextResponse.json(review, { headers: { 'Cache-Control': 'no-store' } });
}
