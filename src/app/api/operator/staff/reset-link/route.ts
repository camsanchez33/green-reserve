import { NextRequest } from 'next/server';
import { sendResetLink } from '@/lib/team';
import { jsonBody, teamOwner, teamResponse } from '@/lib/team-route';

// POST { id } — Reset password: emails a one-use link (1 hour), never a temporary password.
// Someone still Invited gets their invite again instead ({ sent: 'invite' }). Owner only.
export async function POST(req: NextRequest) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return teamResponse(await sendResetLink(g.ctx, (await jsonBody(req)).id));
}
