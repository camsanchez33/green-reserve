'use client';
// POS-7 (Cam 2026-11-09, "use it on other tab bars"): the Pro shop's sliding tab highlight, shared. The marker
// moves to the tab picked — a raised pill (`look="pill"`) or a 2px underline (`look="line"`) — measured from the
// tab's own box, re-measured once the font swaps in and on resize; off with reduced motion. One row always: on a
// phone the bar scrolls sideways rather than wrap (a wrapped row would split the marker).
import { useEffect, useRef, useState, type ReactNode } from 'react';

type Box = { left: number; top: number; width: number; height: number };

export function SlidingTabs<K extends string>({ tabs, value, onChange, look = 'line', label, className = '', tabClassName = '' }: {
  tabs: readonly (readonly [K, ReactNode])[]; value: K; onChange: (k: K) => void;
  look?: 'pill' | 'line'; label?: string; className?: string; tabClassName?: string;
}) {
  const refs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({});
  const [box, setBox] = useState<Box | null>(null);
  const keys = tabs.map(t => t[0]).join('|');
  useEffect(() => {
    const place = () => { const el = refs.current[value]; setBox(el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null); };
    place();
    document.fonts?.ready.then(place).catch(() => {});
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [value, keys]);
  void look; // UI-KIT-4: every tab bar is the underline (2px green); `look` stays so call sites need no edit
  return (
    <div role="tablist" aria-label={label}
      className={'relative inline-flex max-w-full overflow-x-auto whitespace-nowrap gap-1 border-b border-line ' + className}>
      {box && (
        <span aria-hidden="true"
          className="absolute h-0.5 bg-[var(--op-focus,var(--color-fairway))] transition-[left,width] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
          style={{ left: box.left, width: box.width, bottom: -1 }} />
      )}
      {tabs.map(([k, l]) => (
        <button key={k} ref={el => { refs.current[k] = el; }} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={'relative z-10 shrink-0 h-10 px-4 text-[14px] font-medium transition-colors duration-[120ms] ' + (value === k ? 'text-ink' : 'text-ink-muted hover:text-ink') + ' ' + tabClassName}>{l}</button>
      ))}
    </div>
  );
}
