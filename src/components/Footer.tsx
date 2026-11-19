'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { isBookingMode, isCourseWorld } from '@/lib/booking-mode';
import { SUPPORT_EMAIL } from '@/lib/contact';

/** BOOKING-LOOK-1: the golfer pages that wear the course look and carry their own footer in it (LookFooter): manage,
 *  check-in, the receipt, the shop receipt, the event and shop pay links and the statement. */
function wearsCourseLook(pathname: string): boolean {
  if (/^\/(manage|checkin|receipt)\/[^/]+\/?$/.test(pathname) && pathname !== '/receipt/shop' && pathname !== '/receipt/shop/') return true;
  return /^\/(receipt\/shop|pay\/event|pay\/shop|statement)\/[^/]+\/?$/.test(pathname);
}

/** The booking-mode footer lockup (also LookFooter's, for a course that hasn't picked a look). */
export function BookingModeFooter() {
  return (
    <footer className="bg-paper border-t border-line">
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-ink-faint">
        <span className="flex items-center gap-1.5">
          Powered by
          <Link href="/" className="inline-flex items-center hover:opacity-80 transition-opacity">
            <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={120} height={22} loading="lazy" className="w-[120px] h-auto" />
          </Link>
        </span>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-ink-soft transition-colors">{SUPPORT_EMAIL}</a>
          <Link href="/privacy" className="hover:text-ink-soft transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-ink-soft transition-colors">Terms</Link>
        </div>
      </div>
    </footer>
  );
}

export default function Footer() {
  const pathname = usePathname();

  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard') || pathname.startsWith('/cam')) return null;
  // GOLFER-REDO (Cam 2026-11-11): a course's booking page and its Course info tab carry the course's own footer — one footer only.
  // Its Log in and Your <Course> pages do too (golfer items 2 and 6).
  if (/^\/courses\/[^/]+(\/info|\/login|\/member)?\/?$/.test(pathname)) return null;
  // The Book page wears the course's look (Light or Dark) and carries its own footer in it (BookClient).
  if (pathname === '/book' || pathname === '/book/') return null;
  // The golfer pages on the course look carry their own footer (LookFooter; wearsCourseLook above).
  if (wearsCourseLook(pathname)) return null;

  // Course-world pages (course page, member portal, golfer portal) get the
  // minimal text-only "Powered by GreenReserve" footer — no marketing links,
  // no logo image (white-label rule: this is the course's own page).
  if (isCourseWorld(pathname)) {
    return (
      <footer className="bg-paper border-t border-line">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-ink-faint">
          <span>Powered by <Link href="/" className="text-pine hover:text-pine-hover transition-colors font-medium">GreenReserve</Link></span>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-ink-soft transition-colors">{SUPPORT_EMAIL}</a>
            <Link href="/privacy" className="hover:text-ink-soft transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-ink-soft transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    );
  }

  // Booking-mode pages (book/checkin/manage/receipt/membership) lost the
  // white GR nav bar — this small footer lockup is the only GreenReserve
  // presence left on the golfer's booking journey.
  if (isBookingMode(pathname)) return <BookingModeFooter />;

  // Homepage redo (Cam 2026-11-18, lanes/homepage.md): logo, Privacy, Terms, Contact and the copyright
  // line. No Course login link (courses use their bookmark or onboarding link; /dashboard/login still
  // works) and, as before, no fee line (legal/LQ-2_FEE_COPY.md §5).
  return (
    <footer className="bg-paper border-t border-line">
      <div className="w-[min(1160px,calc(100%-32px))] mx-auto py-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 items-center text-[13.5px] text-ink-muted max-[520px]:grid-cols-1">
        <Link href="/" className="inline-flex items-center hover:opacity-80 transition-opacity" aria-label="GreenReserve home">
          <Image src="/brand/logo.svg" unoptimized alt="" width={118} height={22} loading="lazy" className="h-[22px] w-auto" />
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-[18px] gap-y-2 justify-end max-[520px]:justify-start">
          <Link href="/privacy" className="inline-flex items-center min-h-[32px] hover:underline">Privacy</Link>
          <Link href="/terms" className="inline-flex items-center min-h-[32px] hover:underline">Terms</Link>
          <Link href="/contact" className="inline-flex items-center min-h-[32px] hover:underline">Contact</Link>
        </nav>
        <span className="col-span-full text-[12.5px] text-ink-muted">© 2026 GreenReserve. All rights reserved.</span>
      </div>
    </footer>
  );
}
