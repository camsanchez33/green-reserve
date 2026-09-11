// Auth protection for /dashboard/* is handled by src/middleware.ts.
// That middleware excludes public paths like /dashboard/login before checking
// the session — a layout cannot do this because it cannot read the current path.
// AnnouncementBanner is rendered inside OperatorSidebar so it only appears on
// authenticated dashboard pages (login, forgot-password, etc. don't use the sidebar).
import type { Metadata } from 'next';
import { STAFF_LOOK_CLASS } from '@/lib/staff-fonts';
export const metadata: Metadata = { robots: { index: false, follow: false } };
// U-0: the STAFF look (UI_REVISE_SPEC §1b) for every /dashboard route — see
// src/lib/staff-fonts.ts and `.staff-look` in globals.css.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className={STAFF_LOOK_CLASS}>{children}</div>;
}
