'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { isBookingMode, isCourseWorld } from '@/lib/booking-mode';

export default function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard')) return null;
  // Course-world pages (course page, member portal, golfer portal) already
  // have their own fully-branded header — no GreenReserve bar at all here.
  // Booking-mode pages (book/checkin/manage/receipt/membership) now use the
  // course's own CourseHeaderBar as their header instead — no white GR bar
  // on top of it. GreenReserve presence there shrinks to the footer.
  if (isCourseWorld(pathname) || isBookingMode(pathname)) return null;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-line">
      <div className="px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center shrink-0">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={200} height={38} priority className="w-[200px] h-auto" />
        </Link>

        <div className="hidden md:flex items-center gap-1">
          <Link href="/#how-it-works" className="text-ink-soft hover:text-ink text-sm px-3 py-2 rounded-md transition-colors">
            How It Works
          </Link>
          <Link href="/#pricing" className="text-ink-soft hover:text-ink text-sm px-3 py-2 rounded-md transition-colors">
            Pricing
          </Link>
          <Link href="/#faq" className="text-ink-soft hover:text-ink text-sm px-3 py-2 rounded-md transition-colors">
            FAQ
          </Link>
          <Link href="/dashboard/login" className="text-ink-soft hover:text-ink text-sm px-3 py-2 rounded-md transition-colors">
            Operator Login
          </Link>
          <Link href="/for-courses" className="ml-3 bg-pine hover:bg-pine-hover text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
            List Your Course
          </Link>
        </div>

        <button className="md:hidden text-ink-soft hover:text-ink p-2" onClick={() => setOpen(!open)}>
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-line">
          <div className="px-6 py-4 flex flex-col gap-1">
            <Link href="/#how-it-works" onClick={() => setOpen(false)} className="text-ink-soft hover:text-ink text-sm py-2">How It Works</Link>
            <Link href="/#pricing" onClick={() => setOpen(false)} className="text-ink-soft hover:text-ink text-sm py-2">Pricing</Link>
            <Link href="/#faq" onClick={() => setOpen(false)} className="text-ink-soft hover:text-ink text-sm py-2">FAQ</Link>
            <Link href="/dashboard/login" onClick={() => setOpen(false)} className="text-ink-soft hover:text-ink text-sm py-2">Operator Login</Link>
            <Link href="/for-courses" onClick={() => setOpen(false)} className="mt-2 bg-pine text-white text-sm font-medium px-4 py-2.5 rounded-md text-center">List Your Course</Link>
          </div>
        </div>
      )}
    </nav>
  );
}
