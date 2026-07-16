'use client';
import { usePathname } from 'next/navigation';
import { isCourseWorld, isBookingMode } from '@/lib/booking-mode';

// Nav is fixed and normally reserves 64px (pt-16) below it for every page.
// Course-world pages render NO Nav at all (their own hero/header takes over),
// booking-mode pages (book/checkin/manage/receipt/membership) lost their
// white GR bar too (the course's own CourseHeaderBar is the header now), and
// /for-courses has its own pine hero as the header — all three need zero
// offset, or they'd show a 64px blank gap above where the bar used to sit.
export default function MainOffset({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const noNav = isCourseWorld(pathname) || isBookingMode(pathname) || pathname.startsWith('/for-courses');
  return <main className={noNav ? '' : 'pt-16'}>{children}</main>;
}
