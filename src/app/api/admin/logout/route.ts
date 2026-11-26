import { NextRequest, NextResponse } from 'next/server';
import { ownerSessionFromCookie, revokeOwnerSession, revokeAllOwnerSessions, clearOwnerCookie } from '@/lib/owner-session';
import { endEmployeeSession } from '@/lib/admin-session';

// Signs out of the admin. AW-1: an owner session is ended in the database too
// (a copied cookie stops working), and { everywhere: true } ends every owner
// session at once — the "that wasn't me" button on My profile.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { everywhere?: unknown };
  const owner = await ownerSessionFromCookie();
  if (owner) {
    if (body.everywhere === true) await revokeAllOwnerSessions(owner.adminId);
    else await revokeOwnerSession(owner.id);
  }
  // Audit 2026-11-24 M5: an employee's sign-out ends their session on the server too.
  await endEmployeeSession(req.cookies.get('admin_session')?.value);
  const res = NextResponse.json({ success: true, everywhere: !!owner && body.everywhere === true });
  res.cookies.set('admin_session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 0, path: '/' });
  clearOwnerCookie(res);
  return res;
}
