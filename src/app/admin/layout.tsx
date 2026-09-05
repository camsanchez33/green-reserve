import type { Metadata } from 'next';
import { resolveAdminSession, AdminSessionUnavailable } from '@/lib/admin-session';
import { AdminSessionProvider, type AdminSessionView } from '@/lib/admin-session-context';

export const metadata: Metadata = { robots: { index: false, follow: false } };
// Reads the session cookie on every request — never cache this shell.
export const dynamic = 'force-dynamic';

// MP-11a (LAW rule 2): the ONE place the admin session is resolved. Every page
// and the sidebar read it from context; none of them fetches
// /api/admin/session any more. Auth pages under /admin pass through the
// provider ungated (see admin-session-context).
//
// Soft navigations reuse this layout without re-running it, so a sign-in must
// hard-navigate (window.location.assign) for the new cookie to be read — the
// login pages do.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let session: AdminSessionView | null = null;
  let unavailable = false;
  try {
    const s = await resolveAdminSession();
    if (s) session = { adminId: s.adminId, email: s.email, name: s.name, role: s.role, mfa: s.mfa === true };
  } catch (err) {
    // A DB blip is not "no session" — the provider shows a retry, not a login.
    if (err instanceof AdminSessionUnavailable) unavailable = true;
    else throw err;
  }
  return (
    <AdminSessionProvider session={session} unavailable={unavailable}>
      {children}
    </AdminSessionProvider>
  );
}
