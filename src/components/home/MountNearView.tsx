'use client';
import { useEffect, useRef, useState } from 'react';

// PERF-1: renders its children only once the placeholder comes within
// `margin` of the viewport. The "See it work" demos sit far below the fold,
// and hydrating them on load was part of Home's longest task on a slow phone.
// The placeholder keeps the space, so nothing on screen moves when they mount.
export default function MountNearView({ children, minHeight, margin = '600px' }: { children: React.ReactNode; minHeight: number; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (!('IntersectionObserver' in window)) { setShow(true); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setShow(true); io.disconnect(); }
    }, { rootMargin: `${margin} 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [show, margin]);
  return <div ref={ref} style={show ? undefined : { minHeight }}>{show ? children : null}</div>;
}
