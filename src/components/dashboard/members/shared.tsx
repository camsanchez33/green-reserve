'use client';
// Memberships (Cam 2026-11-16, lanes/dashboard/members-mockup.html): the types, wording and small pieces the
// Memberships page, a membership's page, the member card, Add a member and the setup share.
// Fields marked "Build" arrive with the Memberships data PRs; until a response carries one, the part that
// shows it stays hidden (never faked).
import React, { useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';

export interface Tier {
  id: string; name: string; color: string;
  greenFeeWeekday: number | null; greenFeeWeekend: number | null;
  cartFeeWeekday: number | null; cartFeeWeekend: number | null;
  discountPct: number | null;
  advanceBookingDays: number; guestPassesPerYear: number; guestsPayMemberRate?: boolean; joinOnline?: string; autoRenew?: boolean; autoRenewRetry?: boolean;
  accountOn?: boolean; accountLimitCents?: number | null; accountLimit?: string | null; accountSettle?: string;
  annualFee: number; initiationFee: number; termMonths: number;
  notes: string; active: boolean;
  _count?: { memberships: number };
  /** Build (Memberships data 1): dues paid this calendar year, the number Revenue shows as Membership dues. */
  duesThisYearCents?: number | null;
}
export interface Member {
  id: string; name: string; email: string; phone: string;
  tierId: string | null; tierName: string; tierColor: string;
  status: string; linked: boolean; inviteAccepted: boolean;
  expiresAt: string | null; notes: string; createdAt: string;
  paymentStatus?: string; lastPaidAt?: string | null; annualFee?: number; initiationFee?: number;
  /** YYYY-MM-DD of their latest checked-in round here, or null. */
  lastRound?: string | null;
  /** Imported members already belong: no joining fee in what they owe. */
  initiationWaived?: boolean;
  autoRenew?: boolean;
  startedAt?: string | null;
  /** DENSE-5: checked-in rounds here since Jan 1 (course's timezone). */
  roundsThisYear?: number;
  /** DENSE-5: what those rounds paid the course — null without money.payments. */
  spendThisYearCents?: number | null;
  /** Build (Memberships data 2): the member's number and photo. */
  memberNumber?: string | null;
  photoUrl?: string | null;
}

export type DuesKind = 'comped' | 'unpaid' | 'expired' | 'renewing' | 'paid' | 'inactive';
export type Dues = { kind: DuesKind; label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' };

export const usd0 = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`;
/** Dollars (the tiers wire) as "$1,450" — cents only when there are some ("$12.50"), as the mockup shows prices. */
export const dollars = (d: number) => `$${d.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(d) ? 0 : 2, maximumFractionDigits: 2 })}`;
/** A dues status: the dot carries the colour, the words stay plain (the mockup). */
export const DuesText = ({ d }: { d: Dues }) => (
  <span className="inline-flex items-center gap-[7px] min-w-0"><span aria-hidden="true" className={'w-1.5 h-1.5 rounded-full shrink-0 ' + ({ ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', neutral: 'bg-ink-muted' } as const)[d.tone]} /><span className="truncate">{d.label}</span></span>
);
const asDate = (d: string) => new Date(d.length === 10 ? d + 'T12:00:00' : d);
export const monthYear = (d: string) => asDate(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
/** "Oct 31" this year, "Oct 31, 2025" otherwise. */
export const shortDate = (d: string) => { const t = asDate(d); return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(t.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) }); };
export const longDate = (d: string) => asDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const sinceYear = (m: Member) => asDate(m.startedAt ?? m.createdAt).getFullYear();
export const addMonthsISO = (months: number) => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); };

/** What a membership costs, as one line: "$1,450 a year · $500 to join". */
export function priceLine(t: Pick<Tier, 'annualFee' | 'termMonths' | 'initiationFee'>) {
  const every = t.termMonths === 12 ? 'a year' : `every ${t.termMonths} months`;
  const fee = t.annualFee > 0 ? `${dollars(t.annualFee)} ${every}` : 'No dues';
  return fee + (t.initiationFee > 0 ? ` · ${dollars(t.initiationFee)} to join` : '');
}
export const JOIN_LABEL: Record<string, string> = { off: 'Staff add members', instant: 'Join online', request: 'Request to join' };
/** The member list and the card show members, not golfers part-way through joining online. */
export const isJoining = (m: Member) => m.status === 'requested' || m.status === 'awaiting_payment';

export const LINK = 'text-[13px] font-semibold text-ink underline underline-offset-[3px] decoration-ink-muted hover:decoration-ink disabled:opacity-50';
export const LINK_BAD = 'text-[13px] font-semibold text-bad underline underline-offset-[3px] decoration-bad disabled:opacity-50';
export const PRIMARY = 'bg-pine hover:bg-pine-hover text-white rounded-[10px] text-[13px] font-semibold px-3.5 py-[9px] disabled:opacity-40';

export const PlusIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>;
export const ChevronIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-ink-muted"><path d="m9 6 6 6-6 6"/></svg>;
export const Dot = ({ color, big = false }: { color: string; big?: boolean }) => <span aria-hidden="true" className={'inline-block rounded-full shrink-0 ' + (big ? 'w-3 h-3' : 'w-2.5 h-2.5')} style={{ background: color }} />;

/** A heading row inside a card with an optional bare plus on the right. */
export function CardHead({ title, plus }: { title: string; plus?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {plus && <button type="button" onClick={plus.onClick} aria-label={plus.label} title={plus.label} className="w-[30px] h-[30px] grid place-items-center rounded-[9px] text-ink hover:bg-ink/5"><PlusIcon /></button>}
    </div>
  );
}

/** A number on top of a page. */
export function Tile({ label, value, tone = 'text-ink', title }: { label: string; value: string; tone?: string; title?: string }) {
  return <Card className="px-4 py-3.5"><div className="text-[13px] text-ink-muted" title={title}>{label}</div><div className={'text-[22px] font-semibold tabular-nums leading-tight ' + tone}>{value}</div></Card>;
}

/** One label / value line (the Details and Dues boxes). */
export function KV({ k, v, first = false, total = false }: { k: React.ReactNode; v: React.ReactNode; first?: boolean; total?: boolean }) {
  return (
    <div className={'flex justify-between items-baseline gap-3 py-2 text-[13.5px] tabular-nums ' + (first ? '' : total ? 'border-t border-ink-soft font-semibold' : 'border-t border-line')}>
      <span className={'min-w-0 ' + (total ? 'text-ink' : 'text-ink-soft')}>{k}</span><b className="font-semibold text-ink text-right">{v}</b>
    </div>
  );
}
export const SubHead = ({ children }: { children: React.ReactNode }) => <div className="text-[12px] font-semibold text-ink-muted mt-3 mb-0.5">{children}</div>;

/** A pop-up window: the panel stays solid over the page (glass rule), Escape and the backdrop close it. */
export function Popup({ label, onClose, children, wide = false }: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  // Focus moves into the pop-up when it opens (unless a field took it) and goes back where it was when it closes.
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
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <Card ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className={'outline-none w-full my-auto flex flex-col gap-4 px-5 sm:px-[26px] py-6 text-ink ' + (wide ? 'max-w-[560px]' : 'max-w-[520px]')}>
        {children}
      </Card>
    </div>
  );
}

/** Radio tiles (the setup's choices). */
export function Tiles<T extends string>({ value, options, onChange, labelledBy }: { value: T; options: [T, string][]; onChange: (v: T) => void; labelledBy: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid gap-2 grid-cols-1 sm:grid-cols-3">
      {options.map(([v, l]) => {
        const on = v === value;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
            className={'flex items-center gap-3 px-3 py-[11px] min-h-[46px] rounded-[12px] border bg-ink/5 text-left ' + (on ? 'border-ink' : 'border-line hover:border-ink-muted')}>
            <i aria-hidden="true" className={'shrink-0 w-[18px] h-[18px] rounded-full ' + (on ? 'border-[5px] border-ink' : 'border-[1.5px] border-ink-muted')} />
            <b className="text-[13.5px] font-semibold truncate">{l}</b>
          </button>
        );
      })}
    </div>
  );
}

/** "Step 2 of 4 · Joining" and the bar under it. */
export function StepBar({ labels, at }: { labels: string[]; at: number }) {
  return (
    <div className="flex flex-col gap-2 -mt-1.5">
      <div className="flex gap-2.5 items-baseline text-[12.5px] text-ink-muted"><span>Step {at + 1} of {labels.length}</span><b className="text-[13.5px] font-semibold text-ink">{labels[at]}</b></div>
      <div className="flex gap-1.5" aria-hidden="true">{labels.map((l, i) => <i key={l} className={'flex-1 h-[3px] rounded-sm ' + (i <= at ? 'bg-ink' : 'bg-line')} />)}</div>
    </div>
  );
}

export const Label = ({ children, htmlFor, id }: { children: React.ReactNode; htmlFor?: string; id?: string }) => <label id={id} htmlFor={htmlFor} className="block text-[12.5px] text-ink-muted mb-1.5">{children}</label>;
export const Hint = ({ children }: { children: React.ReactNode }) => <p className="text-[12px] text-ink-muted">{children}</p>;

/** A dollar amount field. */
export function Money({ value, onChange, id, label, small = false }: { value: string | number | null | undefined; onChange: (v: string) => void; id?: string; label?: string; small?: boolean }) {
  return (
    <div className={'flex items-center gap-1.5 bg-paper border border-line rounded-md pl-3 pr-2 ' + (small ? 'w-[100px]' : 'w-[160px]')}>
      <span className="text-ink-muted text-sm">$</span>
      <input id={id} aria-label={label} inputMode="decimal" value={value ?? ''} onChange={e => onChange(e.target.value)} className="w-full bg-transparent py-2.5 text-sm text-ink outline-none tabular-nums" />
    </div>
  );
}
