import { NextRequest } from 'next/server';
import { sendResetLink } from '@/lib/team';
import { teamOwner, teamResponse } from '@/lib/team-route';

// POST — Reset password: emails them a one-use link (1 hour), never a temporary
// password. Someone still Invited gets their invite again ({ sent: 'invite' }).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return teamResponse(await sendResetLink(g.ctx, (await params).id));
}
