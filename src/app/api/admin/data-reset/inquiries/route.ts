import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireOwner, ownerGateError, stepUpRequired } from '@/lib/admin-session';
import { needReason, reasonOf, auditAdmin } from '@/lib/admin-audit';
import { previewClearTestInquiries, clearTestInquiries, wipeAllOpen, OUTREACH_START, CLEAR_INQUIRIES_CONFIRM_WORDS as CONFIRM_WORDS } from '@/lib/data-reset';

// KEEP-OUTREACH (Cam 2026-11-18): the launch wipe keeps the outreach pipeline, so the test inquiries
// already on the site are cleared once, before outreach prep starts (OUTREACH_START, Nov 23). GET counts
// what it would delete; POST deletes it. The same gates as the launch wipe: owner only, a fresh second
// step, a reason, the words typed exactly, closed for good from Dec 1. The cut-off is fixed, so an
// inquiry made from Nov 23 on can never be reached from here; ones that became a course are kept.

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const counts = await previewClearTestInquiries();
  return NextResponse.json({ open: wipeAllOpen(), confirmWords: CONFIRM_WORDS, before: OUTREACH_START.toISOString(), ...counts }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });
  const su = stepUpRequired(session); if (su) return su;
  const body = await req.json().catch(() => ({}));
  const nr = needReason('inquiries_clear', body); if (nr) return nr;
  if (body?.confirm !== CONFIRM_WORDS) return NextResponse.json({ error: `Type ${CONFIRM_WORDS} exactly to confirm.` }, { status: 400 });
  const result = await clearTestInquiries();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  await auditAdmin(session, { action: 'inquiries_clear', targetType: 'system', targetId: '', after: { before: OUTREACH_START.toISOString(), ...result.cleared }, reason: reasonOf(body) });
  return NextResponse.json({ success: true, cleared: result.cleared });
}
