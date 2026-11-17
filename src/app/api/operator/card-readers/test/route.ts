import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { testReader } from '@/lib/card-reader';
import { rateLimit } from '@/lib/rate-limit';

// Settings data (Cam 2026-11-17): "Test reader" in Settings → Payments → Register.
// POST { id } shows a $0.00 test on the reader's screen and clears it; no money
// moves (lib/card-reader testReader). Owner only, like connecting a reader:
// a reader is Stripe hardware and staff never change anything Stripe.

export const maxDuration = 30; // a 3-second display plus three Stripe calls

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  if (!(await rateLimit(`card-reader:test:${session.courseId}`, 20, 3600))) {
    return NextResponse.json({ error: 'That’s a lot of tests this hour — try again later.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({})) as { id?: unknown };
  const r = await testReader(session.courseId, typeof body.id === 'string' ? body.id : '');
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: r.value.passed, ...r.value });
}
