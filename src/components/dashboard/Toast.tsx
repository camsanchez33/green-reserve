'use client';
// SD-2. The operator dashboard reported outcomes with window.alert() — thirteen
// of them — which on a phone is a system modal over the tee sheet that has to
// be tapped away before the next golfer can be checked in, and which says
// nothing about whether the thing succeeded or failed beyond its text.
//
// One tiny event bus. Any page calls toast(text, kind); the Toaster rendered by
// OperatorSidebar (present on every authenticated dashboard page) shows it
// top-right (UI-KIT-4; it was bottom-centre). Errors stay
// longer and can be dismissed; successes fade.

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export type ToastKind = 'ok' | 'bad' | 'warn';
interface ToastItem { id: number; text: string; kind: ToastKind }

const EVENT = 'gr-dashboard-toast';

export function toast(text: string, kind: ToastKind = 'bad') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { text, kind } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; kind: ToastKind }>).detail;
      const id = Date.now() + Math.random();
      setItems(list => [...list, { id, text: d.text, kind: d.kind }]);
      // Successes fade; problems stay long enough to be read across a counter.
      setTimeout(() => setItems(list => list.filter(i => i.id !== id)), d.kind === 'ok' ? 5000 : 10000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (items.length === 0) return null;
  // UI-KIT-4 (Cam 2026-11-26): top-right glass with a coloured left edge (green done, amber heads-up, red problem); it
  // arrives quick (the panel motion) and the colour is the edge, so no dot. Same text, same dismiss button, same timers.
  return (
    <div className="fixed z-[60] top-16 right-4 grid gap-2 max-w-[calc(100vw-2rem)] w-max pointer-events-none">
      {items.map(t => (
        <div
          key={t.id}
          role={t.kind === 'ok' ? 'status' : 'alert'}
          className={'op-glass op-toast pointer-events-auto flex items-center gap-3 py-2.5 pl-3.5 pr-2.5 rounded-lg border-l-[3px] text-sm text-ink ' + (
            t.kind === 'ok' ? 'border-l-ok' : t.kind === 'warn' ? 'border-l-warn' : 'border-l-bad'
          )}
        >
          <span className="flex-1 leading-snug">{t.text}</span>
          <button
            onClick={() => setItems(list => list.filter(i => i.id !== t.id))}
            className="shrink-0 -m-1 p-2 text-ink-muted hover:text-ink transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
