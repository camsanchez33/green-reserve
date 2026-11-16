'use client';
import { CARD } from '@/components/ui/Card';
// REVENUE-1 (Cam 2026-11-15, approved mockup lanes/dashboard/money-mockup.html): the small pieces every part of the
// Revenue page shares — money formatting, the white line icons, the Stripe logo square, the segmented control, the
// Filter menu, a label/value line, and the side card a row opens. Tokens only, so Charcoal and Light both follow.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export const usd2 = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const usd = (c: number) => `${c < 0 ? '−' : ''}$${Math.round(Math.abs(c) / 100).toLocaleString('en-US')}`;
export const usdk = (c: number) => c >= 100_000 ? `$${(c / 100_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : `$${Math.round(c / 100)}`;

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const at = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`);
/** "Thu, Nov 12" */
export const dayLong = (d: string) => { const x = at(d); return `${WD[x.getUTCDay()]}, ${MO[x.getUTCMonth()]} ${x.getUTCDate()}`; };
/** "Nov 12" */
export const dayShort = (d: string) => { const x = at(d); return `${MO[x.getUTCMonth()]} ${x.getUTCDate()}`; };
export const dowOf = (d: string) => at(d).getUTCDay();
/** "8:10 AM" from "08:10" or minutes. */
export const clock12 = (t: string | number) => {
  const m = typeof t === 'number' ? t : Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
export const addDays = (d: string, n: number) => { const x = at(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const spanDays = (from: string, to: string) => Math.round((at(to).getTime() - at(from).getTime()) / 86_400_000) + 1;

const svg = (d: ReactNode, w = 1.9) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-[19px] h-[19px]">{d}</svg>
);
export const Icon = {
  x: svg(<path d="M6 6l12 12M18 6 6 18" />, 2),
  filter: svg(<path d="M4 5h16l-6.2 7.6V18l-3.6 2v-7.4z" />),
  download: svg(<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />),
  calendar: svg(<><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>),
  refresh: svg(<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5" />),
  chevron: svg(<path d="m9 6 6 6-6 6" />),
  check: svg(<path d="m5 12.5 4.5 4.5L19 7.5" />, 2.2),
  info: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></>, 1.8),
};

/** A bare white icon button (the mockup's .yib); a dot marks a filter that is on. */
export function IconButton({ label, onClick, children, dot, expanded, className = '' }: { label: string; onClick?: () => void; children: ReactNode; dot?: boolean; expanded?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-expanded={expanded}
      className={'relative w-[34px] h-[34px] flex-none grid place-items-center rounded-[8px] text-ink hover:bg-ink/5 ' + className}>
      {children}
      {dot && <span className="absolute right-[5px] top-[5px] w-1.5 h-1.5 rounded-full bg-current" />}
    </button>
  );
}

const STRIPE_PATH = 'M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z';
/** Lane decision (Cam 2026-11-15): both Stripe buttons are the small Stripe logo square, white mark on Stripe's purple. */
export function StripeSquare({ label, onClick, busy }: { label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} aria-label={label} title={label}
      className="w-[30px] h-[30px] flex-none grid place-items-center rounded-[7px] bg-stripe hover:opacity-90 disabled:opacity-60">
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" className="text-white"><path fill="currentColor" d={STRIPE_PATH} /></svg>
    </button>
  );
}

/** The segmented control (7 days · 30 days · This month; By day · Day of week · Time of day). */
export function Seg<K extends string>({ value, options, onChange, label, small }: { value: K | null; options: readonly (readonly [K, string])[]; onChange: (k: K) => void; label: string; small?: boolean }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 p-[3px] rounded-[11px] bg-ink/5 border border-line">
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={(small ? 'text-[12.5px] px-3 py-[5px] ' : 'text-[13px] px-3.5 py-1.5 ') + 'rounded-[8px] whitespace-nowrap transition-colors ' +
            (value === k ? 'bg-white shadow-card text-ink font-semibold' : 'text-ink-soft font-medium hover:text-ink')}>{l}</button>
      ))}
    </div>
  );
}

/** Closes when you click anywhere else. */
export function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [open, close]);
  return ref;
}

export type MenuItem = { key: string; label: string; on: boolean; count?: number } | { heading: string } | 'rule';
/** One Filter button with its menu (no chip rows). */
export function FilterMenu({ items, onPick, active, align = 'right' }: { items: MenuItem[]; onPick: (key: string) => void; active: boolean; align?: 'right' | 'left' }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <IconButton label="Filter" onClick={() => setOpen(o => !o)} dot={active} expanded={open}>{Icon.filter}</IconButton>
      {open && (
        <div role="menu" className={'absolute top-[calc(100%+6px)] z-20 flex flex-col p-1.5 min-w-[210px] rounded-[12px] bg-white shadow-card border border-line ' + (align === 'right' ? 'right-0' : 'left-0')}
          style={{ backgroundColor: 'var(--op-panel-solid)' }}>
          {items.map((it, i) => it === 'rule' ? <hr key={i} className="border-0 border-t border-line my-1 mx-0.5" />
            : 'heading' in it ? <div key={i} className="text-[12px] text-ink-muted px-2.5 pt-2 pb-0.5">{it.heading}</div>
            : (
              <button key={it.key} type="button" role="menuitemradio" aria-checked={it.on} onClick={() => { onPick(it.key); setOpen(false); }}
                className={'flex justify-between gap-4 text-left text-[13.5px] text-ink px-2.5 py-2 rounded-[8px] hover:bg-ink/5 ' + (it.on ? 'bg-ink/5 font-semibold' : '')}>
                <span>{it.label}</span>{it.count !== undefined && <span className="text-ink-muted tabular-nums font-normal">{it.count}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** A label and an amount on one ruled line (the mockup's .ykv). */
export function Kv({ label, note, value, pct, total, indent, tone, first }: { label: ReactNode; note?: string; value: string; pct?: string; total?: boolean; indent?: boolean; tone?: 'bad'; first?: boolean }) {
  return (
    <div className={'flex justify-between items-baseline gap-3 py-2 text-[13.5px] tabular-nums ' + (first ? '' : total ? 'border-t border-ink-soft ' : 'border-t border-line ') + (total ? 'font-semibold' : '')}>
      <span className={tone === 'bad' ? 'text-bad' : total ? 'text-ink' : indent ? 'pl-3.5 text-ink-muted' : 'text-ink-soft'}>{label}{note && <small className="text-ink-muted text-[12px] ml-1.5 font-normal">{note}</small>}</span>
      <b className={(tone === 'bad' ? 'text-bad ' : '') + (indent ? 'font-medium text-ink-soft' : total ? 'font-semibold text-ink' : 'font-semibold text-ink')}>
        {pct && <span className="text-ink-muted font-normal mr-3 text-[12.5px]">{pct}</span>}{value}
      </b>
    </div>
  );
}

/** The side card a row opens: a close X, a title and a line under it. */
export function SideCard({ title, sub, onClose, children }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <section className={`${CARD} !rounded-[16px] relative px-[18px] py-4 xl:sticky xl:top-4`} aria-label="Details">
      <IconButton label="Close" onClick={onClose} className="!absolute right-2 top-2">{Icon.x}</IconButton>
      <h3 className="mr-9 mb-0.5 text-[17px] font-semibold text-ink">{title}</h3>
      {sub && <p className="text-[12.5px] text-ink-muted mb-3 tabular-nums">{sub}</p>}
      {children}
    </section>
  );
}

/** Term and value pairs in a detail card. */
export function Dl({ rows }: { rows: [string, ReactNode, ('bad' | 'warn')?][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13.5px] mb-3">
      {rows.map(([t, d, tone]) => <div key={t} className="contents"><dt className="text-ink-muted">{t}</dt><dd className={'tabular-nums min-w-0 [overflow-wrap:anywhere] ' + (tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink')}>{d}</dd></div>)}
    </dl>
  );
}

/** A row's status: a dot and words. */
export function Dot({ tone }: { tone: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  const c = tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : tone === 'bad' ? 'bg-bad' : 'bg-ink-muted';
  return <span aria-hidden="true" className={'inline-block w-1.5 h-1.5 rounded-full flex-none ' + c} />;
}

export const BTN = 'text-[13px] font-semibold rounded-[10px] px-3.5 py-[9px] bg-ink text-page hover:opacity-90 disabled:opacity-40';
export const BTN_GHOST = 'text-[13px] font-semibold rounded-[10px] px-3.5 py-[9px] text-ink-soft border border-line hover:text-ink hover:bg-ink/5 disabled:opacity-40';
export const LINK = 'text-[12.5px] font-semibold text-ink underline underline-offset-[3px] decoration-ink-muted hover:decoration-ink';
export const INPUT = 'w-full text-[13.5px] text-ink bg-ink/5 border border-line rounded-[10px] px-[11px] py-[9px] outline-none focus:border-ink-soft';
/** A list row (the mockup's .yrow): hover lift, the open one raised. */
export const ROW = 'grid items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13.5px] min-w-0 cursor-pointer hover:bg-ink/5 border-t border-line first:border-t-0';
export const ROW_SEL = ' !bg-ink/10';

/** The search box, no placeholder words. */
export function Search({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="op-well flex items-center gap-2 h-[38px] flex-[0_1_240px] max-md:flex-auto bg-ink/5 border border-line rounded-[10px] px-[11px] text-ink-muted">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input value={value} onChange={e => onChange(e.target.value)} aria-label={label} className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13.5px] text-ink py-2" />
    </label>
  );
}
