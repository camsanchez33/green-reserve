// Auth protection for /dashboard/* is handled by src/middleware.ts.
// That middleware excludes public paths like /dashboard/login before checking
// the session — a layout cannot do this because it cannot read the current path.
// AnnouncementBanner is rendered inside OperatorSidebar so it only appears on
// authenticated dashboard pages (login, forgot-password, etc. don't use the sidebar).
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { STAFF_LOOK_CLASS } from '@/lib/staff-fonts';
import { OP_THEME_COOKIE, readOpTheme } from '@/lib/op-theme';
// CHARCOAL-1 (Cam 2026-11-12): the dashboard wears the site's type (EB Garamond + Libre Franklin, from the root layout), as the admin does; Geist is gone.

export const metadata: Metadata = { robots: { index: false, follow: false } };
// The staff wrapper (src/lib/staff-fonts.ts) is only a hook. data-theme is the
// look (CHARCOAL-1: charcoal by default, Light the switch), read from this browser's
// cookie so the first paint is already in the right look.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const theme = readOpTheme((await cookies()).get(OP_THEME_COOKIE)?.value);
  return <div className={STAFF_LOOK_CLASS}><div className="op-look" data-theme={theme}>{children}</div></div>;
}
