'use client';
// SETTINGS-6 (Cam 2026-11-17, "fix settings messages and then good to go"; approved mockup
// lanes/dashboard/settings-mockup.html and its comment threads). The pieces every Settings area shares: a group card
// with its short name and one-line note, a row that opens its own small popup (read-only rows don't look clickable),
// the popup itself, a switch and a choice list. Tokens only, so Charcoal and Light both follow.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { INPUT } from '@/components/ui/field';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';

export type Course = Record<string, unknown>;

/** What every area needs from the page. `save` PATCHes only the fields given (the settings route), merges them into
 *  the page's copy on success and returns null, or returns the refusal in the route's own words. */
export type Ctx = {
  form: Course;
  merge: (p: Course) => void;
  save: (p: Course) => Promise<string | null>;
  /** "Edit course settings" (the owner, or staff the owner allowed). */
  canEdit: boolean;
  /** The owner's own login: the cancellation policy, time zone, course type, cart charging, tax and readers. */
  owner: boolean;
  /** The access list has loaded: owner-only parts wait for it rather than flash. */
  accessLoaded: boolean;
  email: string;
  goArea: (area: string, target?: string) => void;
};

export async function saveSettings(p: Course): Promise<string | null> {
  const r = await dfetch('/api/operator/settings', { method: 'PATCH', body: JSON.stringify(p) });
  return r.ok ? null : r.error;
}

export const FIELD = INPUT + ' w-full';
export const LINK = 'text-[13px] font-semibold text-ink underline underline-offset-[3px] decoration-ink-muted hover:decoration-ink disabled:opacity-50';
export const PRIMARY = 'bg-pine hover:bg-pine-hover text-white rounded-[10px] text-[13px] font-semibold px-3.5 py-[9px] min-h-[40px] disabled:opacity-40';

const Pen = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    className="flex-none mt-[3px] text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
    <path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" />
  </svg>
);
export const Chevron = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-ink-muted"><path d="m9 6 6 6-6 6" /></svg>;

/** A group: its card, short name and (optional) one-line note. `setup` marks it for Finish-setting-up links. */
export function Group({ id, title, note, setup, children }: { id: string; title: string; note?: ReactNode; setup?: string; children: ReactNode }) {
  return (
    <Card id={`g-${id}`} data-setup={setup} className="pb-1.5 scroll-mt-[76px] md:scroll-mt-4">
      <div className="px-3 pt-3 pb-1.5"><h3 className="text-[15px] font-semibold text-ink">{title}</h3></div>
      {note && <p className="mx-3 mb-2 text-[13px] text-ink-soft">{note}</p>}
      {children}
    </Card>
  );
}

const ROW = 'w-full grid grid-cols-1 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-1 sm:gap-4 items-start px-3 py-[11px] border-t border-line text-[13.5px] text-left';
/** Label over value (the confirmation email's narrow column). */
const ROW_STACK = 'w-full grid grid-cols-1 gap-1 items-start px-3 py-[11px] border-t border-line text-[13.5px] text-left';

/** One setting. With `onOpen` it is a button that opens its own popup (a pencil shows on hover); without, it is
 *  read only and plain. */
export function Row({ id, label, note, value, onOpen, setup, stack }: { id: string; label: string; note?: ReactNode; value: ReactNode; onOpen?: () => void; setup?: string; stack?: boolean }) {
  const inner = (
    <>
      <span className="min-w-0">
        <span className={'block font-medium ' + (onOpen ? 'text-ink' : 'text-ink-soft')}>{label}</span>
        {note && <small className="block mt-0.5 text-[12.5px] leading-snug text-ink-soft">{note}</small>}
      </span>
      <span className={'flex items-start gap-2 font-medium text-ink [overflow-wrap:anywhere] ' + (stack ? 'justify-between' : 'sm:justify-end sm:text-right')}>
        <span className="min-w-0">{value}</span>{onOpen && <Pen />}
      </span>
    </>
  );
  return onOpen
    ? <button type="button" id={`r-${id}`} data-setup={setup} onClick={onOpen} aria-label={`${label}: change`}
        className={(stack ? ROW_STACK : ROW) + ' group cursor-pointer transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-soft motion-reduce:transition-none'}>{inner}</button>
    : <div id={`r-${id}`} data-setup={setup} className={stack ? ROW_STACK : ROW}>{inner}</div>;
}
export const Muted = ({ children }: { children: ReactNode }) => <span className="font-normal text-ink-soft">{children}</span>;

/** A pop-up window: the panel stays solid over the page (glass rule), Escape and the backdrop close it, focus goes in
 *  and comes back. */
export function Popup({ label, onClose, children, size = 'md' }: { label: string; onClose: () => void; children: ReactNode; size?: 'md' | 'lg' | 'xl' }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    return () => { back?.focus?.(); };
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const w = size === 'xl' ? 'max-w-[860px]' : size === 'lg' ? 'max-w-[640px]' : 'max-w-[480px]';
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <Card ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className={'outline-none w-full my-auto flex flex-col gap-4 px-5 sm:px-[26px] py-6 text-ink ' + w}>
        {children}
      </Card>
    </div>
  );
}

/** A popup for one setting: Cancel and Save (or only Done when `onSave` is left out, for parts that save themselves).
 *  A refusal stays in the popup in the route's words; success closes it and says Saved. */
export function EditPopup({ title, hint, onClose, onSave, children, saveLabel = 'Save', savedText = 'Saved.', size, canSave = true }: {
  title: string; hint?: ReactNode; onClose: () => void; onSave?: () => Promise<string | null>; children: ReactNode; saveLabel?: string; savedText?: string; size?: 'md' | 'lg' | 'xl'; canSave?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    if (!onSave) { onClose(); return; }
    setBusy(true); setErr('');
    const e = await onSave();
    setBusy(false);
    if (e) { setErr(e); return; }
    toast(savedText, 'ok');
    onClose();
  }
  return (
    <Popup label={title} onClose={onClose} size={size}>
      <form className="contents" onSubmit={e => { e.preventDefault(); if (!busy && canSave) go(); }}>
        <h3 className="text-[18px] font-semibold text-ink">{title}</h3>
        {hint && <p className="-mt-2 text-[13px] text-ink-soft">{hint}</p>}
        {children}
        {err && <p role="alert" className="text-[13px] text-bad">{err}</p>}
        <div className="flex items-center gap-3 pt-1">
          {onSave && <button type="button" className={LINK} onClick={onClose}>Cancel</button>}
          <span className="flex-1" />
          <button type="submit" className={PRIMARY} disabled={busy || !canSave}>{busy ? 'Saving…' : onSave ? saveLabel : 'Done'}</button>
        </div>
      </form>
    </Popup>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[12.5px] text-ink-muted">
      {label}
      {children}
      {hint && <span className="text-[12px] text-ink-muted">{hint}</span>}
    </label>
  );
}

/** The on/off switch (the v4 kit's .sw: a light on-colour, 40 by 24). */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={'relative inline-block flex-none w-10 h-6 rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 ' + (on ? 'bg-[var(--op-on)]' : 'bg-[var(--op-track)]')}>
      <i aria-hidden="true" className={'absolute left-[3px] top-[3px] w-[18px] h-[18px] rounded-md transition-transform motion-reduce:transition-none ' + (on ? 'translate-x-4 bg-[var(--op-knob)]' : 'bg-[var(--op-knob-off)]')} />
    </button>
  );
}

/** A labelled switch line inside a popup. */
export function SwitchLine({ label, help, on, onChange, disabled }: { label: string; help?: ReactNode; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="min-w-0"><span className="block text-[14px] font-medium text-ink">{label}</span>{help && <span className="block mt-0.5 text-[12.5px] text-ink-soft">{help}</span>}</span>
      <Switch on={on} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

/** Radio choices, one per line, each with a line of help. */
export function Choices<T extends string>({ value, options, onChange, name, disabled }: { value: T; options: readonly { key: T; label: string; help?: string }[]; onChange: (v: T) => void; name: string; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-col gap-2">
      {options.map(o => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(o.key)}
            className={'flex items-start gap-3 px-3 py-[11px] min-h-[46px] rounded-[12px] border bg-ink/5 text-left disabled:opacity-60 ' + (on ? 'border-ink' : 'border-line hover:border-ink-muted')}>
            <i aria-hidden="true" className={'shrink-0 mt-px w-[18px] h-[18px] rounded-full ' + (on ? 'border-[5px] border-ink' : 'border-[1.5px] border-ink-muted')} />
            <span className="min-w-0"><b className="block text-[13.5px] font-semibold text-ink">{o.label}</b>{o.help && <small className="block mt-0.5 text-[12.5px] text-ink-soft">{o.help}</small>}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A number from a text box: blank stays null, anything else a number. */
export const num = (v: string) => (v.trim() === '' ? null : Number(v));
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** The popup for one plain field (text, a number, a link, a few lines). Sends only that field. */
export function TextEdit({ ctx, field, title, hint, type = 'text', lines, maxLength, toValue, onClose }: {
  ctx: Ctx; field: string; title: string; hint?: ReactNode; type?: 'text' | 'number' | 'url' | 'tel'; lines?: number; maxLength?: number;
  /** From the box to what the route takes (default: the text, or a number for type="number"). */
  toValue?: (v: string) => unknown; onClose: () => void;
}) {
  const start = ctx.form[field];
  const [v, setV] = useState(Array.isArray(start) ? start.join('\n') : start == null ? '' : String(start));
  const conv = toValue ?? ((s: string) => (type === 'number' ? num(s) : s));
  return (
    <EditPopup title={title} hint={hint} onClose={onClose} onSave={() => ctx.save({ [field]: conv(v) })}>
      <Field label={title}>
        {lines
          ? <textarea value={v} onChange={e => setV(e.target.value)} rows={lines} maxLength={maxLength} className={FIELD + ' resize-y'} autoFocus />
          : <input type={type === 'number' ? 'text' : type} inputMode={type === 'number' ? 'numeric' : undefined} value={v} onChange={e => setV(e.target.value)} maxLength={maxLength} className={FIELD} autoFocus />}
      </Field>
    </EditPopup>
  );
}
