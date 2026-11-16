'use client';
// Settings → Team (Cam approved the mockup 2026-11-16): the glass pieces the page opens — the confirm that replaces the
// browser's confirm box (same question, same outcome), the one-time password box, the role and area tiles, and Add
// someone. Built to match My profile's useConfirm (PR #416, not on main yet); fold together once both are merged.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { stepUpFetch } from '@/lib/step-up-client';
import { ADMIN_AREAS, type AdminArea } from '@/lib/admin-areas';
import g from '../admin-glass.module.css';
import s from './team.module.css';
import { ROLES, toggleArea } from './logic';

function Portal({ children }: { children: ReactNode }) {
  // Into the admin shell: it carries the --g-* tokens, and a glass card's backdrop-filter would trap a fixed overlay.
  const host = typeof document !== 'undefined' ? (document.querySelector('[data-admin-shell]') ?? document.body) : null;
  return host ? createPortal(children, host) : null;
}

type Ask = { title: string; body: string; ok: string; red: boolean; resolve: (yes: boolean) => void };

/** `const [dialog, ask] = useConfirm()` — render `dialog`; `await ask(...)` is true only on the confirm button. */
export function useConfirm(): [ReactNode, (title: string, body: string, ok: string, red?: boolean) => Promise<boolean>] {
  const [q, setQ] = useState<Ask | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const ask = useCallback((title: string, body: string, ok: string, red = true) => new Promise<boolean>(resolve => setQ({ title, body, ok, red, resolve })), []);
  const done = useCallback((yes: boolean) => { setQ(cur => { cur?.resolve(yes); return null; }); }, []);
  useEffect(() => {
    if (!q) return;
    const prev = document.activeElement as HTMLElement | null;
    // Focus starts on Cancel, so a held or repeated Enter never lands on the confirm button.
    cancelRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === cancelRef.current ? okRef.current : cancelRef.current)?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [q, done]);
  const dialog = q ? (
    <Portal>
      <div className={s.ov} onClick={e => { if (e.target === e.currentTarget) done(false); }}>
        <div className={`${g.glass} ${s.modal}`} role="alertdialog" aria-modal="true" aria-labelledby="tm-confirm-t" aria-describedby="tm-confirm-b">
          <h4 id="tm-confirm-t">{q.title}</h4>
          <p id="tm-confirm-b">{q.body}</p>
          <div className={s.line}>
            <button ref={okRef} type="button" className={`${s.btn} ${q.red ? s.solid : s.pri}`} onClick={() => done(true)}>{q.ok}</button>
            <button ref={cancelRef} type="button" className={s.lnk} onClick={() => done(false)}>Cancel</button>
          </div>
        </div>
      </div>
    </Portal>
  ) : null;
  return [dialog, ask];
}

export function CopyLink({ text, className }: { text: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState('copied'); setTimeout(() => setState('idle'), 2000); }
    catch { setState('failed'); }
  }
  return <button type="button" className={className ?? s.lnk} onClick={copy}>{state === 'copied' ? 'Copied' : state === 'failed' ? 'Couldn’t copy — select it' : 'Copy'}</button>;
}

/** The one-time password, shown once. */
export function TempPassword({ label, pwd, note, children }: { label: string; pwd: string; note: string; children?: ReactNode }) {
  return (
    <div className={s.pw} role="status">
      <span>{label}</span>
      <code>{pwd}</code>
      <small>{note}</small>
      {children}
    </div>
  );
}

export function RoleTiles({ value, onPick, disabled, label }: { value: string; onPick: (role: string) => void; disabled?: boolean; label: string }) {
  return (
    <div className={s.tiles} role="radiogroup" aria-label={label}>
      {ROLES.map(r => (
        <button key={r.value} type="button" role="radio" aria-checked={value === r.value} className={s.tile} disabled={disabled}
          onClick={() => { if (value !== r.value) onPick(r.value); }}>
          <i aria-hidden="true" /><span><b>{r.label}</b><small>{r.desc}</small></span>
        </button>
      ))}
    </div>
  );
}

export function AreaTiles({ value, onChange, disabled, idPrefix }: { value: AdminArea[]; onChange: (v: AdminArea[]) => void; disabled?: boolean; idPrefix: string }) {
  return (
    <div className={s.areas}>
      {ADMIN_AREAS.map(a => (
        <label key={a.key} htmlFor={`${idPrefix}-${a.key}`} className={s.ck}>
          <input id={`${idPrefix}-${a.key}`} type="checkbox" disabled={disabled} checked={value.includes(a.key)}
            onChange={e => onChange(toggleArea(value, a.key, e.target.checked))} />
          <span><b>{a.label}</b><small>{a.help}</small></span>
        </label>
      ))}
    </div>
  );
}

/** Add someone (owner only): name, email, role, areas (at least one) → their one-time password. Same POST as before. */
export function AddDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('support');
  const [areas, setAreas] = useState<AdminArea[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ name: string; pwd: string } | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    // Escape closes, but never mid-request (the step-up and reason boxes answer Escape too).
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy && !done) onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [busy, done, onClose]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { setError('Add their name and email.'); return; }
    if (areas.length === 0) { setError('Tick at least one area they can open.'); return; }
    setError(''); setBusy(true);
    try {
      const res = await stepUpFetch('/api/admin/employees', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, areas }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || `Couldn’t add them (${res.status}).`); return; }
      setDone({ name: name.trim(), pwd: String(data.tempPassword) });
      onAdded();
    } catch { setError('Network error — nobody was added. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <Portal>
      <div className={s.ov} onClick={e => { if (e.target === e.currentTarget && !busy && !done) onClose(); }}>
        <div className={`${g.glass} ${s.modal} ${s.wideModal}`} role="dialog" aria-modal="true" aria-labelledby="tm-add-t">
          {done ? (
            <>
              <h4 id="tm-add-t">{done.name} can sign in</h4>
              <TempPassword label="At /admin with this password" pwd={done.pwd} note="Shown once. Give it to them; they set their own when they first sign in." />
              <div className={s.line}>
                <CopyLink text={done.pwd} className={s.btn} />
                <span className={s.spring} />
                <button type="button" className={`${s.btn} ${s.pri}`} onClick={onClose} autoFocus>Done</button>
              </div>
            </>
          ) : (
            <form onSubmit={add} className={s.modalForm} noValidate>
              <h4 id="tm-add-t">Add someone</h4>
              <div className={s.two}>
                <label>Name<input ref={first} className={s.fld} value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label>
                <label>Email<input className={s.fld} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" /></label>
              </div>
              <div className={s.lab}>Role</div>
              <RoleTiles value={role} onPick={setRole} disabled={busy} label="Role" />
              <div className={s.lab}>Can open</div>
              <AreaTiles idPrefix="new" value={areas} onChange={setAreas} disabled={busy} />
              {error && <p className={`${s.msg} ${s.msgBad}`} role="alert">{error}</p>}
              <div className={s.line}>
                <button type="button" className={s.lnk} onClick={onClose} disabled={busy}>Cancel</button>
                <span className={s.spring} />
                <button type="submit" className={`${s.btn} ${s.pri}`} disabled={busy}>{busy ? 'Adding…' : 'Add them'}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Portal>
  );
}
