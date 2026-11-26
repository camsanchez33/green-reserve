'use client';
import { useEffect, useState } from 'react';
import s from '@/app/home.module.css';

// Homepage on a phone (Cam 2026-11-24/26, lanes/build.md "UI style overhaul — APPROVED"): a sticky "Book a demo" bar at
// the bottom of the screen. It shows only once the hero's own Book a demo button has scrolled away, and hides again when
// the Book a call block (#demo) is on screen, so there is never a second copy of the button in view. Hidden on a computer
// by CSS (the desktop page is unchanged).
export default function StickyDemoBar() {
  const [heroGone, setHeroGone] = useState(false);
  const [closerIn, setCloserIn] = useState(false);
  useEffect(() => {
    const hero = document.getElementById('hero-demo');
    const closer = document.getElementById('demo');
    if (!hero || !closer || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.target === hero) setHeroGone(!e.isIntersecting);
        if (e.target === closer) setCloserIn(e.isIntersecting);
      }
    });
    io.observe(hero); io.observe(closer);
    return () => io.disconnect();
  }, []);
  return (
    <div className={s.stickyDemo} hidden={!heroGone || closerIn}>
      <a className={s.btn} href="#demo">Book a demo</a>
    </div>
  );
}
