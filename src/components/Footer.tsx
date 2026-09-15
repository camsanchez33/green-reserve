'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { isBookingMode, isCourseWorld } from '@/lib/booking-mode';

export default function Footer() {
  const pathname = usePathname();

  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard')) return null;

  // Course-world pages (course page, member portal, golfer portal) get the
  // minimal text-only "Powered by GreenReserve" footer — no marketing links,
  // no logo image (white-label rule: this is the course's own page).
  if (isCourseWorld(pathname)) {
    return (
      <footer className="bg-paper border-t border-line">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-ink-faint">
          <span>Powered by <Link href="/" className="text-pine hover:text-pine-hover transition-colors font-medium">GreenReserve</Link></span>
          <div className="flex items-center gap-4">
            <a href="mailto:hello@greenreserve.app" className="hover:text-ink-soft transition-colors">hello@greenreserve.app</a>
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
  if (isBookingMode(pathname)) {
    return (
      <footer className="bg-paper border-t border-line">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-ink-faint">
          <span className="flex items-center gap-1.5">
            Powered by
            <Link href="/" className="inline-flex items-center hover:opacity-80 transition-opacity">
              <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={120} height={22} loading="lazy" className="w-[120px] h-auto" />
            </Link>
          </span>
          <div className="flex items-center gap-4">
            <a href="mailto:hello@greenreserve.app" className="hover:text-ink-soft transition-colors">hello@greenreserve.app</a>
            <Link href="/privacy" className="hover:text-ink-soft transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-ink-soft transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    );
  }

  // H-1 (UI_REVISE_SPEC §5.10): the marketing footer from the approved
  // prototype — lockup, four links, the year. The fee lines that used to sit
  // here ("no commission", "$1.50 … paid by the golfer") were removed when the
  // fee copy was frozen and do not return — the footer carries no fee line.
  return (
    <footer className="bg-paper border-t border-line">
      <div className="w-[min(1180px,calc(100%-48px))] mx-auto py-8 flex flex-wrap justify-between items-center gap-x-6 gap-y-3.5 text-sm text-ink-muted max-md:justify-center max-md:text-center">
        <Link href="/" className="inline-flex items-center hover:opacity-80 transition-opacity" aria-label="GreenReserve">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={130} height={25} loading="lazy" className="w-[130px] h-auto" />
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 justify-center">
          <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
          <Link href="/operator-agreement" className="hover:text-ink transition-colors">Operator agreement</Link>
          <Link href="/contact" className="hover:text-ink transition-colors">Contact</Link>
          {/* H-2e §8: the durable route to the dashboard, independent of scroll position. */}
          <Link href="/dashboard/login" className="hover:text-ink transition-colors">Operator login</Link>
          <a href="mailto:hello@greenreserve.app" className="hover:text-ink transition-colors">hello@greenreserve.app</a>
        </nav>
        <span>© {new Date().getFullYear()} GreenReserve</span>
      </div>
    </footer>
  );
}
