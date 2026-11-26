'use client';
import { useEffect, useState } from 'react';
import s from '@/app/home.module.css';

// Homepage on a phone (Cam 2026-11-24/26, lanes/build.md "UI style overhaul — APPROVED"): a sticky "Book a demo" bar at
// the bottom of the screen. It shows only once the hero's own Book a demo button has scrolled away, and hides again when
// the Book a call block (#demo) is reached (on screen or scrolled past), so there is never a second copy of the button
// in view and the bar never sits over the site footer. Hidden on a computer
// by CSS (the desktop page is unchanged).
export default function StickyDemoBar() {
  const [heroGone, setHeroGone] = useState(false);
  const [closerReached, setCloserReached] = useState(false);
  useEffect(() => {
    const hero = document.getElementById('hero-demo');
    const closer = document.getElementById('demo');
    if (!hero || !closer || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.target === hero) setHeroGone(!e.isIntersecting);
        // Reached = on screen or already scrolled past (its top above the screen's bottom), so the bar never comes back
        // over the site footer below it.
        if (e.target === closer) setCloserReached(e.isIntersecting || e.boundingClientRect.top < (e.rootBounds?.height ?? window.innerHeight));
      }
    });
    io.observe(hero); io.observe(closer);
    return () => io.disconnect();
  }, []);
  return (
    <div className={s.stickyDemo} hidden={!heroGone || closerReached}>
      <a className={s.btn} href="#demo">Book a demo</a>
    </div>
  );
}
