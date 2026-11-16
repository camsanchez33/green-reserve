'use client';
import { CARD } from '@/components/ui/Card';
// REVENUE-1 (approved mockup): Payments — the page's dates, newest day first, each day a header with its count and sum,
// one Filter (how it was paid · what for · where it stands), a search, and a side card per payment with its receipt
// and a refund. Rows are the rounds played (/api/operator/bookings?played=1, as Money's Payments was); pro shop, food and
// event payments join this list when the ledger route returns every payment for a range (agreed with Build).
// Kept from Money: Not paid yet, No-shows and Cancelled (Home's "See them" opens ?show=unpaid), the tee sheet's ?date=
// deep link, the money.refund_rounds refund with a reason the golfer is emailed, the 1,000-round cap note.
import { useState } from 'react';
import Link from 'next/link';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { paymentStatus } from '@/components/dashboard/money/PaymentsPanel';
import type { MoneyBooking } from '@/components/dashboard/money/types';
import { FilterMenu, SideCard, Dl, Dot, Kv, Search, BTN, BTN_GHOST, LINK, INPUT, ROW, ROW_SEL, usd2, dayLong, clock12, useOutside } from './ui';
import type { Range } from './data';

type How = '' | 'card' | 'counter' | 'account';
type What = '' | 'tee' | 'cart';
type Show = 'all' | 'paid' | 'unpaid' | 'noshow' | 'cancelled' | 'refunded';
const HOW: Record<Exclude<How, ''>, string> = { card: 'Card', counter: 'At the counter', account: 'On account' };
const howOf = (b: MoneyBooking): How => b.paymentStatus === 'paid' ? 'card' : b.paymentStatus === 'paid_offline' ? 'counter' : b.paymentStatus === 'on_account' ? 'account' : '';
// The mockup's short statuses on a row; the full words are in the side card.
const SHORT: Record<string, string> = { paid: 'Paid', unpaid: 'Not paid yet', noshow: 'No-show', cancelled: 'Cancelled', refunded: 'Refunded', upcoming: 'Not played yet' };
const share = (b: MoneyBooking) => b.greenFeeTotal + b.cartFeeTotal + b.rangeBallsTotal;
const players = (n: number) => `${n} player${n === 1 ? '' : 's'}`;
const toCents = (v: string) => { const n = Number(v.replace(/[$,\s]/g, '')); return v.trim() !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };

export function PaymentsTab({ bookings, range, rangeLabel, today, clock, dateFilter, onClearDate, initialShow, capped, canRefund, onRefunded }: {
  bookings: MoneyBooking[]; range: Range; rangeLabel: string; today: string; clock: string;
  dateFilter: string; onClearDate: () => void; initialShow: Show; capped: boolean; canRefund: boolean; onRefunded: () => void;
}) {
  const [q, setQ] = useState('');
  const [how, setHow] = useState<How>('');
  const [what, setWhat] = useState<What>('');
  const [show, setShow] = useState<Show>(initialShow);
  const [limit, setLimit] = useState(25);
  const [sel, setSel] = useState<string | null>(null);
  const qq = q.trim().toLowerCase();
  const all = bookings.map(b => ({ b, s: paymentStatus(b, today, clock) }))
    .filter(({ b, s }) => dateFilter ? b.teeTime.date === dateFilter : s.group !== 'upcoming' && b.teeTime.date >= range.from && b.teeTime.date <= range.to)
    .sort((x, y) => (y.b.teeTime.date + y.b.teeTime.time).localeCompare(x.b.teeTime.date + x.b.teeTime.time));
  const shown = all.filter(({ b, s }) => (!qq || b.golferName.toLowerCase().includes(qq) || b.golferEmail.toLowerCase().includes(qq))
    && (!how || howOf(b) === how) && (!what || (what === 'cart' ? b.cartFeeTotal > 0 : true))
    && (show === 'all' || s.group === show));
  const open = shown.find(r => r.b.id === sel) ?? null;
  const days: string[] = [];
  for (const r of shown.slice(0, limit)) if (days[days.length - 1] !== r.b.teeTime.date) days.push(r.b.teeTime.date);
  const n = (k: Show) => k === 'all' ? all.length : all.filter(r => r.s.group === k).length;

  return (
    <div className="flex flex-col gap-3.5">
      {dateFilter && (
        <div className={`${CARD} !rounded-[16px] flex items-center justify-between px-4 py-2.5 text-[13.5px]`}>
          <span className="text-ink">Showing {dayLong(dateFilter)} only</span>
          <button type="button" onClick={onClearDate} className={LINK}>Show every day</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        {!dateFilter && <span className="text-[13.5px] font-semibold text-ink tabular-nums">{rangeLabel}</span>}
        <span className="text-[12.5px] text-ink-muted tabular-nums">{shown.length.toLocaleString('en-US')} payment{shown.length === 1 ? '' : 's'}</span>
        <span className="flex-1" />
        <Search value={q} onChange={v => { setQ(v); setLimit(25); }} label="Find a payment by name" />
        <FilterMenu active={!!how || !!what || show !== 'all'} onPick={k => {
          const [g, v] = k.split(':');
          if (g === 'h') setHow(v as How); else if (g === 'w') setWhat(v as What); else setShow(v as Show);
          setLimit(25);
        }} items={[
          { heading: 'How paid' }, { key: 'h:', label: 'Any way', on: !how },
          ...(Object.keys(HOW) as Exclude<How, ''>[]).map(k => ({ key: `h:${k}`, label: HOW[k], on: how === k })),
          'rule', { heading: 'What for' }, { key: 'w:', label: 'Everything', on: !what }, { key: 'w:tee', label: 'Tee times', on: what === 'tee' }, { key: 'w:cart', label: 'Carts', on: what === 'cart' },
          'rule', { heading: 'Where it stands' },
          ...([['all', 'All'], ['paid', 'Paid'], ['unpaid', 'Not paid yet'], ['noshow', 'No-shows'], ['cancelled', 'Cancelled'], ['refunded', 'Refunded']] as const)
            .map(([k, l]) => ({ key: `s:${k}`, label: l, on: show === k, count: n(k) })),
        ]} />
      </div>
      <div className={'grid gap-4 items-start ' + (open ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : '')}>
        <section className={`${CARD} !rounded-[16px] p-1.5`} aria-label="Payments">
          {shown.length === 0 ? <p className="px-2.5 py-3.5 text-[13.5px] text-ink-muted">{qq || how || what || show !== 'all' ? 'Nothing matches that.' : dateFilter ? `No rounds on ${dayLong(dateFilter)}.` : 'No rounds played in these dates.'}</p> : days.map((day, di) => {
            const dayAll = shown.filter(r => r.b.teeTime.date === day);
            const dayRows = shown.slice(0, limit).filter(r => r.b.teeTime.date === day);
            return (
              <div key={day}>
                <div className={'flex justify-between items-baseline px-3 pb-1.5 text-[13px] font-semibold text-ink ' + (di === 0 ? 'pt-1.5' : 'pt-3 border-t border-line')}>
                  {dayLong(day)}{day === today ? ' · today' : ''}
                  <span className="font-normal text-ink-muted text-[12.5px] tabular-nums">{dayAll.length} payment{dayAll.length === 1 ? '' : 's'} · {usd2(dayAll.reduce((t, r) => t + share(r.b), 0))}</span>
                </div>
                {dayRows.map(({ b, s }) => (
                  <div key={b.id} role="button" tabIndex={0} onClick={() => setSel(sel === b.id ? null : b.id)} onKeyDown={e => { if (e.key === 'Enter') setSel(sel === b.id ? null : b.id); }}
                    className={ROW + ' [&:nth-child(2)]:border-t-0 grid-cols-[58px_minmax(0,1fr)_auto] ' + (open ? 'md:grid-cols-[70px_minmax(0,1fr)_minmax(0,1.2fr)_84px_118px]' : 'md:grid-cols-[70px_minmax(0,1fr)_minmax(0,1.4fr)_88px_128px]') + (sel === b.id ? ROW_SEL : '')}>
                    <span className="tabular-nums text-ink-muted">{clock12(b.teeTime.time)}</span>
                    <span className="truncate font-semibold text-ink">{b.golferName}</span>
                    <span className="truncate text-ink-soft max-md:col-start-2 max-md:col-span-2 max-md:row-start-2">Tee time {clock12(b.teeTime.time)} · {players(b.players)}</span>
                    <span className={'text-right tabular-nums ' + (s.group === 'refunded' || s.group === 'cancelled' ? 'text-ink-muted line-through font-medium' : 'font-semibold text-ink') + ' max-md:col-start-3 max-md:row-start-1'}>{usd2(share(b))}</span>
                    <span className="inline-flex items-center gap-[7px] truncate text-ink max-md:col-start-2 max-md:col-span-2"><Dot tone={s.tone} />{SHORT[s.group]}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {shown.length > limit && <button type="button" onClick={() => setLimit(l => l + 25)} className="w-full text-left px-3 py-[11px] border-t border-line text-[12.5px] font-semibold text-ink-soft underline underline-offset-[3px]">Show {Math.min(25, shown.length - limit)} more of {(shown.length - limit).toLocaleString('en-US')}</button>}
        </section>
        {open && <PaymentDetail key={open.b.id} b={open.b} s={open.s} canRefund={canRefund} onClose={() => setSel(null)} onRefunded={onRefunded} />}
      </div>
      {capped && <p className="text-[12.5px] text-ink-muted">Last 1,000 rounds played.</p>}
    </div>
  );
}

function PaymentDetail({ b, s, canRefund, onClose, onRefunded }: { b: MoneyBooking; s: ReturnType<typeof paymentStatus>; canRefund: boolean; onClose: () => void; onRefunded: () => void }) {
  const [menu, setMenu] = useState(false);
  const menuRef = useOutside<HTMLDivElement>(menu, () => setMenu(false));
  const [refund, setRefund] = useState(false);
  const [amount, setAmount] = useState(''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const paid = ['paid', 'paid_offline', 'on_account'].includes(b.paymentStatus);
  const total = share(b);
  async function receiptBy(via: 'print' | 'email') {
    setMenu(false); setBusy(via); setError('');
    const r = await dfetch<{ url?: string; sentTo?: string }>('/api/operator/bookings', { method: 'PATCH', body: JSON.stringify({ id: b.id, action: 'send_receipt', via }) });
    setBusy('');
    if (!r.ok) { setError(r.error); return; }
    if (via === 'print' && r.data.url) setReceipt(r.data.url.replace('&print=1', ''));
    else toast(`Receipt emailed to ${r.data.sentTo ?? b.golferName}.`, 'ok');
  }
  async function doRefund() {
    if (amount.trim() && toCents(amount) === null) { setError('Enter an amount above $0, or leave it blank for all of it.'); return; }
    if (!reason.trim()) { setError('Add the reason the golfer will see.'); return; }
    setBusy('refund'); setError('');
    const r = await dfetch<{ amountCents: number; emailSent: boolean }>('/api/operator/bookings', { method: 'PATCH', body: JSON.stringify({ id: b.id, action: 'refund_round', reason, ...(amount.trim() ? { amountCents: toCents(amount) } : {}) }) });
    setBusy('');
    if (!r.ok) { setError(r.error); return; }
    setRefund(false);
    toast(`Refunded ${usd2(r.data.amountCents)}.${r.data.emailSent ? ' The golfer was emailed.' : ' The email to the golfer didn’t send.'} Totals update when it settles.`, 'ok');
    onRefunded();
  }
  const how = howOf(b);
  return (
    <SideCard title={b.golferName} sub={`${dayLong(b.teeTime.date)} · ${clock12(b.teeTime.time)}`} onClose={onClose}>
      <Dl rows={[
        ['For', `Tee time ${clock12(b.teeTime.time)} · ${players(b.players)}${b.teeTime.holes ? ` · ${b.teeTime.holes} holes` : ''}`],
        ...(how ? [['How paid', HOW[how]] as [string, string]] : []),
        ['Status', <span key="s" className="inline-flex items-center gap-[7px]"><Dot tone={s.tone} />{s.label}</span>],
      ]} />
      <div className="border-t border-line mb-3">
        <Kv first label={`Green fee × ${b.players}`} value={usd2(b.greenFeeTotal)} />
        {b.cartFeeTotal > 0 && <Kv label="Carts" value={usd2(b.cartFeeTotal)} />}
        {b.rangeBallsTotal > 0 && <Kv label="Range balls" value={usd2(b.rangeBallsTotal)} />}
        <Kv total label="Total" value={usd2(total)} />
      </div>
      <div className="flex flex-wrap items-center gap-2 relative">
        {paid && (
          <div ref={menuRef} className="relative">
            <button type="button" className={BTN_GHOST} aria-expanded={menu} onClick={() => setMenu(m => !m)} disabled={!!busy}>{busy === 'print' || busy === 'email' ? 'Working…' : 'Receipt'}</button>
            {menu && (
              <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-20 flex flex-col p-1.5 min-w-[170px] rounded-[12px] border border-line shadow-card" style={{ backgroundColor: 'var(--op-panel-solid)' }}>
                <button type="button" role="menuitem" onClick={() => receiptBy('print')} className="text-left text-[13.5px] text-ink px-2.5 py-2 rounded-[8px] hover:bg-ink/5">View receipt</button>
                <button type="button" role="menuitem" onClick={() => receiptBy('email')} className="text-left text-[13.5px] text-ink px-2.5 py-2 rounded-[8px] hover:bg-ink/5">Email receipt</button>
              </div>
            )}
          </div>
        )}
        {canRefund && b.paymentStatus === 'paid' && !refund && <button type="button" className={BTN_GHOST} onClick={() => { setRefund(true); setMenu(false); }}>Refund</button>}
        <Link href={`/dashboard?date=${b.teeTime.date}&q=${encodeURIComponent(b.golferName)}`} className={LINK + ' ml-1'}>Open in tee sheet</Link>
      </div>
      {refund && (
        <div className="flex flex-col gap-2 mt-2.5">
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount to refund, blank for all of it" className={INPUT} />
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} aria-label="Reason the golfer will see" className={INPUT} />
          <div className="flex gap-2 items-center">
            <button type="button" className={BTN} disabled={busy === 'refund'} onClick={doRefund}>{busy === 'refund' ? 'Refunding…' : `Refund ${amount.trim() && toCents(amount) !== null ? usd2(toCents(amount)!) : usd2(total)}`}</button>
            <button type="button" className={BTN_GHOST} onClick={() => { setRefund(false); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-[12.5px] text-bad mt-2.5">{error}</p>}
      {receipt && <ReceiptModal url={receipt} onClose={() => setReceipt(null)} onEmail={() => { setReceipt(null); receiptBy('email'); }} />}
    </SideCard>
  );
}

/** The golfer's own receipt page, shown over the dashboard (it keeps the site's light look). */
export function ReceiptModal({ url, onClose, onEmail }: { url: string; onClose: () => void; onEmail?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="Receipt" className="w-[380px] max-w-[calc(100vw-32px)] p-[22px] rounded-[16px] border border-line shadow-card" style={{ backgroundColor: 'var(--op-panel-solid)' }}>
        <iframe src={url} title="Receipt" className="op-keep-light w-full h-[440px] rounded-[10px] bg-white border-0" />
        <div className="flex gap-2 mt-3.5">
          {onEmail && <button type="button" className={BTN} onClick={onEmail}>Email receipt</button>}
          <button type="button" className={BTN_GHOST} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
