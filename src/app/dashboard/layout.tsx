// Auth protection for /dashboard/* is handled by src/middleware.ts.
// That middleware excludes public paths like /dashboard/login before checking
// the session — a layout cannot do this because it cannot read the current path.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
