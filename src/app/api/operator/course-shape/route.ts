import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { planCourseSetup, applyCourseSetup, type SetupInput } from '@/lib/course-shape-setup';

// A schedule change rebuilds every bookable day (lib/tee-sheet-engine regenerateUpcoming), up to a year ahead.
export const maxDuration = 120;

// W2-6: set the course's shape — its nines and the rounds golfers can book —
// in one save. `preview: true` says what would change and writes nothing.
// The owner's alone, like the rest of the course layout.
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const body = await req.json().catch(() => null) as (SetupInput & { preview?: boolean }) | null;
  if (!body) return NextResponse.json({ error: 'Tell us what kind of course you have.' }, { status: 400 });
  if (body.preview) {
    const r = await planCourseSetup(session.courseId, body);
    return r.ok ? NextResponse.json(r.preview) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const r = await applyCourseSetup(session.courseId, body);
  return r.ok ? NextResponse.json(r.preview) : NextResponse.json({ error: r.error }, { status: 400 });
}
