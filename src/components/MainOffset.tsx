'use client';
import { usePathname } from 'next/navigation';
import { isCourseWorld, isBookingMode } from '@/lib/booking-mode';

// Nav is fixed and normally reserves 64px (pt-16) below it for every page.
// Course-world pages render NO Nav at all (their own hero/header takes over),
// booking-mode pages (book/checkin/manage/receipt/membership) lost their
// white GR bar too (the course's own CourseHeaderBar is the header now), and
// /for-courses has its own pine hero as the header, and /admin + /dashboard
// render their own sidebar shell with no Nav at all — all of these need
// zero offset, or they'd show a 64px blank gap above where the bar used to sit.
// src/lib/booking-mode.ts states the Nav "must return null entirely here, the
// same as it does on /admin and /dashboard" — this offset simply never learned
// the same rule, so both prefixes are tested explicitly below. On admin the gap
// also desynchronizes the shell: the sidebar is fixed at top:0 while content
// started 64px down, and `sticky top-0` page headers stuck 64px down leaving a
// cream band above them on scroll.
export default function MainOffset({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const noNav =
    isCourseWorld(pathname) ||
    isBookingMode(pathname) ||
    pathname.startsWith('/for-courses') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/dashboard');
  return <main className={noNav ? '' : 'pt-16'}>{children}</main>;
}
