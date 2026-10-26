import { NextResponse } from 'next/server';
import { resolveAdminSession, requireOwner, ownerGateError } from '@/lib/admin-session';
import { securityOverview } from '@/lib/security-events';
import { securityChecklist } from '@/lib/security-checklist';
import { openSentryIssues } from '@/lib/sentry-issues';

// SEC-3 (Cam 2026-10-26): Admin → Security. Owner only, like Audit — it names
// IP addresses and the emails people typed. Read-only: nothing here changes
// an account; unlocking and revoking stay where they are (Team, My profile).
export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  if (!requireOwner(session)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });

  const [overview, checklist, sentry] = await Promise.all([securityOverview(), securityChecklist(), openSentryIssues()]);
  return NextResponse.json({ overview, checklist, sentry }, { headers: { 'Cache-Control': 'no-store' } });
}
