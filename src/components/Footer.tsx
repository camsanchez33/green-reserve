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

  return (
    <footer className="bg-paper border-t border-line">
      <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-2">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={160} height={30} loading="lazy" className="w-[160px] h-auto mb-3" />
          <p className="text-ink-soft text-sm leading-relaxed max-w-xs">
            Online tee sheets for golf courses. Free to list — no monthly fees, no commission on green fees.
          </p>
          <p className="text-ink-faint text-xs mt-4">$1.50 service fee per player, paid by the golfer.</p>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-4">Courses</div>
          <ul className="space-y-2.5 text-sm text-ink-soft">
            <li><Link href="/for-courses" className="hover:text-ink transition-colors">List Your Course</Link></li>
            <li><Link href="/dashboard/login" className="hover:text-ink transition-colors">Operator Login</Link></li>
          </ul>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-4">Company</div>
          <ul className="space-y-2.5 text-sm text-ink-soft">
            <li><a href="mailto:hello@greenreserve.app" className="hover:text-ink transition-colors">hello@greenreserve.app</a></li>
            <li><Link href="/contact" className="hover:text-ink transition-colors">Contact</Link></li>
            <li><Link href="/privacy" className="hover:text-ink transition-colors">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-ink transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="max-w-6xl mx-auto px-6 py-4 text-xs text-ink-faint">
          © {new Date().getFullYear()} GreenReserve. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
