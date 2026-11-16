'use client';
import { CARD } from '@/components/ui/Card';
// REVENUE-1 (approved mockup): Payouts — ready to pay out → on its way → in your bank, then every payout in the page's
// dates with a side card. From Stripe (/api/operator/stripe/payouts). A course without Stripe connected gets the
// connect card as before (SD-8; connecting is the owner's alone, R-AUTH-007). What each payout was made of (its card
// payments, refunds and fees) is not something any route returns yet, so the side card shows when and where.
import { useState } from 'react';
import { PayoutsPanel } from '@/components/dashboard/money/PayoutsPanel';
import type { MoneyCourse } from '@/components/dashboard/money/types';
import { SideCard, Dl, Dot, StripeSquare, Icon, ROW, ROW_SEL, usd2, dayLong } from './ui';
import { PAYOUT_STATUS, type PayoutsData, type Range } from './data';

const arrival = (iso: string) => iso.slice(0, 10);
const sentDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA');

export function PayoutsTab({ data, error, course, stripeParam, onConnected, canConnect, range, rangeLabel, onOpenStripe, openingStripe }: {
  data: PayoutsData | null; error: string; course: MoneyCourse; stripeParam: string | null; onConnected: () => void; canConnect: boolean;
  range: Range; rangeLabel: string; onOpenStripe?: () => void; openingStripe: boolean;
}) {
  const [sel, setSel] = useState<string | null>(null);
  if (!course.stripeAccountActive || (data && !data.connected)) return <PayoutsPanel course={course} stripeParam={stripeParam} onConnected={onConnected} canConnect={canConnect} />;
  if (error) return <p className="text-[13.5px] text-bad">Couldn&apos;t read your payouts from Stripe. {error}</p>;
  if (!data) return <p className="py-12 text-center text-[13px] text-ink-muted">Loading your payouts from Stripe…</p>;
  const ready = data.balance ? data.balance.availableCents + data.balance.pendingCents : null;
  const onWay = data.payouts.filter(p => p.status === 'in_transit' || p.status === 'pending');
  const next = data.next ?? onWay[0] ?? null;
  const inBank = data.payouts.filter(p => p.status === 'paid' && arrival(p.arrivalDate) >= range.from && arrival(p.arrivalDate) <= range.to);
  const latest = inBank.slice().sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate))[0];
  const rows = data.payouts.filter(p => onWay.includes(p) || (arrival(p.arrivalDate) >= range.from && arrival(p.arrivalDate) <= range.to))
    .sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate));
  const open = rows.find(p => p.id === sel) ?? null;
  const arr = <div aria-hidden="true" className="grid place-items-center text-ink-muted max-lg:rotate-90 max-lg:h-6 [&>svg]:w-[18px] [&>svg]:h-[18px]">{Icon.chevron}</div>;
  const step = (n: number, l: string) => <div className="flex items-center gap-2 text-[13px] font-semibold text-ink"><i className="not-italic w-5 h-5 rounded-full border border-line grid place-items-center text-[11px] text-ink-muted">{n}</i>{l}</div>;
  return (
    <div className="flex flex-col gap-3.5">
      {stripeParam === 'success' && <p className="inline-flex items-center gap-2 text-[13.5px] text-ok"><Dot tone="ok" />Stripe is connected. Card payments go straight to your bank account.</p>}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_28px_minmax(0,1fr)] items-stretch">
        <div className={`${CARD} !rounded-[16px] px-[18px] py-4 flex flex-col gap-0.5 min-w-0`}>
          {step(1, 'Ready to pay out')}
          <div className="text-[22px] font-semibold tabular-nums text-ink">{ready === null ? '—' : usd2(ready)}</div>
          <div className="text-[12.5px] text-ink-muted">Goes out in the next payouts</div>
        </div>{arr}
        <div className={`${CARD} !rounded-[16px] px-[18px] py-4 flex flex-col gap-0.5 min-w-0`}>
          {step(2, 'On its way')}
          <div className="text-[22px] font-semibold tabular-nums text-ink">{usd2(onWay.reduce((n, p) => n + p.amountCents, 0))}</div>
          <div className="text-[12.5px] text-ink-muted tabular-nums">{next ? `Sent ${dayLong(sentDay(next.createdAt))} · arrives ${dayLong(next.arrivalDate)}` : 'None on its way'}</div>
        </div>{arr}
        <div className={`${CARD} !rounded-[16px] px-[18px] py-4 flex flex-col gap-0.5 min-w-0`}>
          {step(3, 'In your bank')}
          <div className="text-[22px] font-semibold tabular-nums text-ink">{usd2(inBank.reduce((n, p) => n + p.amountCents, 0))}</div>
          <div className="text-[12.5px] text-ink-muted tabular-nums">{latest ? `${inBank.length} payout${inBank.length === 1 ? '' : 's'} · latest arrived ${dayLong(latest.arrivalDate)}` : 'None in these dates'}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-0.5 -mb-1.5">
        <h3 className="text-[15px] font-semibold text-ink">Every payout</h3>
        <span className="text-[12.5px] text-ink-muted tabular-nums ml-1.5">{rangeLabel}</span>
        <span className="flex-1" />
        {onOpenStripe && <StripeSquare label="Open payouts in Stripe" onClick={onOpenStripe} busy={openingStripe} />}
      </div>
      <div className={'grid gap-4 items-start ' + (open ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : '')}>
        <section className={`${CARD} !rounded-[16px] p-1.5`} aria-label="Every payout">
          {rows.length === 0 ? <p className="px-2.5 py-3.5 text-[13.5px] text-ink-muted">{data.payouts.length ? 'No payouts for these dates yet.' : 'No payouts yet. The first comes a few days after your first card payment.'}</p>
            : rows.map(p => { const s = PAYOUT_STATUS[p.status] ?? { label: p.status, tone: 'neutral' as const }; return (
              <div key={p.id} role="button" tabIndex={0} onClick={() => setSel(sel === p.id ? null : p.id)} onKeyDown={e => { if (e.key === 'Enter') setSel(sel === p.id ? null : p.id); }}
                className={ROW + ' grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_110px_130px_minmax(0,1fr)]' + (sel === p.id ? ROW_SEL : '')}>
                <span className="truncate font-semibold text-ink">{s.label === 'On its way' ? 'Arrives ' : ''}{dayLong(p.arrivalDate)}</span>
                <span className="text-right tabular-nums font-semibold text-ink">{usd2(p.amountCents)}{p.currency !== 'usd' ? ` ${p.currency.toUpperCase()}` : ''}</span>
                <span className="inline-flex items-center gap-[7px] text-ink max-md:col-span-2"><Dot tone={s.tone} />{s.label}</span>
                <span className="truncate tabular-nums text-ink-muted max-md:hidden">{p.failureMessage ? <b className="text-bad font-semibold">{p.failureMessage}</b> : `Sent ${dayLong(sentDay(p.createdAt))}`}</span>
              </div>); })}
        </section>
        {open && (() => { const s = PAYOUT_STATUS[open.status] ?? { label: open.status, tone: 'neutral' as const }; return (
          <SideCard title={usd2(open.amountCents)} sub={`${s.label}${open.status === 'paid' ? ' · arrived ' : open.status === 'failed' || open.status === 'canceled' ? ' · was due ' : ' · arrives '}${dayLong(open.arrivalDate)}`} onClose={() => setSel(null)}>
            <Dl rows={[
              ['Sent', dayLong(sentDay(open.createdAt))],
              [open.status === 'paid' ? 'Arrived' : 'Arrives', dayLong(open.arrivalDate)],
              ['Status', <span key="s" className="inline-flex items-center gap-[7px]"><Dot tone={s.tone} />{s.label}</span>],
              ...(open.failureMessage ? [['Why', open.failureMessage, 'bad'] as [string, string, 'bad']] : []),
            ]} />
            {onOpenStripe && (
              <button type="button" onClick={onOpenStripe} disabled={openingStripe} className="inline-flex items-center gap-1.5 rounded-[10px] bg-stripe hover:opacity-90 text-white text-[13.5px] font-semibold px-3.5 py-2 disabled:opacity-60">
                {openingStripe ? 'Opening…' : <>Open in Stripe <span aria-hidden="true">↗</span></>}
              </button>
            )}
          </SideCard>); })()}
      </div>
    </div>
  );
}
