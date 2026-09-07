'use client';
// SD-2. The operator dashboard reported outcomes with window.alert() — thirteen
// of them — which on a phone is a system modal over the tee sheet that has to
// be tapped away before the next golfer can be checked in, and which says
// nothing about whether the thing succeeded or failed beyond its text.
//
// One tiny event bus. Any page calls toast(text, kind); the Toaster rendered by
// OperatorSidebar (present on every authenticated dashboard page) shows it
// above the bottom nav on mobile and bottom-centre on desktop. Errors stay
// longer and can be dismissed; successes fade.

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

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
  return (
    <div className="fixed z-50 left-1/2 -translate-x-1/2 bottom-20 md:bottom-6 w-[calc(100%-2rem)] max-w-md space-y-2 pointer-events-none">
      {items.map(t => (
        <div
          key={t.id}
          role={t.kind === 'ok' ? 'status' : 'alert'}
          className={'pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-md border shadow-lg text-sm ' + (
            t.kind === 'ok' ? 'bg-white border-ok/30 text-ink' :
            t.kind === 'warn' ? 'bg-white border-warn/40 text-ink' :
            'bg-white border-bad/40 text-ink'
          )}
        >
          {t.kind === 'ok'
            ? <CheckCircle2 className="w-4 h-4 text-ok shrink-0 mt-0.5" />
            : <AlertTriangle className={'w-4 h-4 shrink-0 mt-0.5 ' + (t.kind === 'warn' ? 'text-warn' : 'text-bad')} />}
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
