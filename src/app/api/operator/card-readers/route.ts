import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission, STAFF_FORBIDDEN } from '@/lib/session';
import { listReaders, registerReader, removeReader, terminalTestMode, SIMULATED_CODE } from '@/lib/card-reader';

// POS-3 R3: the course's card readers. Anyone who sells in the pro shop sees
// them (to pick one at the register); only the owner connects or removes one —
// a reader is Stripe hardware, and staff never change anything Stripe.

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = requirePermission(session, 'shop.sell');
  if (denied) return denied;
  const r = await listReaders(session.courseId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ readers: r.value, testMode: terminalTestMode(), simulatedCode: terminalTestMode() ? SIMULATED_CODE : null });
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const r = await registerReader(session.courseId, { code: body.code, label: body.label });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ reader: r.value });
}

export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const r = await removeReader(session.courseId, id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ removed: true });
}
