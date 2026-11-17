import { NextRequest, NextResponse } from 'next/server';
import { invitePerson } from '@/lib/team';
import { jsonBody, teamOwner, teamResponse } from '@/lib/team-route';

// POST { name, email, phone?, roleId } — invite by email (Team, Cam 2026-11-17). Sends the welcome
// email with a 48-hour set-your-password link; no password is ever shown or emailed. Owner only.
// Saved but the email failed: 502 { error, id, saved: true }, so the page can offer "Send invite again".
export async function POST(req: NextRequest) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  const r = await invitePerson(g.ctx, await jsonBody(req));
  if (r.ok && !r.emailSent) {
    return NextResponse.json({ error: 'They’re on your team, but the welcome email did not send. Check the address and send the invite again.', id: r.id, saved: true }, { status: 502 });
  }
  return teamResponse(r);
}
