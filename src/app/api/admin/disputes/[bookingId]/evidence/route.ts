import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { loadEvidence, evidenceText } from '@/lib/dispute-evidence';
import { auditAdmin } from '@/lib/admin-audit';

// ADMIN-C Money → Disputes: download one disputed booking's evidence pack as a
// text file to upload to Stripe. Manager+ (it names the golfer, like the
// transaction export). Every download is in the audit record.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'The evidence pack needs manager access.' }, { status: 403 });
  const { bookingId } = await params;
  const input = await loadEvidence(bookingId);
  if (!input) return NextResponse.json({ error: 'That booking no longer exists.' }, { status: 404 });
  await auditAdmin(session, { action: 'dispute_evidence', targetType: 'booking', targetId: bookingId, after: { golfer: input.golferName, course: input.courseName } });
  return new NextResponse(evidenceText(input), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="dispute-evidence-${bookingId}.txt"`,
      'Cache-Control': 'no-store',
    },
  });
}
