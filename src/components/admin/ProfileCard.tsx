'use client';
// Settings → My profile (Cam approved the mockup 2026-11-15): the one card build every card on the page uses, its row,
// and the confirm dialog that replaces the browser's confirm box (same question, same outcome, in the glass).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import g from '@/app/admin/admin-glass.module.css';
import s from './owner-profile.module.css';

export { s as profileStyles };

export function ProfileCard({ title, lead, top, foot, wide, children, labelId }: {
  title: string; lead?: ReactNode; top?: ReactNode; foot?: ReactNode; wide?: boolean; children?: ReactNode; labelId?: string;
}) {
  return (
    <section className={`${g.glass} ${s.card} ${wide ? s.wide : ''}`} aria-labelledby={labelId}>
      <div className={s.ch}>
        <div><h3 id={labelId}>{title}</h3>{lead && <p>{lead}</p>}</div>
        {top}
      </div>
      <div className={s.cb}>{children}</div>
      {foot && <div className={s.cf}>{foot}</div>}
    </section>
  );
}

/** One row: an optional dot (only where it means something), the main line with an optional line under it, an action. */
export function ProfileRow({ dot, children, sub, right }: { dot?: 'ok' | 'warn' | 'bad' | 'none'; children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className={`${s.row} ${dot ? '' : s.nod}`}>
      {dot && <span className={`${s.dot} ${dot === 'none' ? '' : s[dot]}`} aria-hidden="true" />}
      <span className={s.main}><span>{children}</span>{sub && <small>{sub}</small>}</span>
      {right ?? <span />}
    </div>
  );
}

export function Msg({ ok, children, role }: { ok: boolean; children: ReactNode; role?: 'alert' | 'status' }) {
  return <p className={`${s.msg} ${ok ? s.msgOk : s.msgBad}`} role={role ?? (ok ? 'status' : 'alert')}><span className={`${s.dot} ${ok ? s.ok : s.bad}`} aria-hidden="true" /><span>{children}</span></p>;
}

type Ask = { title: string; body: string; ok: string; resolve: (yes: boolean) => void };

/** `const [dialog, ask] = useConfirm()` — render `dialog`, `await ask(...)` resolves true only on the red button. */
export function useConfirm(): [ReactNode, (title: string, body: string, ok: string) => Promise<boolean>] {
  const [q, setQ] = useState<Ask | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const ask = useCallback((title: string, body: string, ok: string) => new Promise<boolean>(resolve => setQ({ title, body, ok, resolve })), []);
  const done = useCallback((yes: boolean) => { setQ(cur => { cur?.resolve(yes); return null; }); }, []);
  useEffect(() => {
    if (!q) return;
    const prev = document.activeElement as HTMLElement | null;
    okRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); done(false); } };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [q, done]);
  // Portalled to the admin shell: a glass card's backdrop-filter would otherwise trap a fixed overlay inside the card.
  // The shell carries the --g-* tokens, so the dialog keeps the look.
  const host = q && typeof document !== 'undefined' ? (document.querySelector('[data-admin-shell]') ?? document.body) : null;
  const dialog = q && host ? createPortal(
    <div className={s.ov} onClick={e => { if (e.target === e.currentTarget) done(false); }}>
      <div className={`${g.glass} ${s.modal}`} role="alertdialog" aria-modal="true" aria-labelledby="pf-confirm-t" aria-describedby="pf-confirm-b">
        <h4 id="pf-confirm-t">{q.title}</h4>
        <p id="pf-confirm-b">{q.body}</p>
        <div className={s.line}>
          <button ref={okRef} type="button" className={`${s.btn} ${s.dng} ${s.solid}`} onClick={() => done(true)}>{q.ok}</button>
          <button type="button" className={s.btn} onClick={() => done(false)}>Cancel</button>
        </div>
      </div>
    </div>, host,
  ) : null;
  return [dialog, ask];
}
