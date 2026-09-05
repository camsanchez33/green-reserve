'use client';
// MP-11a (ADMIN_V4 V4-7, LAW rule 2): the admin session is resolved ONCE, in
// admin/layout.tsx, and read here by every page and the sidebar. Before this,
// thirteen pages each fetched /api/admin/session, awaited it, then fetched
// their data — two round trips and a blank flash per page load — and six of
// them ended the check with .catch(() => router.push('/admin/login')), so a
// transient network failure ejected you mid-task.
//
// The provider is also the guard. The auth pages live under /admin too, so the
// layout cannot redirect blindly; the provider knows the pathname and lets
// those through with no session.

import { createContext, useContext, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LOGIN_SESSION_ENDED } from '@/lib/admin-fetch';

export interface AdminSessionView {
  adminId: string;
  email: string;
  name: string;
  role: string;
  /** This session presented a second factor (owner sign-in). */
  mfa: boolean;
}

/** Pages that must render with NO session — they are how you get one. */
const AUTH_PATHS = ['/admin/login', '/admin/owner-login', '/admin/forgot-password', '/admin/set-password'];
export function isAdminAuthPath(pathname: string | null): boolean {
  return !!pathname && AUTH_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

const Ctx = createContext<AdminSessionView | null>(null);

export function AdminSessionProvider({ session, unavailable, children }: {
  session: AdminSessionView | null;
  /** The DB could not be reached while resolving the session — NOT "no session". */
  unavailable: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const authPage = isAdminAuthPath(pathname);
  const mustRedirect = !authPage && !unavailable && !session;

  useEffect(() => {
    if (mustRedirect) router.replace(LOGIN_SESSION_ENDED);
  }, [mustRedirect, router]);

  if (authPage) return <Ctx.Provider value={session}>{children}</Ctx.Provider>;

  // A Postgres blip used to log every admin out (the session check 401'd and
  // the page redirected). It is a visible error with a retry now — the cookie
  // is still perfectly good.
  if (unavailable) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-6">
        <div className="bg-white border border-bad/20 rounded-lg px-6 py-5 max-w-sm text-center">
          <div className="text-sm font-medium text-bad mb-1">Couldn&apos;t confirm your session</div>
          <p className="text-xs text-ink-muted mb-4">The database didn&apos;t answer. You are still signed in — this is not a sign-out.</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-pine hover:bg-pine-hover text-white text-sm font-medium rounded-md transition-colors">Retry</button>
        </div>
      </div>
    );
  }

  if (!session) return null; // redirecting

  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

/** The signed-in admin. Only call from pages inside the guard — never on an auth page. */
export function useAdminSession(): AdminSessionView {
  const s = useContext(Ctx);
  if (!s) throw new Error('useAdminSession() used outside the admin session guard');
  return s;
}
