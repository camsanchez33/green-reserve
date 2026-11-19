'use client';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { golferLookVars } from './look';
import g from './golfer.module.css';

// The footer of a golfer page in the course's look (BOOKING-LOOK-1): manage, the tee-time pay page and the receipt
// carry it (the site footer skips them, lib/booking-mode wearsCourseLook), so a Dark page doesn't end on a light band.
// `vars` is the page's look; until the booking has loaded it is the default Light.
export function LookFooter({ vars }: { vars?: CSSProperties }) {
  return (
    <footer className={g.bookfoot} style={vars ?? golferLookVars({})}>
      <span>Powered by <Link href="/">GreenReserve</Link></span>
      <span className={g.bookfootLinks}>
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </span>
    </footer>
  );
}
