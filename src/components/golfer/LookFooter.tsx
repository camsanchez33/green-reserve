'use client';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { BookingModeFooter } from '@/components/Footer';
import g from './golfer.module.css';

// The footer of a golfer page in the course's look (BOOKING-LOOK-1): manage, the tee-time pay page and the receipt
// carry it (the site footer skips them, Footer.tsx wearsCourseLook), so a Dark page doesn't end on a light band.
// `vars` is set only when the course has picked a look; without one (or until the booking loads) it is the site's
// booking-mode footer, exactly as before.
export function LookFooter({ vars }: { vars?: CSSProperties }) {
  if (!vars) return <BookingModeFooter />;
  return (
    <footer className={g.bookfoot} style={vars}>
      <span>Powered by <Link href="/">GreenReserve</Link></span>
      <span className={g.bookfootLinks}>
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </span>
    </footer>
  );
}
