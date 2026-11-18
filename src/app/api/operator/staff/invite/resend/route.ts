import { NextRequest } from 'next/server';
import { resendInvite } from '@/lib/team';
import { jsonBody, teamOwner, teamResponse } from '@/lib/team-route';

// POST { id } — send the welcome email again to someone who hasn't set a password yet. Owner only.
export async function POST(req: NextRequest) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return teamResponse(await resendInvite(g.ctx, (await jsonBody(req)).id));
}
