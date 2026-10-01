// Auth protection for /dashboard/* is handled by src/middleware.ts.
// That middleware excludes public paths like /dashboard/login before checking
// the session — a layout cannot do this because it cannot read the current path.
// AnnouncementBanner is rendered inside OperatorSidebar so it only appears on
// authenticated dashboard pages (login, forgot-password, etc. don't use the sidebar).
import type { Metadata } from 'next';
import { STAFF_LOOK_CLASS } from '@/lib/staff-fonts';
export const metadata: Metadata = { robots: { index: false, follow: false } };
// The staff wrapper (src/lib/staff-fonts.ts). Since FLOW-1 it carries no look
// of its own — the dashboard renders in the site's one look.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className={STAFF_LOOK_CLASS}>{children}</div>;
}
