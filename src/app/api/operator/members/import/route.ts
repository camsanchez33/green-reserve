import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { readMemberCsv } from '@/lib/member-csv';
import { importMembers } from '@/lib/member-import';

// Members → Import a list. The file is read HERE (never trusted rows from the
// page); members.edit, like adding one member. Nobody is emailed.
const MAX_BYTES = 1_000_000;

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'members.edit'); if (denied) return denied; }
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  if (!(await rateLimit(`members-import:${session.courseId}`, 20, 3600))) {
    return NextResponse.json({ error: 'Too many imports this hour — wait a while and try again.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({})) as { csv?: unknown; defaultTierId?: unknown; paidByDefault?: unknown };
  const csv = typeof body.csv === 'string' ? body.csv : '';
  if (!csv.trim()) return NextResponse.json({ error: 'Paste your list or choose a file first.' }, { status: 400 });
  if (csv.length > MAX_BYTES) return NextResponse.json({ error: 'That file is over 1 MB — split it into smaller files.' }, { status: 413 });
  const read = readMemberCsv(csv);
  if (read.rows.length === 0) return NextResponse.json({ error: read.problems[0]?.message ?? 'No members found in that file.', problems: read.problems }, { status: 400 });
  const r = await importMembers(session.courseId, read.rows, {
    defaultTierId: typeof body.defaultTierId === 'string' ? body.defaultTierId : '',
    paidByDefault: body.paidByDefault === true,
    addedBy: session.email,
  });
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
  console.log(JSON.stringify({ ev: 'members.import', courseId: session.courseId, added: r.added, skipped: r.skipped.length, problems: read.problems.length }));
  return NextResponse.json({ ...r, problems: read.problems });
}
