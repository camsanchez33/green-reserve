'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { isBookingMode, isCourseWorld } from '@/lib/booking-mode';

const EASE = 'ease-[cubic-bezier(.16,1,.3,1)]';

export default function Nav() {
  const [open, setOpen] = useState(false);
  // H-1: white/blur bar that shrinks once the page has scrolled (prototype
  // nav.solid). Passive listener; no layout work.
  const [solid, setSolid] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === '/';

  // H-2g §2: the homepage lockup is painted once, at the top of the hero, and
  // scrolls away with it — it has no scrolled state to listen for. Every other
  // page keeps the H-1 shrink. The listener is not registered at all on `/`,
  // rather than registered and ignored: the reason the bar used to come back
  // was a handler nobody remembered was running.
  useEffect(() => {
    if (isHome) return;
    const onScroll = () => setSolid((window.scrollY || window.pageYOffset) > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard')) return null;
  // /for-courses + /for-courses/details have their own pine hero (with a
  // link home + back link baked in) — stacking the white marketing Nav on
  // top of it was a double logo, not clean.
  if (pathname.startsWith('/for-courses')) return null;
  // SC-2: /call/[token] is the same self-contained shape.
  if (pathname.startsWith('/call/')) return null;
  // Course-world pages (course page, member portal, golfer portal) already
  // have their own fully-branded header — no GreenReserve bar at all here.
  // Booking-mode pages (book/checkin/manage/receipt/membership) now use the
  // course's own CourseHeaderBar as their header instead — no white GR bar
  // on top of it. GreenReserve presence there shrinks to the footer.
  if (isCourseWorld(pathname) || isBookingMode(pathname)) return null;

  // H-2g §2 + §3: on `/` there is no bar at all. The lockup sits absolutely at
  // the top of the hero (`.hero` is `position: relative`, and nothing above it
  // is positioned, so `top: 0` lands on the hero either way) — out of flow, so
  // the hero still measures exactly one viewport, and it scrolls away with the
  // hero and never returns. LOGO-1 (Cam 2026-09-30): the lockup sits in the
  // top-left CORNER of the window (edge padding, not the 1180px content column —
  // Cam: "like Salesforce, all the way in that corner"), Operator login top-right. The logo is the traced
  // vector (/brand/logo.svg), so it is sharp at every size and density.
  // UI-H-1 (HOMEPAGE_SPEC.md, Cam 2026-10-01) adds "Book a demo" top-right: the
  // approved design repeats it in the nav, hero, See it work and the end band.
  // On phones Operator login drops to the footer (its durable home, §4).
  if (isHome) {
    return (
      <nav className="absolute top-0 left-0 right-0 z-50">
        <div className="px-6 md:px-10 py-5 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center shrink-0" aria-label="GreenReserve">
            {/* Explicit width/height: this is near the top of the fold, so
                the reserved box is what keeps §5's CLS budget. */}
            <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={240} height={45} priority className="w-[170px] min-[960px]:w-[240px] h-auto" />
          </Link>
          {/* H-2g review: ink-soft, not ink-muted (ink-muted on paper is 3.3:1,
              under the 4.5:1 floor for this size). */}
          {/* UI-H-1: Operator login + Book a demo (HOMEPAGE_SPEC.md). /demo
              redirects to the Cal.com booker, or the inquiry form when it is off. */}
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/dashboard/login" className="hidden sm:inline text-ink-soft hover:text-ink text-[15px] font-medium transition-colors">
              Operator login
            </Link>
            <a href="/demo" className="inline-flex items-center h-[42px] px-4 rounded-md bg-pine hover:bg-pine-hover text-white text-[15px] font-semibold transition-colors">
              Book a demo
            </a>
          </div>
        </div>
      </nav>
    );
  }

  // H-2e §6: How it works / Pricing / FAQ are gone for good — on a page this
  // length they jumped one screen and made the top look templated.
  const links = [
    { href: '/dashboard/login', label: 'Operator login' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-paper/90 backdrop-blur-lg border-b border-line">
      <div className={`px-6 md:px-10 flex items-center justify-between transition-[height] duration-500 ${EASE} ${solid ? 'h-14' : 'h-16'}`}>
        <Link href="/" className="flex items-center shrink-0" aria-label="GreenReserve">
          <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={200} height={38} priority className="w-[180px] md:w-[200px] h-auto" />
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map(l => (
            <Link key={l.href} href={l.href} className="text-ink-muted hover:text-ink text-[15px] font-medium px-3 py-2 rounded-md transition-colors">
              {l.label}
            </Link>
          ))}
          <a href="/demo" className="ml-3 bg-pine hover:bg-pine-hover text-white text-[15px] font-semibold px-4 h-[42px] inline-flex items-center rounded-md transition-colors">
            Book a demo
          </a>
        </div>

        <button
          className="md:hidden text-ink-soft hover:text-ink p-2"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-white border-t border-line">
          <div className="px-6 py-4 flex flex-col gap-1">
            {links.map(l => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-ink-soft hover:text-ink text-sm py-2">{l.label}</Link>
            ))}
            <a href="/demo" onClick={() => setOpen(false)} className="mt-2 bg-pine text-white text-sm font-semibold px-4 py-2.5 rounded-md text-center">Book a demo</a>
          </div>
        </div>
      )}
    </nav>
  );
}
