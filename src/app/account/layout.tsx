// Auth protection for /account/* is handled by src/middleware.ts.
// That middleware excludes public paths like /account/login before checking
// the session — a layout cannot do this because it cannot read the current path.
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
