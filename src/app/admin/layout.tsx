import type { Metadata, Viewport } from 'next';
import { resolveAdminSession, AdminSessionUnavailable } from '@/lib/admin-session';
import { AdminSessionProvider, type AdminSessionView } from '@/lib/admin-session-context';
import { effectiveAreas } from '@/lib/admin-areas';
import { prisma } from '@/lib/prisma';
import { STAFF_LOOK_CLASS } from '@/lib/staff-fonts';
import StepUpDialog from '@/components/admin/StepUpDialog';
import ReasonDialog from '@/components/admin/ReasonDialog';
import { ADMIN_THEME } from '@/components/admin/admin-theme';
import glass from './admin-glass.module.css';
import { PWA_APPS, PWA_SCOPES, PWA_THEME_COLOR, pwaKilled } from '@/lib/pwa';
import PwaRegister from '@/components/pwa/PwaRegister';

// ADMIN-REDO (Cam 2026-11-11): glass, EB Garamond + Libre Franklin (the root layout's fonts — ADMIN-C's Inter and
// its .admin-look mapping are gone). UI-STYLE (Cam 2026-11-26): neutral Apple-style glass on a flat page, no ribbons.

// PWA install (Cam 2026-11-24): the admin is an installable app (scope /admin). /cam is outside it on purpose: on an
// iPad the owner signs in with Safari.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: PWA_THEME_COLOR.admin };
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
    if (s) {
      // My profile (Cam 2026-11-15): only this person's own row, only this one field. A display date, so
      // a failed read shows no date (logged) rather than taking down the whole admin shell.
      const row = await prisma.adminUser.findUnique({ where: { id: s.adminId }, select: { passwordChangedAt: true } })
        .catch(err => { console.error(JSON.stringify({ ev: 'admin_layout.password_date_unavailable', error: err instanceof Error ? err.message : String(err) })); return null; });
      session = { adminId: s.adminId, email: s.email, name: s.name, role: s.role, mfa: s.mfa === true, areas: effectiveAreas(s.role, s.areas ?? null), passwordChangedAt: row?.passwordChangedAt?.toISOString() ?? null };
    }
  } catch (err) {
    // A DB blip is not "no session" — the provider shows a retry, not a login.
    if (err instanceof AdminSessionUnavailable) unavailable = true;
    else throw err;
  }
  return (
    <AdminSessionProvider session={session} unavailable={unavailable}>
      {/* staff-look is display:contents (a hook only), so the glass shell is its own box inside it. */}
      <div className={STAFF_LOOK_CLASS}>
      <div className={glass.shell} data-theme={ADMIN_THEME} data-admin-shell="">
        {children}
        {/* AW-1c: only the owner is ever asked to confirm a risky action. */}
        {session?.role === 'owner' && <StepUpDialog />}
        {/* BRAIN-1a: anyone signed in may be asked why (money, access, deletes). */}
        {session && <ReasonDialog />}
      </div>
      <PwaRegister scope={PWA_SCOPES.admin} killed={pwaKilled()} manifest={PWA_APPS.admin.manifest} appTitle={PWA_APPS.admin.title} />
      </div>
    </AdminSessionProvider>
  );
}
