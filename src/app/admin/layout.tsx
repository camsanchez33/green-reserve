import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { resolveAdminSession, AdminSessionUnavailable } from '@/lib/admin-session';
import { AdminSessionProvider, type AdminSessionView } from '@/lib/admin-session-context';
import { effectiveAreas } from '@/lib/admin-areas';
import { STAFF_LOOK_CLASS } from '@/lib/staff-fonts';
import StepUpDialog from '@/components/admin/StepUpDialog';
import ReasonDialog from '@/components/admin/ReasonDialog';
import { ADMIN_THEME_COOKIE, readAdminTheme } from '@/components/admin/admin-theme';
import glass from './admin-glass.module.css';

// ADMIN-REDO (Cam 2026-11-11): green glass, EB Garamond + Libre Franklin (the
// root layout's fonts — ADMIN-C's Inter and its .admin-look mapping are gone).

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
    if (s) session = { adminId: s.adminId, email: s.email, name: s.name, role: s.role, mfa: s.mfa === true, areas: effectiveAreas(s.role, s.areas ?? null) };
  } catch (err) {
    // A DB blip is not "no session" — the provider shows a retry, not a login.
    if (err instanceof AdminSessionUnavailable) unavailable = true;
    else throw err;
  }
  // Light by default; the dark choice is a per-browser cookie read here so the first paint is right.
  const theme = readAdminTheme((await cookies()).get(ADMIN_THEME_COOKIE)?.value);
  return (
    <AdminSessionProvider session={session} unavailable={unavailable}>
      {/* staff-look is display:contents (a hook only), so the glass shell is its own box inside it. */}
      <div className={STAFF_LOOK_CLASS}>
      <div className={glass.shell} data-theme={theme} data-admin-shell="">
        {/* Cam 2026-11-12: blurred ribbons (greens + one gold thread) behind the glass, as on the Revenue mockup. */}
        <svg className={glass.waves} viewBox="0 0 1400 1100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          <defs>
            <filter id="gr-admin-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="40" /></filter>
            <filter id="gr-admin-softer" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16" /></filter>
          </defs>
          <g filter="url(#gr-admin-soft)">
            <path className={glass.w1} d="M-120 260 C 240 60, 520 420, 820 230 S 1300 40, 1560 300" />
            <path className={glass.w4} d="M-200 980 C 200 760, 460 1040, 760 820 S 1220 640, 1600 900" />
            <path className={glass.w2} d="M980 -80 C 860 220, 1180 380, 1040 640 S 1180 980, 1320 1180" />
          </g>
          <g filter="url(#gr-admin-softer)">
            <path className={glass.w3} d="M-60 520 C 300 380, 520 700, 900 520 S 1300 360, 1500 560" />
            <path className={glass.w3} d="M200 -60 C 300 200, 120 420, 380 640" />
          </g>
        </svg>
        {children}
        {/* AW-1c: only the owner is ever asked to confirm a risky action. */}
        {session?.role === 'owner' && <StepUpDialog />}
        {/* BRAIN-1a: anyone signed in may be asked why (money, access, deletes). */}
        {session && <ReasonDialog />}
      </div>
      </div>
    </AdminSessionProvider>
  );
}
