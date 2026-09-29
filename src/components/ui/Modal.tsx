'use client';

// MP-9 (ADMIN_V4 V4-6 §4) — the one dialog. Before this each admin modal was a
// hand-built `fixed inset-0` div: no dialog role, focus stayed on the page
// behind it, Tab walked out into the sidebar, Escape did nothing, and closing
// dropped focus on <body>. Two overlay colours and three shadow weights too.
//
// <Modal> gives every site: role="dialog" + aria-modal + a labelled title,
// focus moved in on open, Tab trapped inside, Escape to close, and focus back
// on whatever opened it. `variant="drawer"` is the right-hand panel (Revenue).

import { useEffect, useId, useRef } from 'react';

// Recently focused elements outside any dialog. A modal opened from a menu
// item loses its opener (the menu closes in the same render), so on close focus
// goes to the newest one still on the page — the menu's own trigger.
const recent: HTMLElement[] = [];
let tracking = false;
function trackFocus() {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  document.addEventListener('focusin', e => {
    const t = e.target as HTMLElement;
    if (!(t instanceof HTMLElement) || t.closest('[role="dialog"]')) return;
    recent.push(t);
    if (recent.length > 10) recent.shift();
  }, true);
}
trackFocus();

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title, titleNode, danger, onClose, children, variant = 'center', size = 'md', dismissable = true, pad = 'p-5', className = '',
}: {
  /** Accessible name; also rendered as the heading unless titleNode is given. */
  title: string;
  /** Custom heading markup (it still gets the dialog's label id). */
  titleNode?: React.ReactNode;
  danger?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  variant?: 'center' | 'drawer';
  size?: 'sm' | 'md' | 'lg';
  /** false for a dialog the user must answer (Escape and backdrop do nothing). */
  dismissable?: boolean;
  /** Panel padding (centre variant). */
  pad?: string;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Latest onClose without re-running the effect (sites pass inline arrows).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissRef = useRef(dismissable);
  dismissRef.current = dismissable;

  useEffect(() => {
    trackFocus();
    const active = document.activeElement as HTMLElement | null;
    const openers = [...recent, ...(active && active !== document.body ? [active] : [])];
    const el = panel.current;
    if (el) {
      // Prefer a field (the reason box, the confirm-by-typing input) over the
      // first button, which is usually Cancel or a close X.
      const field = el.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
      (field ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissRef.current) { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => n.offsetParent !== null || n === document.activeElement);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.current.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !panel.current.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      for (let i = openers.length - 1; i >= 0; i--) {
        if (openers[i].isConnected) { openers[i].focus(); break; }
      }
    };
  }, []);

  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-xl' : 'max-w-md';
  const heading = titleNode
    ? <div id={titleId}>{titleNode}</div>
    : <h2 id={titleId} className={'text-sm font-medium mb-3 ' + (danger ? 'text-bad' : 'text-ink')}>{title}</h2>;

  if (variant === 'drawer') {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-ink/30" aria-hidden="true" onClick={() => dismissable && onClose()}/>
        <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
          className={`relative w-full ${width} bg-paper h-full border-l border-line overflow-y-auto outline-none ${className}`}>
          {/* The drawer's header stays pinned while its body scrolls. */}
          {titleNode ? <div id={titleId} className="sticky top-0 z-10">{titleNode}</div> : <h2 id={titleId} className="sr-only">{title}</h2>}
          {children}
        </div>
      </div>
    );
  }

  return (
    // No close-on-backdrop here, on purpose: several of these hold a typed
    // reason or a confirm-by-typing field that a stray click would throw away.
    <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`bg-white rounded-lg border border-line w-full ${width} ${pad} my-auto outline-none ${className}`}>
        {heading}
        {children}
      </div>
    </div>
  );
}

export function ModalActions({ onCancel, onConfirm, confirmLabel, disabled, danger, working, cancelLabel = 'Cancel' }: {
  onCancel: () => void; onConfirm: () => void; confirmLabel: string; disabled?: boolean; danger?: boolean; working?: boolean; cancelLabel?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 mt-4">
      <button type="button" onClick={onCancel} className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 transition-colors">{cancelLabel}</button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled || working}
        className={
          'text-xs font-medium px-3 py-1.5 rounded-md text-white transition-colors disabled:opacity-40 ' +
          (danger ? 'bg-bad hover:bg-bad/90' : 'bg-pine hover:bg-pine-hover')
        }
      >
        {working ? 'Working…' : confirmLabel}
      </button>
    </div>
  );
}
