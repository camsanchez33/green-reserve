import { NextRequest } from 'next/server';
import { deleteRole, updateRole } from '@/lib/team';
import { jsonBody, teamOwner, teamResponse } from '@/lib/team-route';

// PATCH { name?, description?, permissions? | areas?, dryRun? } — changes everyone
// in the role. dryRun: true answers { people, affected } without saving, so the
// editor can say how many people a save changes.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return teamResponse(await updateRole(g.ctx, (await params).id, await jsonBody(req)));
}

// DELETE — refused (409) while anyone on the team has the role.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return teamResponse(await deleteRole(g.ctx, (await params).id));
}
