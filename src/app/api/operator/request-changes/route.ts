import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession } from '@/lib/session';
import { cleanChangeItems, submitChangeRequest } from '@/lib/submit-change-request';

// Logged-in-operator counterpart to /api/preview/[courseId]/request-changes
// — same structured categories (V13b), same shared core logic, just session
// auth instead of a preview token. Used by the Getting Started checklist's
// "Request changes" action and the dashboard's draft-course banner.
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { items } = await req.json().catch(() => ({ items: [] }));
  const cleanItems = cleanChangeItems(items);
  if (cleanItems.length === 0) return NextResponse.json({ error: 'At least one category is required' }, { status: 400 });

  const result = await submitChangeRequest(session.courseId, cleanItems);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
