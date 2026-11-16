'use client';
import { CARD } from '@/components/ui/Card';
// REVENUE-1 (approved mockup): Cancellations — the policy on top with Change (Settings at the policy), then the
// cancellations made in the page's dates with a search, one Filter (fee charged or not) and a side card. History only:
// cancelling is done on the tee sheet. A kept late fee can be given back (sheet.waive_fee) with a reason the golfer is
// emailed — the same PATCH as before (waive_late_fee); the route decides what may go back.
import { useState } from 'react';
import Link from 'next/link';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { NO_FEE_LABEL } from '@/lib/no-fee-labels';
import type { MoneyBooking, MoneyCourse } from '@/components/dashboard/money/types';
import { FilterMenu, SideCard, Dl, Dot, Search, Icon, BTN, BTN_GHOST, LINK, INPUT, ROW, ROW_SEL, usd, usd2, dayLong, dayShort, clock12 } from './ui';
import type { Range } from './data';

const localDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
const localClock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
// "$10 fee charged" (the mockup); cents only when there are some.
const whole = (c: number) => c % 100 === 0 ? usd(c) : usd2(c);
const kept = (b: MoneyBooking) => b.paymentStatus === 'cancellation_fee_charged' || !!b.noShowFeeKeptCents;
function ahead(b: MoneyBooking) {
  if (!b.cancelledAt) return null;
  const h = (Date.parse(`${b.teeTime.date}T${b.teeTime.time.slice(0, 5)}:00`) - Date.parse(b.cancelledAt)) / 3_600_000; // browser-local; a label, not a rule
  if (!Number.isFinite(h)) return null;
  if (h < 0) return 'after the tee time';
  if (h < 48) return `${Math.max(1, Math.round(h))} hour${Math.round(h) === 1 ? '' : 's'} before`;
  return `${Math.round(h / 24)} days before`;
}
function fee(b: MoneyBooking): { tone: 'warn' | 'bad' | 'neutral' | null; label: string } {
  if (b.noShowFeeKeptCents) return { tone: 'warn', label: `${whole(b.noShowFeeKeptCents)} no-show fee kept` };
  if (b.paymentStatus === 'cancellation_fee_charged') return { tone: 'warn', label: `${whole(b.cancellationFeeTotal)} fee charged` };
  if (b.paymentStatus === 'refunded') return { tone: 'neutral', label: 'Fee refunded' };
  if (b.noFeeReason === 'charge_failed') return { tone: 'bad', label: 'Fee declined' };
  return { tone: null, label: 'No fee' };
}

export function CancellationsTab({ bookings, course, range, rangeLabel, initialQuery, canWaive, onRefunded }: {
  bookings: MoneyBooking[]; course: MoneyCourse; range: Range; rangeLabel: string; initialQuery: string; canWaive: boolean; onRefunded: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [f, setF] = useState<'all' | 'fee' | 'nofee'>('all');
  const [sel, setSel] = useState<string | null>(null);
  const qq = q.trim().toLowerCase();
  const inRange = bookings.filter(b => b.status === 'cancelled' && (!qq || b.golferName.toLowerCase().includes(qq) || b.golferEmail.toLowerCase().includes(qq))
    && (!!qq || (() => { const d = localDay(b.cancelledAt ?? b.createdAt); return d >= range.from && d <= range.to; })()))
    .sort((a, b) => (b.cancelledAt ?? b.createdAt).localeCompare(a.cancelledAt ?? a.createdAt));
  const rows = f === 'all' ? inRange : inRange.filter(b => (f === 'fee') === kept(b));
  const open = rows.find(b => b.id === sel) ?? null;
  const policy = `Your policy: free until ${course.cancellationHours} hours before the tee time${course.lateCancellationFee > 0 ? `, then a ${usd2(Math.round(course.lateCancellationFee * 100))} fee` : ', no late fee'}.`;
  return (
    <div className="flex flex-col gap-3.5">
      <p className="flex items-center gap-2 text-[13px] text-ink-muted [&>svg]:w-[15px] [&>svg]:h-[15px]">
        <span className="w-[15px] h-[15px] inline-grid [&>svg]:w-[15px] [&>svg]:h-[15px]">{Icon.info}</span>
        <span>{policy}</span>
        <Link href="/dashboard/settings?section=Prices+%26+fees&focus=cancellation-policy" className={LINK + ' text-ink-soft'}>Change</Link>
      </p>
      {course.lateCancellationFee > 0 && !course.stripeAccountActive && <p className="inline-flex items-center gap-2 text-[13px] text-warn"><Dot tone="warn" />The late fee needs Stripe connected (Payouts tab).</p>}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[13.5px] font-semibold text-ink tabular-nums">{rangeLabel}</span>
        <span className="flex-1" />
        <Search value={q} onChange={setQ} label="Find a golfer" />
        <FilterMenu active={f !== 'all'} onPick={k => { setF(k as typeof f); setSel(null); }} items={[
          { key: 'all', label: 'All', on: f === 'all', count: inRange.length },
          { key: 'fee', label: 'Fee charged', on: f === 'fee', count: inRange.filter(kept).length },
          { key: 'nofee', label: 'No fee charged', on: f === 'nofee', count: inRange.filter(b => !kept(b)).length },
        ]} />
      </div>
      <div className={'grid gap-4 items-start ' + (open ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : '')}>
        <section className={`${CARD} !rounded-[16px] p-1.5`} aria-label="Cancellations">
          {rows.length === 0 ? <p className="px-2.5 py-3.5 text-[13.5px] text-ink-muted">{qq ? 'Nobody matches that.' : 'No cancellations in these dates.'}</p> : rows.map(b => { const x = fee(b); return (
            <div key={b.id} role="button" tabIndex={0} onClick={() => setSel(sel === b.id ? null : b.id)} onKeyDown={e => { if (e.key === 'Enter') setSel(sel === b.id ? null : b.id); }}
              className={ROW + ' grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_64px_118px_176px_122px]' + (sel === b.id ? ROW_SEL : '')}>
              <span className="truncate font-semibold text-ink">{b.golferName}</span>
              <span className="tabular-nums text-ink-muted max-md:hidden">{b.players} player{b.players === 1 ? '' : 's'}</span>
              <span className="truncate text-ink-soft max-md:hidden">{dayShort(b.teeTime.date)} · {clock12(b.teeTime.time)}</span>
              <span className="truncate tabular-nums text-ink-muted max-md:hidden">{b.cancelledAt ? `Cancelled ${dayShort(localDay(b.cancelledAt))} · ${localClock(b.cancelledAt)}` : ''}</span>
              <span className={'inline-flex items-center gap-[7px] truncate ' + (x.tone ? 'text-ink' : 'text-ink-muted')}>{x.tone && <Dot tone={x.tone} />}{x.label}</span>
            </div>); })}
        </section>
        {open && <CancelDetail key={open.id} b={open} canWaive={canWaive} onClose={() => setSel(null)} onRefunded={onRefunded} />}
      </div>
    </div>
  );
}

function CancelDetail({ b, canWaive, onClose, onRefunded }: { b: MoneyBooking; canWaive: boolean; onClose: () => void; onRefunded: () => void }) {
  const [give, setGive] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const x = fee(b), a = ahead(b);
  async function doGive() {
    if (!reason.trim()) { setError('Add the reason the golfer will see.'); return; }
    setBusy(true); setError('');
    const r = await dfetch<{ amountCents: number; emailSent: boolean }>('/api/operator/bookings', { method: 'PATCH', body: JSON.stringify({ id: b.id, action: 'waive_late_fee', reason }) });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setGive(false);
    toast(`Refunded ${usd2(r.data.amountCents)}.${r.data.emailSent ? ` ${b.golferName} was emailed.` : ' The email to the golfer didn’t send.'}`, 'ok');
    onRefunded();
  }
  return (
    <SideCard title={b.golferName} sub={`${dayLong(b.teeTime.date)} · ${clock12(b.teeTime.time)}`} onClose={onClose}>
      <Dl rows={[
        ['Players', String(b.players)],
        ...(b.cancelledAt ? [['Cancelled', `${dayShort(localDay(b.cancelledAt))} · ${localClock(b.cancelledAt)}${a ? ` · ${a}` : ''}`] as [string, string]] : []),
        ['Fee', <span key="f" className="inline-flex items-center gap-[7px]">{x.tone && <Dot tone={x.tone} />}{x.label}</span>],
        ...(!kept(b) && b.noFeeReason ? [['Why no fee', NO_FEE_LABEL[b.noFeeReason]] as [string, string]] : []),
      ]} />
      {canWaive && b.paymentStatus === 'cancellation_fee_charged' && !give && <button type="button" className={BTN_GHOST} onClick={() => setGive(true)}>Refund fee</button>}
      {b.noFeeReason === 'charge_failed' && <p className="text-[12.5px] text-ink-muted">Still owed. The card was declined when the fee was charged.</p>}
      {give && (
        <div className="flex flex-col gap-2 mt-2.5">
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} aria-label="Reason the golfer will see" className={INPUT} />
          <div className="flex gap-2 items-center">
            <button type="button" className={BTN} disabled={busy} onClick={doGive}>{busy ? 'Refunding…' : `Refund ${usd2(b.cancellationFeeTotal)}`}</button>
            <button type="button" className={BTN_GHOST} onClick={() => { setGive(false); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-[12.5px] text-bad mt-2.5">{error}</p>}
    </SideCard>
  );
}
