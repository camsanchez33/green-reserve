// Inquiries data (Cam 2026-11-17): Import a list. Body: { csv: string, commit: boolean }.
// commit false → the preview: one row per course, check 'new' | 'duplicate' | 'invalid' with why.
// commit true → everything is checked again here (the preview is never trusted) and only the new rows are
// added to Targets. Header row required; columns: name, town, address, website, phone, holes, owned by,
// books today by, software, season, contact name, role, email, phone (the second "phone" is the contact's).
// At most 500 rows / 500 KB. Pipeline area, manager+; the commit is audited.
import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, areaGate } from '@/lib/admin-session';
import { importPreview, importCommit } from '@/lib/outreach-server';
import { auditAdmin } from '@/lib/admin-audit';
import { signedOut, outreachRole, viewerOf, failRes, readJson } from '../gate';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return signedOut();
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  const denied = outreachRole(session, true);
  if (denied) return denied;
  const g = { session, viewer: viewerOf(session) };
  const body = await readJson(req);
  const csv = typeof body?.csv === 'string' ? body.csv : '';
  if (!csv.trim()) return NextResponse.json({ error: 'Choose a CSV file first.' }, { status: 400 });
  if (body?.commit !== true) {
    const p = await importPreview(csv);
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status });
    const rows = p.rows.map(({ data: _d, ...rest }) => rest);
    return NextResponse.json({ rows, newCount: rows.filter(r => r.check === 'new').length });
  }
  const r = await importCommit(csv, g.session.name || 'Admin');
  if (!r.ok) return failRes(r);
  await auditAdmin(g.session, { action: 'outreach_import', targetType: 'inquiry', targetId: 'import', after: { added: r.added, skipped: r.skipped }, detail: `Imported ${r.added} course(s) to Targets` });
  return NextResponse.json({ success: true, added: r.added, skipped: r.skipped, rows: r.rows });
}
