// Auth protection for /dashboard/* is handled by src/middleware.ts.
// That middleware excludes public paths like /dashboard/login before checking
// the session — a layout cannot do this because it cannot read the current path.
// AnnouncementBanner is rendered inside OperatorSidebar so it only appears on
// authenticated dashboard pages (login, forgot-password, etc. don't use the sidebar).
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Geist } from 'next/font/google';
import { STAFF_LOOK_CLASS } from '@/lib/staff-fonts';
import { OP_THEME_COOKIE, readOpTheme } from '@/lib/op-theme';
// DASH-D (Cam 2026-11-01): Geist is the dashboard's one face (see globals.css .op-look).
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });

export const metadata: Metadata = { robots: { index: false, follow: false } };
// The staff wrapper (src/lib/staff-fonts.ts) is only a hook. data-theme is the
// Light/Dark choice (DASH-D), read from this browser's cookie so the first paint
// is already in the right look.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const theme = readOpTheme((await cookies()).get(OP_THEME_COOKIE)?.value);
  return <div className={STAFF_LOOK_CLASS}><div className={`op-look ${geist.variable}`} data-theme={theme}>{children}</div></div>;
}
