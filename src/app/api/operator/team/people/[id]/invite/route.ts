import { NextRequest } from 'next/server';
import { resendInvite } from '@/lib/team';
import { teamOwner, teamResponse } from '@/lib/team-route';

// POST — send the welcome email again to someone who hasn't set a password yet.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return teamResponse(await resendInvite(g.ctx, (await params).id));
}
