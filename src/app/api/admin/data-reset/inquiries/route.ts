import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireOwner, ownerGateError, stepUpRequired } from '@/lib/admin-session';
import { needReason, reasonOf, auditAdmin } from '@/lib/admin-audit';
import { previewClearTestInquiries, clearTestInquiries, easternDayStart, wipeAllOpen, WIPE_ALL_UNTIL, CLEAR_INQUIRIES_CONFIRM_WORDS as CONFIRM_WORDS } from '@/lib/data-reset';

// KEEP-OUTREACH (Cam 2026-11-18): the launch wipe now keeps the outreach pipeline, so the test
// inquiries already on the site are cleared once, before outreach starts on Nov 23. GET counts what
// a clear before `?before=YYYY-MM-DD` (midnight Eastern) would delete; POST deletes it. The same
// gates as the launch wipe: owner only, a fresh second step, a reason, the words typed exactly,
// closed for good from WIPE_ALL_UNTIL. Inquiries that became a course are never deleted here.

const BAD_DATE = 'Pick the day outreach starts: inquiries added before midnight Eastern that day are cleared.';

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const before = easternDayStart(req.nextUrl.searchParams.get('before') ?? '');
  if (!before) return NextResponse.json({ error: BAD_DATE }, { status: 400 });
  const counts = await previewClearTestInquiries(before);
  return NextResponse.json({ open: wipeAllOpen(), closesAt: WIPE_ALL_UNTIL.toISOString(), confirmWords: CONFIRM_WORDS, before: before.toISOString(), ...counts }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const su = stepUpRequired(session); if (su) return su;
  const body = await req.json().catch(() => ({}));
  const nr = needReason('inquiries_clear', body); if (nr) return nr;
  const before = easternDayStart(typeof body?.before === 'string' ? body.before : '');
  if (!before) return NextResponse.json({ error: BAD_DATE }, { status: 400 });
  if (body?.confirm !== CONFIRM_WORDS) return NextResponse.json({ error: `Type ${CONFIRM_WORDS} exactly to confirm.` }, { status: 400 });
  const result = await clearTestInquiries(before);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  await auditAdmin(session, { action: 'inquiries_clear', targetType: 'system', targetId: '', after: { before: before.toISOString(), ...result.cleared }, reason: reasonOf(body) });
  return NextResponse.json({ success: true, cleared: result.cleared });
}
