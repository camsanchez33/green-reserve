'use client';
// EVENTS-3 (Cam 2026-11-17, "events is good"; lanes/dashboard.md item 3, mockup lanes/dashboard/events-mockup.html):
// the small pieces the Events list and an event's page share — the four numbers joined by hairlines, a thin progress
// bar, a section with its heading and bare plus, a label / value line with a pencil, and the table grid.
// Tokens only (text-ink, border-line, bg-paper…), so Charcoal and Light both get every change. The pop-up, tiles,
// plus and pencil come from the Schedule's ui.tsx so every dashboard pop-up is the same one.
import type { ReactNode } from 'react';
import { PenButton, PlusButton, LINK_BAD } from '@/components/dashboard/schedule/ui';

export const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const usd2 = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
/** Whole days from the course's today to a YYYY-MM-DD day (negative = past). */
export const daysUntil = (today: string, day: string) => Math.round((Date.parse(day + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86_400_000);
export const inDays = (n: number) => n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 1 ? `In ${n} days` : n === -1 ? 'Yesterday' : `${-n} days ago`;

/** The row of numbers at the top: cells joined by hairlines, two across on a phone. */
export function Stats({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-px bg-line border border-line rounded-[14px] overflow-hidden max-md:[&>*:last-child:nth-child(odd)]:col-span-2">
      {children}
    </div>
  );
}
export function Stat({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="bg-white shadow-card rounded-none px-4 py-3.5 flex flex-col gap-1 min-w-0">
      <span className="text-[12.5px] text-ink-muted">{label}</span>
      <b className="text-[15px] md:text-[17px] font-semibold text-ink md:truncate tabular-nums">{value}</b>
      {children}
    </div>
  );
}
export const StatNote = ({ children }: { children: ReactNode }) => <small className="text-[12px] text-ink-muted">{children}</small>;

/** A thin bar: how far along (paid in green). */
export function Bar({ value, of, ok = false }: { value: number; of: number; ok?: boolean }) {
  const p = of > 0 ? Math.min(100, Math.round((value / of) * 100)) : 0;
  return (
    <span className="block h-1.5 rounded-[3px] bg-line mt-1 mb-0.5" aria-hidden="true">
      <i className={'block h-full rounded-[3px] ' + (ok ? 'bg-ok' : 'bg-ink-soft')} style={{ width: p + '%' }} />
    </span>
  );
}

/** A part of the event's page: its heading with an optional bare plus, a hairline above all but the first. */
export function Section({ title, plus, right, children }: { title: ReactNode; plus?: { label: string; onClick: () => void }; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line first:border-t-0 pb-1.5">
      <div className="flex items-center gap-2 px-1 pt-3.5 pb-2 text-[13px] font-semibold text-ink">
        <h2 className="flex items-center gap-2">{title}</h2>
        <span className="flex-1" />
        {right}
        {plus && <PlusButton label={plus.label} onClick={plus.onClick} />}
      </div>
      {children}
    </section>
  );
}

/** A label and its value; with `onEdit`, a pencil at the end (a phone stacks them). */
export function KV({ k, children, onEdit, editLabel, total }: { k?: ReactNode; children: ReactNode; onEdit?: () => void; editLabel?: string; total?: boolean }) {
  return (
    <div className={'grid items-center gap-x-3.5 gap-y-0.5 px-1 py-[7px] text-[13.5px] '
      + (k == null ? (onEdit ? 'grid-cols-[minmax(0,1fr)_32px]' : 'grid-cols-1') : onEdit ? 'grid-cols-[minmax(0,1fr)_32px] md:grid-cols-[150px_minmax(0,1fr)_32px]' : 'grid-cols-1 md:grid-cols-[150px_minmax(0,1fr)]')
      + (total ? ' border-t border-line font-semibold' : '')}>
      {k != null && <span className="text-[12px] md:text-[13.5px] text-ink-muted">{k}</span>}
      <span className={'min-w-0 text-ink ' + (total ? 'font-bold' : 'font-medium') + (k != null && onEdit ? ' max-md:col-start-1' : '')}>{children}</span>
      {onEdit && <span className={k != null ? 'max-md:col-start-2 max-md:row-start-1 max-md:row-span-2' : ''}><PenButton label={editLabel ?? 'Edit'} onClick={onEdit} /></span>}
    </div>
  );
}

/** The Events table: date · event · players · money · status · chevron (a phone keeps date, event and status). */
export const ROW = 'grid grid-cols-[48px_minmax(0,1fr)_auto_16px] md:grid-cols-[52px_minmax(0,1fr)_84px_150px_104px_16px] gap-3 items-center';
export const HEAD = ROW + ' max-md:hidden px-2.5 pb-1.5 text-[12px] text-ink-muted';
export const Chevron = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-ink-muted"><path d="m9 6 6 6-6 6" /></svg>;
export const DownChevron = ({ open }: { open: boolean }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={'transition-transform motion-reduce:transition-none ' + (open ? '' : '-rotate-90')}><path d="m6 9 6 6 6-6" /></svg>;

/** A fold heading (Past events, To do, Checklist): a button that opens and closes what's under it. */
export function Fold({ open, onToggle, children, top = false }: { open: boolean; onToggle: () => void; children: ReactNode; top?: boolean }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      className={'flex-1 w-full flex items-center gap-1.5 text-left px-2.5 py-3 min-h-[44px] text-[13px] ' + (top ? 'font-semibold text-ink' : 'border-t border-line text-ink-soft hover:text-ink')}>
      <DownChevron open={open} />{children}
    </button>
  );
}

const svg = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
export const MailIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.8" {...svg}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
export const PhoneIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.8" {...svg}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>;
export const CopyIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.8" {...svg}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>;
export const OpenIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.9" {...svg}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
export const GroupIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.8" {...svg}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c0-2.5 1.5-4.5 4-4.5" /></svg>;
export const PrintIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.8" {...svg}><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></svg>;
export const SearchIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="2" {...svg}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const CheckIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" strokeWidth="3" {...svg}><path d="m5 12 5 5 9-10" /></svg>;

/** A square icon link or button (email, call, copy, open). */
export const ICON_BTN = 'w-9 h-9 inline-grid place-items-center shrink-0 rounded-[10px] border border-line text-ink-soft hover:text-ink hover:bg-paper';
export const ICON_BTN_SM = 'w-8 h-8 inline-grid place-items-center shrink-0 rounded-[9px] text-ink-soft hover:text-ink hover:bg-paper';
/** A toolbar button: an icon and words (the words hide on a phone). */
export const TOOL = 'inline-flex items-center gap-[7px] h-9 px-3 rounded-[10px] border border-line text-[13px] text-ink hover:bg-paper disabled:opacity-50 [&_svg]:text-ink-soft';
export const FIELD_SM = 'bg-paper border border-line rounded-[10px] px-2.5 py-2 text-[13.5px] text-ink outline-none focus:border-ink-soft disabled:opacity-60';
/** A red link that ends or removes something, sitting in line with what's beside it. */
export const RED_LINK = LINK_BAD.replace('self-start ', '');
