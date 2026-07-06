// Auth protection for /account/* is handled by src/middleware.ts.
// That middleware excludes public paths like /account/login before checking
// the session — a layout cannot do this because it cannot read the current path.
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
