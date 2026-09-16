import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { cleanChangeItems, submitChangeRequest } from '@/lib/submit-change-request';
import { rateLimit, clientIp } from '@/lib/rate-limit';

// Logged-in-operator counterpart to /api/preview/[courseId]/request-changes
// — same structured categories (V13b), same shared core logic, just session
// auth instead of a preview token. Used by the Getting Started checklist's
// "Request changes" action and the dashboard's draft-course banner.
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });

  const { items } = await req.json().catch(() => ({ items: [] }));
  const cleanItems = cleanChangeItems(items);
  if (cleanItems.length === 0) return NextResponse.json({ error: 'At least one category is required' }, { status: 400 });

  // SD-8 review: every accepted call writes a Message row AND an activity
  // ledger row. Unbounded, that is a way to flood the admin console from a
  // logged-in session. Same caps as the token-gated twin.
  const courseAllowed = await rateLimit(`operator-changes:${session.courseId}`, 10, 3600);
  const ipAllowed = await rateLimit(`operator-changes-ip:${clientIp(req)}`, 30, 3600);
  if (!courseAllowed || !ipAllowed) {
    return NextResponse.json({ error: 'You have sent a lot of change requests in the last hour — give it a little while, or write to us on Messages.' }, { status: 429 });
  }

  const result = await submitChangeRequest(session.courseId, cleanItems);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
