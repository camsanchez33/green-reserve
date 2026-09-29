'use client';
import { useEffect } from 'react';
import s from '@/app/home.module.css';

// PERF-1 (strict speed check, Cam 2026-09-29): the homepage is server-rendered
// now; hydrating the whole page as one client component was the biggest long
// task on load. This island renders nothing — it only wires the scroll
// reveals and the pinned story's motion onto the server-rendered markup
// (found by data attributes), exactly as HomeContent's effect used to.
export default function HomeMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-home-root]');
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Reveals. Everything already in the viewport is marked before the
    // `js` class hides the rest, so the first paint never flashes.
    const els = Array.from(root.querySelectorAll<HTMLElement>(`.${s.fade}`));
    const vh = window.innerHeight;
    els.forEach(el => { if (el.getBoundingClientRect().top < vh * 0.92) el.classList.add(s.in); });
    root.classList.add(s.js);
    let io: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window && !reduce) {
      io = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add(s.in); io?.unobserve(e.target); } });
      }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
      els.forEach(el => { if (!el.classList.contains(s.in)) io?.observe(el); });
    } else {
      els.forEach(el => el.classList.add(s.in));
    }

    // Scroll-driven motion: transform-only, one rAF per frame.
    const story = root.querySelector<HTMLElement>('[data-story]');
    const beats = Array.from(root.querySelector('[data-story-beats]')?.children ?? []);
    const prog = Array.from(root.querySelector('[data-story-prog]')?.children ?? []);
    let cur = 0, ticking = false;
    function frame() {
      ticking = false;
      if (reduce) return;
      const h = window.innerHeight;
      const ph = root!.querySelector<HTMLElement>('[data-story-ph]');
      if (story && ph) {
        const r = story.getBoundingClientRect();
        const total = story.offsetHeight - h;
        const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
        // H-2d §2: the still gets the slow push; the clip already moves, and a
        // second stepped zoom on top of it was the shimmer.
        if (!ph.classList.contains(s.hasVideo)) ph.style.setProperty('--z', (1 + p * 0.14).toFixed(4));
        const i = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
        if (i !== cur) {
          cur = i;
          beats.forEach((b, k) => b.classList.toggle(s.on, k === i));
          prog.forEach((b, k) => b.classList.toggle(s.on, k === i));
        }
      }
    }
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', frame);
    frame();
    return () => {
      io?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', frame);
    };
  }, []);
  return null;
}
