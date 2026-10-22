import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireOwner, ownerGateError, stepUpRequired } from '@/lib/admin-session';
import { needReason, reasonOf, auditAdmin } from '@/lib/admin-audit';
import { previewWipeAll, wipeAll, wipeAllOpen, WIPE_ALL_UNTIL, WIPE_CONFIRM_WORDS as CONFIRM_WORDS } from '@/lib/data-reset';

// TEST-1: the launch wipe (src/lib/data-reset.ts). GET counts what it would
// clear and keep; POST clears it. Owner only, a fresh second step, a reason,
// and the words typed exactly. Closed for good from WIPE_ALL_UNTIL.

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const open = wipeAllOpen();
  const counts = await previewWipeAll();
  return NextResponse.json({ open, closesAt: WIPE_ALL_UNTIL.toISOString(), confirmWords: CONFIRM_WORDS, ...counts }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const su = stepUpRequired(session); if (su) return su;
  const body = await req.json().catch(() => ({}));
  const nr = needReason('data_wipe', body); if (nr) return nr;
  if (body?.confirm !== CONFIRM_WORDS) return NextResponse.json({ error: `Type ${CONFIRM_WORDS} exactly to confirm.` }, { status: 400 });
  const result = await wipeAll();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  await auditAdmin(session, { action: 'data_wipe', targetType: 'system', targetId: '', after: result.cleared, reason: reasonOf(body) });
  return NextResponse.json({ success: true, cleared: result.cleared });
}
