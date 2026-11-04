'use client';
// LEDGER-2 (Cam 2026-10-30: "Days, then the rows"): Money → Ledger. One line per day —
// card, cash and other money in, money given back, net, GreenReserve's part — and a dot
// for whether the card money matches what Stripe recorded that day. A day opens its
// movements, each linked to its booking, sale, member or event. CSV for the bookkeeper.
// Data: /api/operator/money/ledger (lib/ledger-view.ts).
import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { LoadError } from '@/components/dashboard/LoadError';
import DateRangeButton, { type DateRange } from '@/components/dashboard/DateRangeButton';
import { dfetch } from '@/lib/dashboard-fetch';
import type { LedgerDay, LedgerRow, Earned, PaidOut } from '@/lib/ledger-view';
import { EARNED_TERMS, PAID_OUT_TERMS, EARNED_TITLE, PAID_OUT_TITLE, LEDGER_UI } from '@/lib/earned-terms';

type Days = { range: DateRange; today: string; days: LedgerDay[]; stripeRead: boolean; stripeConnected: boolean; tz: string; earned: Earned | null; paidOut: PaidOut | null };
/** EARNED-1: the day rows can be narrowed to one kind of money and one way of paying. */
type Filter = { what: string; method: string };

const usd2 = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dash = (c: number) => (c ? usd2(c) : '—');
const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

const MATCH: Record<LedgerDay['match'], { status: 'ok' | 'bad' | 'neutral'; label: string }> = {
  ok: { status: 'ok', label: 'Matches Stripe' },
  off: { status: 'bad', label: 'Differs from Stripe' },
  none: { status: 'neutral', label: 'No card money' },
  unknown: { status: 'neutral', label: 'Stripe not checked' },
};

export function LedgerPanel() {
  const [data, setData] = useState<Days | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, LedgerRow[] | { error: string }>>({});
  const [filter, setFilter] = useState<Filter>({ what: '', method: '' });

  const load = useCallback(async (r: DateRange | null) => {
    setLoading(true); setError('');
    const res = await dfetch<Days>(`/api/operator/money/ledger${r ? `?from=${r.from}&to=${r.to}` : ''}`);
    setLoading(false);
    if (!res.ok) { setError(res.error); return; }
    setData(res.data); setRange(res.data.range); setRows({}); setOpen(null);
  }, []);
  useEffect(() => { load(null); }, [load]);

  const fetchDay = async (day: string) => {
    setRows(prev => { const n = { ...prev }; delete n[day]; return n; });
    const res = await dfetch<{ rows: LedgerRow[] }>(`/api/operator/money/ledger?day=${day}`);
    setRows(prev => ({ ...prev, [day]: res.ok ? res.data.rows : { error: res.error } }));
  };
  const openDay = (day: string) => {
    if (open === day) { setOpen(null); return; }
    setOpen(day);
    // EARNED-1: a filter is for the day it was picked on.
    setFilter({ what: '', method: '' });
    if (!rows[day] || 'error' in rows[day]) fetchDay(day);
  };

  if (!data) return error ? <LoadError message={`Couldn't load the ledger — ${error}`} onRetry={() => load(range)} />
    : <div className="py-16 text-center text-ink-muted">Loading…</div>;

  const t = data.days.reduce((a, d) => ({ card: a.card + d.cardInCents, cash: a.cash + d.cashInCents, other: a.other + d.otherInCents, out: a.out + d.outCents, net: a.net + d.netCents, gr: a.gr + d.platformCents }), { card: 0, cash: 0, other: 0, out: 0, net: 0, gr: 0 });
  const off = data.days.filter(d => d.match === 'off').length;
  const fees = data.days.reduce((n, d) => n + (d.stripeFeeCents ?? 0), 0);
  const e = data.earned, p = data.paidOut;
  // A label, its value, and (on the total line) a top rule.
  const line = (label: string, cents: number | null, opts: { minus?: boolean; total?: boolean; note?: string; title?: string } = {}) => (
    <div className={'flex items-baseline justify-between gap-4 py-1.5 ' + (opts.total ? 'border-t border-line mt-1 pt-2 font-semibold text-ink' : '')}>
      <span className={opts.total ? '' : 'text-ink-soft'} title={opts.title}>{label}{opts.note && <span className="text-ink-muted font-normal"> · {opts.note}</span>}</span>
      <span className="tabular-nums">{cents === null ? '—' : opts.minus ? usd2(-cents) : usd2(cents)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {error && <LoadError message={`Couldn't load the ledger — ${error}`} onRetry={() => load(range)} />}
      <div className="flex flex-wrap items-center gap-3">
        {range && <DateRangeButton value={range} today={data.today} onChange={r => { setRange(r); load(r); }} />}
        {loading && <span className="text-[13px] text-ink-muted">Loading…</span>}
        {range && <a href={`/api/operator/money/ledger?format=csv&from=${range.from}&to=${range.to}`} className="ml-auto text-[13px] font-medium text-pine hover:underline underline-offset-4">Download CSV</a>}
      </div>
      {/* EARNED-1 (Cam 2026-11-04, "earned vs paid out"): what the course earned in these days, beside what reached it. */}
      {e && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="px-5 py-4 text-[13.5px]">
            <h3 className="text-[15px] font-semibold text-ink mb-1">{EARNED_TITLE}</h3>
            {EARNED_TERMS.map(t => <Fragment key={t.key}>{line(t.label, e[t.key], { minus: t.minus, total: t.total, title: t.def })}</Fragment>)}
          </Card>
          {p && (
            <Card className="px-5 py-4 text-[13.5px]">
              <h3 className="text-[15px] font-semibold text-ink mb-1">{PAID_OUT_TITLE}</h3>
              {PAID_OUT_TERMS.map(t => <Fragment key={t.key}>{line(t.label, p[t.key], { title: t.def, note: t.key === 'payoutsCents' && p.payoutsCents !== null ? `${p.payoutCount} ${p.payoutCount === 1 ? LEDGER_UI.payout : LEDGER_UI.payouts}` : undefined })}</Fragment>)}
            </Card>
          )}
        </div>
      )}
      {!data.stripeRead && <p className="text-[13px] text-ink-muted">{data.stripeConnected ? 'Stripe couldn’t be read — try again in a minute.' : 'Stripe isn’t connected.'}</p>}
      {off > 0 && <p className="text-[13px] text-bad">{off} {off === 1 ? 'day differs' : 'days differ'} from Stripe.</p>}

      <Card className="overflow-x-auto">
        <table className="w-full text-[13.5px] tabular-nums">
          <thead>
            <tr className="text-left text-[12.5px] text-ink-muted border-b border-line-soft">
              <th className="px-4 py-2.5 font-medium">Day</th>
              <th className="px-3 py-2.5 font-medium text-right">Card</th>
              <th className="px-3 py-2.5 font-medium text-right">Cash</th>
              <th className="px-3 py-2.5 font-medium text-right">Check or other</th>
              <th className="px-3 py-2.5 font-medium text-right">Given back</th>
              <th className="px-3 py-2.5 font-medium text-right">Net</th>
              <th className="px-3 py-2.5 font-medium text-right" title="GreenReserve's fees taken, less any given back">GreenReserve</th>
              <th className="px-3 py-2.5 font-medium text-right" title={LEDGER_UI.feeColumnDef}>{LEDGER_UI.feeColumn}</th>
              <th className="px-4 py-2.5 font-medium">Stripe</th>
            </tr>
          </thead>
          <tbody>
            {data.days.map(d => {
              const m = MATCH[d.match];
              const r = rows[d.day];
              return (
                <Fragment key={d.day}>
                  <tr onClick={() => d.moves && openDay(d.day)} className={'border-b border-line-soft ' + (d.moves ? 'cursor-pointer hover:bg-paper/70' : 'text-ink-muted')}>
                    <td className="px-4 py-2.5 text-ink">
                      <button type="button" disabled={!d.moves} aria-expanded={open === d.day} className="text-left disabled:cursor-default">{fmtDay(d.day)}</button>
                    </td>
                    <td className="px-3 py-2.5 text-right">{dash(d.cardInCents)}</td>
                    <td className="px-3 py-2.5 text-right">{dash(d.cashInCents)}</td>
                    <td className="px-3 py-2.5 text-right">{dash(d.otherInCents)}</td>
                    <td className="px-3 py-2.5 text-right">{d.outCents ? `−${usd2(d.outCents)}` : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink">{dash(d.netCents)}</td>
                    <td className="px-3 py-2.5 text-right text-ink-muted">{dash(d.platformCents)}</td>
                    <td className="px-3 py-2.5 text-right text-ink-muted">{d.stripeFeeCents === null ? '—' : dash(d.stripeFeeCents)}</td>
                    <td className="px-4 py-2.5"><StatusDot status={m.status} label={d.match === 'off' && d.stripeNetCents !== null ? `Stripe ${usd2(d.stripeNetCents)}` : m.label} /></td>
                  </tr>
                  {open === d.day && (
                    <tr className="border-b border-line-soft bg-paper/70">
                      <td colSpan={9} className="px-4 py-3">
                        {!r ? <div className="text-ink-muted">Loading…</div>
                          : 'error' in r ? <LoadError message={`Couldn't load this day — ${r.error}`} onRetry={() => fetchDay(d.day)} />
                          : <DayRows rows={r} tz={data.tz} filter={filter} onFilter={setFilter} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-ink border-t border-ink/70">
              <td className="px-4 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right">{dash(t.card)}</td>
              <td className="px-3 py-2.5 text-right">{dash(t.cash)}</td>
              <td className="px-3 py-2.5 text-right">{dash(t.other)}</td>
              <td className="px-3 py-2.5 text-right">{t.out ? `−${usd2(t.out)}` : '—'}</td>
              <td className="px-3 py-2.5 text-right">{dash(t.net)}</td>
              <td className="px-3 py-2.5 text-right text-ink-muted">{dash(t.gr)}</td>
              <td className="px-3 py-2.5 text-right text-ink-muted">{data.days.some(d => d.stripeFeeCents === null) ? '—' : dash(fees)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}

function DayRows({ rows, tz, filter, onFilter }: { rows: LedgerRow[]; tz: string; filter: Filter; onFilter: (f: Filter) => void }) {
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const [openId, setOpenId] = useState<string | null>(null);
  const kinds = [...new Map(rows.map(r => [r.what, r.label])).entries()];
  const methods = [...new Map(rows.map(r => [r.method, r.methodLabel])).entries()];
  const shown = rows.filter(r => (!filter.what || r.what === filter.what) && (!filter.method || r.method === filter.method));
  const sel = 'bg-white border border-line rounded-md px-2 py-1 text-[13px] text-ink';
  return (
    <div>
      {(kinds.length > 1 || methods.length > 1) && (
        <div className="flex flex-wrap gap-2 mb-2" onClick={e => e.stopPropagation()}>
          <select aria-label={LEDGER_UI.what} value={filter.what} onChange={e => onFilter({ ...filter, what: e.target.value })} className={sel}>
            <option value="">{LEDGER_UI.everything}</option>
            {kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select aria-label={LEDGER_UI.how} value={filter.method} onChange={e => onFilter({ ...filter, method: e.target.value })} className={sel}>
            <option value="">{LEDGER_UI.anyWay}</option>
            {methods.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      )}
    <ul className="divide-y divide-line-soft">
      {shown.length === 0 && <li className="py-1.5 text-[13px] text-ink-muted">{LEDGER_UI.none}</li>}
      {shown.map(r => {
        const out = r.direction === 'out';
        return (
          <Fragment key={r.id}>
          <li onClick={e => { e.stopPropagation(); setOpenId(openId === r.id ? null : r.id); }} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-[13px] cursor-pointer">
            <button type="button" aria-expanded={openId === r.id} aria-label={`${r.label} ${usd2(r.amountCents)}`} onClick={e => { e.stopPropagation(); setOpenId(openId === r.id ? null : r.id); }}
              className="w-4 text-ink-muted rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-pine/40"><span aria-hidden="true">{openId === r.id ? '▾' : '▸'}</span></button>
            <span className="w-16 text-ink-muted tabular-nums">{time(r.at)}</span>
            <span className="text-ink">{r.label}{out ? ' · given back' : ''}</span>
            <span className="text-ink-muted">{r.methodLabel}{r.account === 'platform' ? ' · GreenReserve' : ''}</span>
            {r.who && (r.href ? <Link href={r.href} onClick={e => e.stopPropagation()} className="text-pine hover:underline underline-offset-4">{r.who}</Link> : <span className="text-ink">{r.who}</span>)}
            {r.note && <span className="text-ink-muted truncate max-w-[18rem]">{r.note}</span>}
            <span className={'ml-auto tabular-nums font-medium ' + (out ? 'text-bad' : 'text-ink')}>{out ? '−' : ''}{usd2(r.amountCents)}</span>
          </li>
          {/* EARNED-1: one payment's detail — where it went, GreenReserve's part, who did it, Stripe's id. */}
          {openId === r.id && (
            <li className="pb-2 pl-[6rem] grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[12.5px]">
              <span className="text-ink-muted">{LEDGER_UI.account}</span><span className="text-ink">{r.account === 'platform' ? 'GreenReserve' : LEDGER_UI.course}</span>
              <span className="text-ink-muted">{LEDGER_UI.grPart}</span><span className="text-ink tabular-nums">{usd2(r.platformFeeCents)}</span>
              <span className="text-ink-muted">{LEDGER_UI.by}</span><span className="text-ink">{r.actor}</span>
              {r.stripeId && <><span className="text-ink-muted">{LEDGER_UI.stripe}</span><span className="text-ink font-mono break-all">{r.stripeId}</span></>}
            </li>
          )}
          </Fragment>
        );
      })}
    </ul>
    </div>
  );
}
