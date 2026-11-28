'use client';
// SCHEDULE-3 (Cam 2026-11-16, lanes/dashboard.md item 4): the small pieces every Schedule tab shares, drawn from
// lanes/dashboard/schedule-mockup.html — a bare plus, a pencil, a switch, the pop-up, tiles, a money field.
// Tokens only (text-ink, border-line, bg-paper…), so Charcoal and Light both get every change.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@/components/ui/Modal';

export const FIELD = 'w-full bg-paper border border-line rounded-[10px] px-2.5 py-2 text-[13.5px] text-ink outline-none focus:border-ink-soft disabled:opacity-60';
export const LABEL = 'flex flex-col gap-1.5 text-[12.5px] text-ink-muted';
export const LINK = 'text-[13px] font-semibold text-ink underline underline-offset-[3px] decoration-ink-muted hover:decoration-ink disabled:text-ink-muted disabled:no-underline disabled:cursor-not-allowed';
/** A link that ends or removes something. */
export const LINK_BAD = 'self-start text-[13px] font-semibold text-bad underline underline-offset-[3px] decoration-bad disabled:opacity-50';
export const PRIMARY = 'text-[13px] font-semibold rounded-[10px] px-3.5 py-2 bg-pine hover:bg-pine-hover text-white disabled:opacity-50';
export const DANGER = 'text-[13px] font-semibold rounded-[10px] px-3.5 py-2 bg-bad hover:bg-bad/90 text-white disabled:opacity-50';

const svg = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
export const PlusIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...svg}><path d="M12 5v14M5 12h14" /></svg>;
export const PenIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.9" {...svg}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>;
export const ChevIcon = ({ open }: { open?: boolean }) => <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...svg} className={'text-ink-muted transition-transform motion-reduce:transition-none ' + (open ? 'rotate-180' : '')}><path d="m6 9 6 6 6-6" /></svg>;
export const InfoIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.8" {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></svg>;

/** The bare plus at the right of a card's heading. */
export function PlusButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className="w-[30px] h-[30px] grid place-items-center rounded-[9px] text-ink hover:bg-paper"><PlusIcon /></button>;
}
export function PenButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label} title="Edit" className="w-8 h-8 grid place-items-center rounded-[9px] text-ink-muted hover:text-ink hover:bg-paper"><PenIcon /></button>;
}

/** A card's heading row: title, a line under it, and its plus or other control on the right. */
export function CardHead({ title, line, children }: { title: string; line?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 pt-2.5 pb-1.5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {line && <p className="text-[12.5px] text-ink-muted mt-0.5">{line}</p>}
      </div>
      {children}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={'relative inline-block flex-none w-10 h-6 rounded-lg transition-colors motion-reduce:transition-none disabled:opacity-50 ' + (checked ? 'bg-[var(--op-on)]' : 'bg-[var(--op-track)]')}>
      <span className={'absolute left-[3px] top-[3px] w-[18px] h-[18px] rounded-md transition-transform motion-reduce:transition-none ' + (checked ? 'translate-x-4 bg-[var(--op-knob)]' : 'bg-[var(--op-knob-off)]')} />
    </button>
  );
}

/** The one pop-up (ui/Modal: focus kept inside, Escape closes, focus back on the opener). Rendered into the
 *  dashboard's look wrapper (.op-look, which carries the theme) rather than in place: a frosted card's backdrop-filter
 *  makes it the box a `fixed` child is placed in, so a pop-up opened inside a card was clipped to that card. */
export function Popup({ title, onClose, children, dismissable = true }: { title: string; onClose: () => void; children: ReactNode; dismissable?: boolean }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => { setHost(document.querySelector('.op-look') ?? document.body); }, []);
  if (!host) return null;
  return createPortal(
    <Modal title={title} onClose={onClose} dismissable={dismissable} size="lg" pad="px-6 py-6" className="shadow-card"
      titleNode={<h3 className="text-[19px] font-semibold text-ink mb-4">{title}</h3>}>
      <div className="flex flex-col gap-4">{children}</div>
    </Modal>,
    host,
  );
}
/** Cancel on the left as a plain link, the action on the right. */
export function PopupFoot({ onCancel, cancel = 'Cancel', children }: { onCancel: () => void; cancel?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button type="button" onClick={onCancel} className={LINK}>{cancel}</button>
      <span className="flex-1" />
      {children}
    </div>
  );
}
export function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 [&+&]:border-t [&+&]:border-line [&+&]:pt-3.5">
      <div className="text-[12.5px] font-semibold text-ink-soft">{label}</div>
      {children}
    </div>
  );
}

/** A row of choice tiles (one picked). */
export function Tiles<K extends string>({ options, value, onChange, label, disabled }: {
  options: { key: K; title: string; line?: string }[]; value: K; onChange: (k: K) => void; label: string; disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
      {options.map(o => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} disabled={disabled} onClick={() => onChange(o.key)}
          className={'flex gap-2.5 items-start text-left rounded-[12px] border px-3 py-2.5 disabled:opacity-60 ' + (value === o.key ? 'border-ink shadow-[inset_0_0_0_1px_var(--color-ink)]' : 'border-line bg-paper hover:border-ink-soft')}>
          <span className={'mt-0.5 w-[18px] h-[18px] shrink-0 rounded-full border-[1.5px] grid place-items-center ' + (value === o.key ? 'border-ink' : 'border-ink-muted')}>
            {value === o.key && <span className="w-2 h-2 rounded-full bg-ink" />}
          </span>
          <span className="min-w-0"><b className="block text-[13.5px] font-semibold text-ink">{o.title}</b>{o.line && <small className="block text-[12px] text-ink-muted mt-0.5">{o.line}</small>}</span>
        </button>
      ))}
    </div>
  );
}

/** A dollar field: "$" then the number. Blank stays blank (null) where blank means "none". */
export function Money({ value, onChange, label, disabled, blank }: { value: number | null; onChange: (v: number | null) => void; label: string; disabled?: boolean; blank?: boolean }) {
  return (
    <label className="flex items-center gap-1 w-full min-w-0 max-w-[150px] border border-line bg-paper rounded-[10px] px-2.5 focus-within:border-ink-soft">
      <span className="text-ink-muted text-[13.5px]" aria-hidden="true">$</span>
      <span className="sr-only">{label}</span>
      <input type="number" min={0} step="0.01" inputMode="decimal" value={value ?? ''} disabled={disabled}
        onChange={e => onChange(e.target.value === '' ? (blank ? null : 0) : Math.max(0, Number(e.target.value)))}
        className="w-full min-w-0 bg-transparent border-0 outline-none py-2 text-[13.5px] text-ink tabular-nums disabled:opacity-60" />
    </label>
  );
}
