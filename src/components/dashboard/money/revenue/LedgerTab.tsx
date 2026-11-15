'use client';
import { CARD } from '@/components/ui/Card';
// REVENUE-1 (approved mockup): Ledger — Totals beside Paid out for the page's dates, whether every day matches Stripe,
// then one line a day; a day opens its movements with a Filter and a side card. From /api/operator/money/ledger
// (LEDGER-2, EARNED-1), read-only. "Net revenue", never "profit". The GreenReserve booking fee is golfers' money, never
// course revenue: it is taken out of Card and shown once, muted, under Totals (lane decision, Cam 2026-11-15).
// Which payments a Stripe difference comes from is Build's (?day= mismatch); until it is sent the day shows the two totals.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { methodLabel } from '@/lib/ledger-view';
import { FilterMenu, SideCard, Dl, Dot, Kv, IconButton, Icon, ROW, ROW_SEL, usd2, dayLong } from './ui';
import type { LedgerDays, RevenueLedgerDay, RevenueLedgerRow, Range, Mismatch } from './data';

const card = (d: RevenueLedgerDay) => d.cardInCents + d.otherInCents - d.platformCents;
const net = (d: RevenueLedgerDay) => d.netCents - d.platformCents;
const diffOf = (d: RevenueLedgerDay) => d.stripeNetCents === null ? 0 : d.courseCardNetCents - d.stripeNetCents;
const tz = (iso: string, zone: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' });

function MatchCell({ d, onOpen }: { d: RevenueLedgerDay; onOpen: () => void }) {
  if (d.match === 'off') {
    const g = diffOf(d);
    return <button type="button" onClick={e => { e.stopPropagation(); onOpen(); }} className="inline-flex items-center gap-[7px] text-[13px] font-semibold text-bad underline underline-offset-[3px]"><Dot tone="bad" />Stripe {usd2(Math.abs(g))} {g > 0 ? 'less' : 'more'}</button>;
  }
  if (d.match === 'ok') return <span className="inline-flex items-center gap-[7px] text-ok font-medium"><Dot tone="ok" />Matches Stripe</span>;
  if (d.match === 'none') return <span className="text-ink-muted">No card payments</span>;
  return <span className="text-ink-muted">Not checked</span>;
}

export function LedgerTab({ range, rangeLabel }: { range: Range; rangeLabel: string }) {
  const [data, setData] = useState<LedgerDays | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError('');
    const r = await dfetch<LedgerDays>(`/api/operator/money/ledger?from=${range.from}&to=${range.to}`);
    if (mine !== seq.current) return;
    setLoading(false);
    if (r.ok) setData(r.data); else setError(r.error);
  }, [range.from, range.to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (day && (day < range.from || day > range.to)) setDay(null); }, [day, range.from, range.to]);

  if (!data) return error ? <LoadError message={`Couldn't load the ledger — ${error}`} onRetry={load} /> : <p className="py-12 text-center text-[13px] text-ink-muted">Loading…</p>;
  const d0 = data.days.find(x => x.day === day);
  if (d0) return <LedgerDay d={d0} zone={data.tz} onBack={() => setDay(null)} />;

  const days = data.days;
  const sum = (f: (d: RevenueLedgerDay) => number) => days.reduce((n, d) => n + f(d), 0);
  const T = { card: sum(card), cash: sum(d => d.cashInCents), refunds: sum(d => d.outCents), net: sum(net), gr: sum(d => d.platformCents) };
  const revenue = T.card + T.cash;
  const fees = days.some(d => d.stripeFeeCents === null) ? null : sum(d => d.stripeFeeCents ?? 0);
  const after = fees === null ? null : T.net - fees;
  const p = data.paidOut;
  const paidOut = p && p.payoutsCents !== null && p.inStripeCents !== null ? p.payoutsCents + p.inStripeCents + p.cashCents : null;
  const gap = paidOut !== null && after !== null ? paidOut - after : null;
  const off = days.filter(d => d.match === 'off');
  const csv = `/api/operator/money/ledger?format=csv&from=${range.from}&to=${range.to}`;

  return (
    <div className="flex flex-col gap-3.5">
      {error && <LoadError message={`Couldn't load the ledger — ${error}`} onRetry={load} />}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[13.5px] font-semibold text-ink tabular-nums">{rangeLabel}</span>
        {loading && <span className="text-[12.5px] text-ink-muted">Loading…</span>}
        <span className="flex-1" />
        <IconButton label="Check against Stripe again" onClick={load}>{Icon.refresh}</IconButton>
        <a href={csv} aria-label="Download CSV" title="Download CSV" className="w-[34px] h-[34px] grid place-items-center rounded-[8px] text-ink hover:bg-ink/5">{Icon.download}</a>
      </div>
      <section className={`${CARD} !rounded-[16px] px-5 py-4 grid lg:grid-cols-2 gap-x-10`} aria-label="Totals">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink mb-1">Totals</h3>
          <Kv first label="Revenue" value={usd2(revenue)} />
          <Kv indent label="Card" value={usd2(T.card)} />
          <Kv indent label="Cash" value={usd2(T.cash)} />
          <Kv label="Refunds" value={T.refunds ? `−${usd2(T.refunds)}` : '—'} />
          <Kv total label="Net revenue" value={usd2(T.net)} />
          <Kv label="Stripe fees" value={fees === null ? 'Not read' : `−${usd2(fees)}`} />
          <Kv total label="Net revenue after fees" value={after === null ? '—' : usd2(after)} />
        </div>
        {p && (
          <div className="min-w-0 max-lg:mt-4">
            <h3 className="text-[15px] font-semibold text-ink mb-1">Paid out</h3>
            <Kv first label="Stripe payouts that arrived" value={p.payoutsCents === null ? '—' : usd2(p.payoutsCents)} />
            <Kv label="Pending Stripe payouts" note="on its way and ready to pay out" value={p.inStripeCents === null ? '—' : usd2(p.inStripeCents)} />
            <Kv label="Cash from the register" value={usd2(p.cashCents)} />
            <Kv total label="Paid out" value={paidOut === null ? '—' : usd2(paidOut)} />
            {gap !== null && (gap === 0
              ? <div className="flex items-center justify-end gap-2 pt-2 text-[13px] font-semibold text-ok"><span className="w-4 h-4 inline-grid [&>svg]:w-4 [&>svg]:h-4">{Icon.check}</span>Matches net revenue after fees</div>
              : <div className="flex items-center justify-end gap-2 pt-2 text-[13px] font-semibold text-bad"><Dot tone="bad" />{usd2(Math.abs(gap))} {gap < 0 ? 'less' : 'more'} than net revenue after fees</div>)}
          </div>
        )}
        <p className="lg:col-span-2 border-t border-line mt-3 pt-2.5 text-[12.5px] text-ink-muted tabular-nums">GreenReserve processing fee (paid by golfers, not from your revenue): {usd2(T.gr)}</p>
      </section>
      <p className="text-[13px] m-0">
        {!data.stripeRead ? <span className="text-ink-muted">{data.stripeConnected ? 'Stripe couldn’t be read. Try again in a minute.' : 'Stripe isn’t connected.'}</span>
          : off.length > 0 ? <button type="button" onClick={() => setDay(off[0].day)} className="inline-flex items-center gap-[7px] font-semibold text-bad underline underline-offset-[3px]"><Dot tone="bad" />{off.length === 1 ? `1 day differs from Stripe: ${dayLong(off[0].day)}` : `${off.length} days differ from Stripe`}</button>
          : <span className="inline-flex items-center gap-[7px] text-ok font-medium"><Dot tone="ok" />Every day matches Stripe</span>}
      </p>
      <section className={`${CARD} !rounded-[16px] overflow-x-auto px-1.5 py-1`} aria-label="Days">
        <table className="w-full text-[13.5px] tabular-nums text-ink">
          <thead><tr className="text-[12.5px] text-ink-muted">
            {['Day', 'Card', 'Cash', 'Refunds', 'Net revenue', 'Stripe fees', 'Stripe match'].map((h, i) => <th key={h} className={'font-medium px-2.5 py-2.5 border-b border-line whitespace-nowrap ' + (i === 0 ? 'text-left pl-3.5' : i === 6 ? 'text-left' : 'text-right')}>{h}</th>)}
          </tr></thead>
          <tbody>
            {days.map(d => (
              <tr key={d.day} onClick={() => setDay(d.day)} className="cursor-pointer hover:bg-ink/5">
                <td className="text-left pl-3.5 px-2.5 py-[9px] border-b border-line whitespace-nowrap">{dayLong(d.day)}{d.day === data.today ? ' · today' : ''}</td>
                <td className="text-right px-2.5 py-[9px] border-b border-line">{usd2(card(d))}</td>
                <td className="text-right px-2.5 py-[9px] border-b border-line">{usd2(d.cashInCents)}</td>
                <td className="text-right px-2.5 py-[9px] border-b border-line">{d.outCents ? `−${usd2(d.outCents)}` : '—'}</td>
                <td className="text-right px-2.5 py-[9px] border-b border-line font-semibold">{usd2(net(d))}</td>
                <td className="text-right px-2.5 py-[9px] border-b border-line text-ink-muted">{d.stripeFeeCents === null ? '—' : usd2(d.stripeFeeCents)}</td>
                <td className="text-left px-2.5 py-[9px] border-b border-line whitespace-nowrap"><MatchCell d={d} onOpen={() => setDay(d.day)} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-semibold">
            <td className="text-left pl-3.5 px-2.5 py-[9px] border-t border-ink-soft">Total</td>
            <td className="text-right px-2.5 py-[9px] border-t border-ink-soft">{usd2(T.card)}</td>
            <td className="text-right px-2.5 py-[9px] border-t border-ink-soft">{usd2(T.cash)}</td>
            <td className="text-right px-2.5 py-[9px] border-t border-ink-soft">{T.refunds ? `−${usd2(T.refunds)}` : '—'}</td>
            <td className="text-right px-2.5 py-[9px] border-t border-ink-soft">{usd2(T.net)}</td>
            <td className="text-right px-2.5 py-[9px] border-t border-ink-soft text-ink-muted">{fees === null ? '—' : usd2(fees)}</td>
            <td className="border-t border-ink-soft" />
          </tr></tfoot>
        </table>
      </section>
    </div>
  );
}

const HOWS = ['card', 'card_present', 'cash', 'other'] as const;
function LedgerDay({ d, zone, onBack }: { d: RevenueLedgerDay; zone: string; onBack: () => void }) {
  const [rows, setRows] = useState<RevenueLedgerRow[] | null>(null);
  const [mm, setMm] = useState<Mismatch | null>(null);
  // false: Stripe couldn't be read for the detail — said so, never read as "matches".
  const [mmRead, setMmRead] = useState(true);
  const [error, setError] = useState('');
  const [how, setHow] = useState(''), [what, setWhat] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError('');
    // The detail reads Stripe, so it is asked for only on a day that differs.
    const r = await dfetch<{ rows: RevenueLedgerRow[]; mismatch?: Mismatch | null; mismatchRead?: boolean }>(`/api/operator/money/ledger?day=${d.day}${d.match === 'off' ? '&mismatch=1' : ''}`);
    if (r.ok) { setRows(r.data.rows); setMm(r.data.mismatch ?? null); setMmRead(r.data.mismatchRead !== false); } else setError(r.error);
  }, [d.day, d.match]);
  useEffect(() => { load(); }, [load]);
  // GreenReserve's own booking fee is golfers' money on GreenReserve's account, not the course's (lane decision).
  const mine = (rows ?? []).filter(r => r.account !== 'platform');
  const kinds = [...new Map(mine.map(r => [r.what, r.label])).entries()];
  const shown = mine.filter(r => (!how || r.method === how) && (!what || r.what === what)).slice().reverse();
  const open = shown.find(r => r.id === sel) ?? null;
  // Build's mismatch (?day= only): Stripe's side payment by payment. diffCents = stripeCents − ourCents.
  const g = mm ? -mm.diffCents : diffOf(d);
  // A line names Stripe's object and the payment it belongs to (for a refund, the original payment).
  const flagged = new Map((mm?.payments ?? []).flatMap(x => [[x.stripeId, x], ...(x.paymentStripeId ? [[x.paymentStripeId, x]] : [])] as [string, Mismatch['payments'][number]][]));
  const flagOf = (r: RevenueLedgerRow) => (r.stripeId ? flagged.get(r.stripeId) : undefined) ?? null;
  const rowGrid = open ? 'md:grid-cols-[70px_minmax(0,1fr)_minmax(0,1.2fr)_84px_118px]' : 'md:grid-cols-[70px_minmax(0,1fr)_minmax(0,1.4fr)_88px_128px]';
  const row = (r: RevenueLedgerRow) => (
    <div key={r.id} role="button" tabIndex={0} onClick={() => setSel(sel === r.id ? null : r.id)} onKeyDown={e => { if (e.key === 'Enter') setSel(sel === r.id ? null : r.id); }}
      className={ROW + ' grid-cols-[58px_minmax(0,1fr)_auto] ' + rowGrid + (sel === r.id ? ROW_SEL : '') + (flagOf(r) ? ' shadow-[inset_3px_0_0_var(--color-bad)]' : '')}>
      <span className="tabular-nums text-ink-muted">{tz(r.at, zone)}</span>
      <span className="truncate font-semibold text-ink">{r.who || r.label}</span>
      <span className="truncate text-ink-soft max-md:hidden">{r.label}{r.note ? ` · ${r.note}` : ''}</span>
      <span className="text-right tabular-nums font-semibold text-ink">{r.direction === 'out' ? '−' : ''}{usd2(r.amountCents)}</span>
      <span className="inline-flex items-center gap-[7px] truncate text-ink max-md:hidden"><Dot tone={flagOf(r) ? 'bad' : r.direction === 'out' ? 'neutral' : 'ok'} />{flagOf(r) ? 'Stripe differs' : r.direction === 'out' ? 'Refunded' : r.methodLabel}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-3.5">
      <button type="button" onClick={onBack} className="self-start text-[13.5px] font-semibold text-ink-muted hover:text-ink">‹ Ledger</button>
      <div className="flex flex-wrap items-center gap-2.5">
        <h3 className="text-[17px] font-semibold text-ink">{dayLong(d.day)}</h3>
        <span className="text-[12.5px] text-ink-muted tabular-nums">Card {usd2(card(d))} · Cash {usd2(d.cashInCents)} · Refunds {d.outCents ? `−${usd2(d.outCents)}` : '—'} · Net revenue {usd2(net(d))}</span>
        <span className="flex-1" />
        <FilterMenu active={!!how || !!what} onPick={k => { const [gk, v] = k.split(':'); if (gk === 'h') setHow(v); else setWhat(v); setSel(null); }} items={[
          { heading: 'How paid' }, { key: 'h:', label: 'Any way', on: !how }, ...HOWS.map(m => ({ key: `h:${m}`, label: methodLabel(m), on: how === m })),
          'rule', { heading: 'What for' }, { key: 'w:', label: 'Everything', on: !what }, ...kinds.map(([k, l]) => ({ key: `w:${k}`, label: l, on: what === k })),
        ]} />
      </div>
      {d.match === 'off' && (
        <section className={`${CARD} !rounded-[16px] px-5 py-4 shadow-[inset_3px_0_0_var(--color-bad)]`} aria-label="Differs from Stripe">
          <h3 className="text-[15px] font-semibold text-bad">Differs from Stripe by {usd2(Math.abs(g))}</h3>
          <div className="grid md:grid-cols-3 gap-3 mt-2.5 mb-3">
            <div><div className="text-[13px] text-ink-muted">Our total</div><div className="text-[22px] font-semibold tabular-nums text-ink">{usd2(mm ? mm.ourCents : d.courseCardNetCents)}</div><div className="text-[12.5px] text-ink-muted">card, less refunds</div></div>
            <div><div className="text-[13px] text-ink-muted">Stripe’s total</div><div className="text-[22px] font-semibold tabular-nums text-ink">{usd2(mm ? mm.stripeCents : d.stripeNetCents ?? 0)}</div><div className="text-[12.5px] text-ink-muted">card money Stripe recorded this day</div></div>
            <div><div className="text-[13px] text-ink-muted">Difference</div><div className="text-[22px] font-semibold tabular-nums text-bad">{g > 0 ? '−' : '+'}{usd2(Math.abs(g))}</div>{mm && mm.payments.length > 0 && mm.payments.every(x => x.kind === 'refund_in_stripe') && <div className="text-[12.5px] text-ink-muted">a refund made in Stripe directly</div>}</div>
          </div>
          {!mmRead && <p className="text-[13px] text-ink-muted">Couldn&apos;t check with Stripe which payments differ. Try again in a minute.</p>}
          {mm && mm.payments.length > 0 && (<>
            <div className="text-[13px] text-ink-muted mb-1">Payments involved</div>
            <div className="flex flex-col">{mm.payments.map(x => (
              <div key={x.stripeId + x.kind} className={ROW + ' cursor-default grid-cols-[58px_minmax(0,1fr)_auto] md:grid-cols-[70px_minmax(0,1fr)_minmax(0,1.4fr)_88px_128px] shadow-[inset_3px_0_0_var(--color-bad)]'}>
                <span className="tabular-nums text-ink-muted">{tz(x.at, zone)}</span>
                <span className="truncate font-semibold text-ink">{x.href ? <Link href={x.href} className="hover:underline underline-offset-[3px]">{x.who}</Link> : x.who}</span>
                <span className="truncate text-ink-soft max-md:hidden">{x.note}</span>
                <span className="text-right tabular-nums font-semibold text-ink">{usd2(x.ourCents ?? x.stripeCents ?? 0)}</span>
                <span className="inline-flex items-center gap-[7px] text-ink max-md:hidden"><Dot tone="bad" />Stripe differs</span>
              </div>))}
            </div>
          </>)}
        </section>
      )}
      {error && <LoadError message={`Couldn't load this day — ${error}`} onRetry={load} />}
      <div className={'grid gap-4 items-start ' + (open ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : '')}>
        <section className={`${CARD} !rounded-[16px] p-1.5`} aria-label="Payments this day">
          {!rows ? <p className="px-2.5 py-3.5 text-[13.5px] text-ink-muted">{error ? '' : 'Loading…'}</p> : shown.length ? shown.map(row) : <p className="px-2.5 py-3.5 text-[13.5px] text-ink-muted">None.</p>}
        </section>
        {open && (
          <SideCard title={open.who || open.label} sub={`${dayLong(d.day)} · ${tz(open.at, zone)}`} onClose={() => setSel(null)}>
            <Dl rows={[
              ['For', open.label + (open.note ? ` · ${open.note}` : '')],
              ['How paid', open.methodLabel],
              ['In or out', open.direction === 'out' ? 'Money given back' : 'Money in'],
              ['By', open.actor],
              ...(open.stripeId ? [['Stripe', <span key="s" className="font-mono text-[12.5px]">{open.stripeId}</span>] as [string, ReactNode]] : []),
            ]} />
            <div className="border-t border-line mb-3"><Kv first total label={open.direction === 'out' ? 'Given back' : 'Amount'} value={usd2(open.amountCents)} /></div>
            {flagOf(open) && <p className="text-[12.5px] text-bad mb-3">{flagOf(open)!.note}</p>}
            {open.href && <Link href={open.href} className="text-[12.5px] font-semibold text-ink underline underline-offset-[3px]">Open</Link>}
          </SideCard>
        )}
      </div>
    </div>
  );
}
