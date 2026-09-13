'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { isBookingMode, isCourseWorld } from '@/lib/booking-mode';

export default function Nav() {
  const [open, setOpen] = useState(false);
  // H-1: white/blur bar that shrinks once the page has scrolled (prototype
  // nav.solid). Passive listener; no layout work.
  const [solid, setSolid] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setSolid((window.scrollY || window.pageYOffset) > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard')) return null;
  // /for-courses + /for-courses/details have their own pine hero (with a
  // link home + back link baked in) — stacking the white marketing Nav on
  // top of it was a double logo, not clean.
  if (pathname.startsWith('/for-courses')) return null;
  // Course-world pages (course page, member portal, golfer portal) already
  // have their own fully-branded header — no GreenReserve bar at all here.
  // Booking-mode pages (book/checkin/manage/receipt/membership) now use the
  // course's own CourseHeaderBar as their header instead — no white GR bar
  // on top of it. GreenReserve presence there shrinks to the footer.
  if (isCourseWorld(pathname) || isBookingMode(pathname)) return null;

  const links = [
    { href: '/#how', label: 'How it works' },
    { href: '/#pricing', label: 'Pricing' },
    { href: '/#faq', label: 'FAQ' },
    { href: '/dashboard/login', label: 'Operator login' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-lg border-b border-black/5">
      <div className={`px-6 flex items-center justify-between transition-[height] duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${solid ? 'h-14' : 'h-16'}`}>
        <Link href="/" className="flex items-center shrink-0" aria-label="GreenReserve">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={200} height={38} priority className="w-[180px] md:w-[200px] h-auto" />
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map(l => (
            <Link key={l.href} href={l.href} className="text-ink/80 hover:text-ink text-[15px] font-medium px-3 py-2 rounded-md transition-colors">
              {l.label}
            </Link>
          ))}
          <Link href="/for-courses" className="ml-3 bg-pine hover:bg-pine-hover text-white text-[14.5px] font-semibold px-[18px] h-[42px] inline-flex items-center rounded-lg transition-colors">
            List your course
          </Link>
        </div>

        <button className="md:hidden text-ink-soft hover:text-ink p-2" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'}>
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-line">
          <div className="px-6 py-4 flex flex-col gap-1">
            {links.map(l => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-ink-soft hover:text-ink text-sm py-2">{l.label}</Link>
            ))}
            <Link href="/for-courses" onClick={() => setOpen(false)} className="mt-2 bg-pine text-white text-sm font-medium px-4 py-2.5 rounded-lg text-center">List your course</Link>
          </div>
        </div>
      )}
    </nav>
  );
}
