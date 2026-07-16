// Course-world pages: the course page itself, its member portal, and its
// golfer portal (/courses/[slug], /courses/[slug]/member, /courses/[slug]/account).
// These already have their own fully-branded header — the global Nav must
// return null entirely here, the same as it does on /admin and /dashboard.
export function isCourseWorld(pathname: string): boolean {
  return /^\/courses\/[^/]+/.test(pathname); // course detail (not /courses index)
}

// Booking mode: other pages a golfer reaches via a course's own website
// that DON'T have their own branded header. These render minimal GreenReserve
// chrome (wordmark only) — no marketing nav, no links to browse other courses.
export function isBookingMode(pathname: string): boolean {
  if (pathname === '/book' || pathname.startsWith('/book/')) return true;
  if (pathname.startsWith('/checkin/')) return true;
  if (pathname.startsWith('/manage/')) return true;
  if (pathname.startsWith('/receipt/')) return true;
  if (pathname.startsWith('/membership/')) return true;
  return false;
}
