// Auth protection for /dashboard/* is handled by src/middleware.ts.
// That middleware excludes public paths like /dashboard/login before checking
// the session — a layout cannot do this because it cannot read the current path.
// AnnouncementBanner is rendered inside OperatorSidebar so it only appears on
// authenticated dashboard pages (login, forgot-password, etc. don't use the sidebar).
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
