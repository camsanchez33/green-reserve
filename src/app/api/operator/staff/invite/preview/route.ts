import { NextRequest, NextResponse } from 'next/server';
import { invitePreview } from '@/lib/team';
import { teamOwner } from '@/lib/team-route';

// GET ?roleId=&name= → { subject, html }: the real welcome email for that role, with a dead link,
// so the Invite popup shows exactly what will be sent. Owner only; 404 for a role not on this course.
export async function GET(req: NextRequest) {
  const g = await teamOwner(req, { write: false }); if ('error' in g) return g.error;
  const r = await invitePreview(g.ctx, req.nextUrl.searchParams.get('roleId'), req.nextUrl.searchParams.get('name') ?? '');
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ subject: r.subject, html: r.html });
}
