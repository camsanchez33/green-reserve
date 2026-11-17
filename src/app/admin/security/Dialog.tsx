'use client';
// A glass dialog for the Security page (filter, ask, incident). Portalled into the admin shell: it carries the --g-*
// tokens, and a glass card's backdrop-filter would otherwise trap a fixed overlay inside the card. Escape and a click
// outside close it unless it's busy; focus goes to the first control and back to where it was on close.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import g from '../admin-glass.module.css';
import { profileStyles as s } from '@/components/admin/ProfileCard';
import ss from './security.module.css';

export function Dialog({ labelId, onClose, busy = false, children }: { labelId: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) closeRef.current(); };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, []);
  const host = typeof document !== 'undefined' ? (document.querySelector('[data-admin-shell]') ?? document.body) : null;
  if (!host) return null;
  return createPortal(
    <div className={s.ov} onClick={e => { if (e.target === e.currentTarget && !busyRef.current) onClose(); }}>
      <div ref={box} className={`${g.glass} ${s.modal} ${ss.wideModal}`} role="dialog" aria-modal="true" aria-labelledby={labelId}>
        {children}
      </div>
    </div>, host,
  );
}
