'use client';
import { usePathname } from 'next/navigation';
import { isCourseWorld } from '@/lib/booking-mode';

// Nav is fixed and normally reserves 64px (pt-16) below it for every page.
// Course-world pages now render NO Nav at all (their own hero/header takes
// over) — without this, they'd show a 64px blank gap above the hero where
// the Nav bar used to sit.
export default function MainOffset({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <main className={isCourseWorld(pathname) ? '' : 'pt-16'}>{children}</main>;
}
