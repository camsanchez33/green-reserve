import { redirect } from 'next/navigation';
import { getOperatorSession } from '@/lib/auth';

// Server-side auth guard for all /dashboard/* pages.
// Unauthenticated requests never reach any dashboard page or child layout.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getOperatorSession();
  if (!session) redirect('/dashboard/login');
  return <>{children}</>;
}
