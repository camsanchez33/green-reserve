'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { isBookingMode, isCourseWorld } from '@/lib/booking-mode';

const EASE = 'ease-[cubic-bezier(.16,1,.3,1)]';

export default function Nav() {
  const [open, setOpen] = useState(false);
  // H-1: white/blur bar that shrinks once the page has scrolled (prototype
  // nav.solid). Passive listener; no layout work.
  const [solid, setSolid] = useState(false);
  // H-2e: over the homepage hero there is no bar — just the lockup on cream.
  // Once scrolled past the hero (its height minus the nav's) the white/blur
  // background and the two right-hand items fade in. Every other page has no
  // hero, so it renders the scrolled state from the start; so does
  // prefers-reduced-motion.
  const navRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const isHome = pathname === '/';
  const [past, setPast] = useState(!isHome);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset;
      let p = true;
      if (isHome && !reduced) {
        const hero = document.getElementById('top');
        const navH = navRef.current?.offsetHeight ?? 64;
        const threshold = (hero?.offsetHeight ?? window.innerHeight) - navH;
        p = y > threshold;
      }
      setPast(p);
      // H-2e review: the H-1 shrink only once the bar is visible — over the
      // hero the lockup would otherwise step 8px against bare cream.
      setSolid(y > 40 && p);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [isHome]);

  // H-2e review: the mobile menu unmounts while the bar is hidden; clear it so
  // it does not reappear on its own when the bar comes back.
  useEffect(() => { if (!past) setOpen(false); }, [past]);

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

  // H-2e §6: How it works / Pricing / FAQ are gone for good — on a page this
  // length they jumped one screen and made the top look templated.
  const links = [
    { href: '/dashboard/login', label: 'Operator login' },
  ];

  // Opacity + background only — no layout shift. Items that are faded out are
  // also removed from the tab order and pointer.
  const itemsClass = `transition-opacity duration-500 ${EASE} ${past ? 'opacity-100' : 'opacity-0 pointer-events-none motion-reduce:opacity-100 motion-reduce:pointer-events-auto'}`;

  return (
    <nav
      ref={navRef}
      className={`fixed top-0 left-0 right-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500 ${EASE} ${past ? 'bg-white/85 backdrop-blur-lg border-b border-black/5' : 'bg-transparent border-b border-transparent motion-reduce:bg-white/85 motion-reduce:backdrop-blur-lg motion-reduce:border-black/5'}`}
    >
      <div className={`px-6 flex items-center justify-between transition-[height] duration-500 ${EASE} ${solid ? 'h-14' : 'h-16'}`}>
        <Link href="/" className="flex items-center shrink-0" aria-label="GreenReserve">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={200} height={38} priority className="w-[180px] md:w-[200px] h-auto" />
        </Link>

        <div className={`hidden md:flex items-center gap-1 ${itemsClass}`} aria-hidden={!past}>
          {links.map(l => (
            <Link key={l.href} href={l.href} tabIndex={past ? undefined : -1} className="text-ink-muted hover:text-ink text-[15px] font-medium px-3 py-2 rounded-md transition-colors">
              {l.label}
            </Link>
          ))}
          <Link href="/for-courses" tabIndex={past ? undefined : -1} className="ml-3 bg-pine hover:bg-pine-hover text-white text-[14.5px] font-semibold px-[18px] h-[42px] inline-flex items-center rounded-lg transition-colors">
            List your course
          </Link>
        </div>

        <button
          className={`md:hidden text-ink-soft hover:text-ink p-2 ${itemsClass}`}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-hidden={!past}
          tabIndex={past ? undefined : -1}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {open && past && (
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
