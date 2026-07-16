import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Fail closed: in production, a missing JWT_SECRET means NO token is valid.
// The dev fallback only applies outside production so local dev still works.
const rawSecret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
const secret = rawSecret ? new TextEncoder().encode(rawSecret) : null;

async function hasValidToken(
  req: NextRequest,
  cookieName: string,
  allowedTypes: string[]
): Promise<boolean> {
  if (!secret) return false; // fail closed
  const token = req.cookies.get(cookieName)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret);
    // All token kinds (operator, staff, golfer, pending_2fa, member_invite)
    // share one signing secret — the type check stops cross-cookie reuse.
    return typeof payload.type === 'string' && allowedTypes.includes(payload.type);
  } catch {
    return false;
  }
}

// Public paths under /dashboard that do NOT require a session
const DASHBOARD_PUBLIC = [
  '/dashboard/login',
  '/dashboard/2fa',
  '/dashboard/forgot-password',
  '/dashboard/reset-password',
  '/dashboard/verify',
  '/dashboard/onboarding',
];

function isPublic(pathname: string, publicPaths: string[]): boolean {
  return publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/dashboard') && !isPublic(pathname, DASHBOARD_PUBLIC)) {
    const valid = await hasValidToken(req, 'gr_operator', ['operator', 'staff']);
    if (!valid) {
      return NextResponse.redirect(new URL('/dashboard/login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
