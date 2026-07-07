'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isBookingMode } from '@/lib/booking-mode';

export default function Footer() {
  const pathname = usePathname();

  // Admin and dashboard pages render their own full-screen layouts with no public footer.
  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard')) return null;

  // Booking mode: trimmed footer — legal links and support only, no
  // operator marketing links.
  if (isBookingMode(pathname)) {
    return (
      <footer className="bg-black border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-white/30">
          <span>© {new Date().getFullYear()} Green Reserve. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <a href="mailto:hello@greenreserve.app" className="hover:text-white transition-colors">hello@greenreserve.app</a>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="bg-black border-t border-white/10">
      <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-2">
          <div className="text-white font-bold text-lg tracking-tight mb-3">
            Green<span className="text-emerald-400">Reserve</span>
          </div>
          <p className="text-white/40 text-sm leading-relaxed max-w-xs">
            Online tee sheets for golf courses. Free to list — no monthly fees, no commission on green fees.
          </p>
          <p className="text-white/20 text-xs mt-4">$1.50 service fee per player, paid by the golfer.</p>
        </div>

        <div>
          <div className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-4">Courses</div>
          <ul className="space-y-2.5 text-sm text-white/40">
            <li><Link href="/for-courses" className="hover:text-white transition-colors">List Your Course</Link></li>
            <li><Link href="/dashboard/login" className="hover:text-white transition-colors">Operator Login</Link></li>
          </ul>
        </div>

        <div>
          <div className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-4">Company</div>
          <ul className="space-y-2.5 text-sm text-white/40">
            <li><a href="mailto:hello@greenreserve.app" className="hover:text-white transition-colors">hello@greenreserve.app</a></li>
            <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
            <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-white/20">
          <span>© {new Date().getFullYear()} Green Reserve. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
