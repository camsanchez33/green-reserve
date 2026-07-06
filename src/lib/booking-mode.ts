// Booking mode: pages a golfer reaches via a course's own website.
// These render minimal GreenReserve chrome — no marketing nav, no links
// to browse other courses.
export function isBookingMode(pathname: string): boolean {
  if (/^\/courses\/[^/]+/.test(pathname)) return true; // course detail (not /courses index)
  if (pathname === '/book' || pathname.startsWith('/book/')) return true;
  if (pathname.startsWith('/checkin/')) return true;
  return false;
}
