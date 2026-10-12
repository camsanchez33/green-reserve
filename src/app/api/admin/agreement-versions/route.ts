import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, OWNER_ONLY, ownerGateError } from '@/lib/admin-session';
import { agreementVersionsOverview, publishAgreementVersion } from '@/lib/agreement-publish';

// AG-3 — Admin → System → Agreement versions (Cam 2026-10-12: "build the admin
// button"). GET lists every version on disk and whether it is published; POST
// publishes one — the same step as scripts/seed-agreement-versions.ts. A
// re-acceptance bump starts every course's 30-day window and the `hourly` cron
// emails them, so this is owner-with-2FA only and audited.

async function gate() {
  const session = await resolveAdminSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!requireRole(session, OWNER_ONLY)) return { res: NextResponse.json({ error: ownerGateError(session) }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const g = await gate();
  if ('res' in g) return g.res;
  return NextResponse.json({ versions: await agreementVersionsOverview() });
}

export async function POST(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  // Irreversible and mass-emailing: accept only a JSON request (a cross-site form
  // POST cannot send this content type without a CORS preflight).
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Send this request as JSON.' }, { status: 415 });
  }
  const body = await req.json().catch(() => null) as { document?: unknown; version?: unknown } | null;
  const document = typeof body?.document === 'string' ? body.document : '';
  const version = typeof body?.version === 'string' ? body.version : '';
  if (!document || !version) return NextResponse.json({ error: 'Missing document or version.' }, { status: 400 });

  const r = await publishAgreementVersion(document, version);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (!r.created) return NextResponse.json({ error: `${version} is already published.` }, { status: 409 });

  // Awaited (never fire-and-forget in a route). The row is already written, so a
  // failed audit write is logged rather than turned into a false failure.
  await prisma.adminAuditLog.create({
    data: {
      adminId: g.session.adminId, action: 'agreement_version_published', targetType: 'agreement', targetId: `${document}@${version}`,
      detail: r.reacceptBy ? `re-accept by ${r.reacceptBy.toISOString()}${r.waived ? '; counsel review waived' : ''}` : 'no re-acceptance',
    },
  }).catch(err => console.error('agreement publish audit failed:', err));

  return NextResponse.json({
    success: true,
    effectiveAt: r.effectiveAt.toISOString(),
    reacceptBy: r.reacceptBy?.toISOString() ?? null,
  });
}
