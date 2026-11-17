'use client';
// ANALYTICS-5 (Cam 2026-11-17, "analytics is good to go"; approved mockup lanes/dashboard/analytics-mockup.html,
// lanes/dashboard.md "Next" 5). A snapshot of the last month, worded in the past tense, with the period beside the
// title. The header icons (dates, download) are bare. Four numbers on the page against the 30 days before; the one
// picked is charted. Then the sliding tabs: Tee sheet, Bookings, Golfers, No-shows, Pro shop, Reviews. Each number
// appears in one place; money lives on Revenue, and every money figure here is the ledger's (the Revenue page's own
// /api/operator/money/sales `all`), never computeAnalytics' money sums, so the two pages can't disagree.
// Kept from AN-1/AN-3: owner-or-"See analytics" only, a refusal explains itself, a failed load says so with Retry,
// only the newest request writes. Build's new data (projections, no-shows by how they booked, spots filled again,
// stock value, written reports, the Filter) shows when the routes send it — see components/dashboard/analytics/data.ts.
import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import OperatorSidebar from '@/components/OperatorSidebar';
import { SlidingTabs } from '@/components/dashboard/SlidingTabs';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import { Card } from '@/components/ui/Card';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { Icon, IconButton, useOutside } from '@/components/dashboard/money/revenue/ui';
import { Head, type Metric } from '@/components/dashboard/analytics/Head';
import { TeeSheetTab, BookingsTab, GolfersTab, NoShowsTab, ReviewsTab, teeSheetCsv, bookingsCsv, golfersCsv, noShowsCsv } from '@/components/dashboard/analytics/Tabs';
import { ShopTab, shopCsv } from '@/components/dashboard/analytics/ShopTab';
import { type Data, type Ledger, type Range, type SalesReply, type Shop, downloadCsv, lastMonth, ledgerOf, ledgerOfSales, pastMonths, periodText } from '@/components/dashboard/analytics/data';

type Tab = 'sheet' | 'book' | 'golfers' | 'noshow' | 'shop' | 'review';
const TABS: [Tab, string][] = [['sheet', 'Tee sheet'], ['book', 'Bookings'], ['golfers', 'Golfers'], ['noshow', 'No-shows'], ['shop', 'Pro shop'], ['review', 'Reviews']];
const BTN = 'min-h-[40px] px-3.5 rounded-[10px] text-[13px] font-semibold bg-ink text-page hover:opacity-90';
const OPT = 'w-full text-left min-h-[40px] px-3 rounded-[8px] text-[13.5px] text-ink hover:bg-ink/5';

/** The dates: the last 30 days, one of the last three months, or the course's own dates. */
function Dates({ value, today, onChange }: { value: Range; today: string; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.from), [to, setTo] = useState(value.to);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutside<HTMLDivElement>(open, close);
  const pick = (r: Range) => { setOpen(false); onChange(r); };
  const L = lastMonth(today);
  return (
    <div className="relative" ref={ref}>
      <IconButton label="Choose the dates" expanded={open} onClick={() => { setFrom(value.from); setTo(value.to); setOpen(o => !o); }} className="w-10 h-10 text-ink-soft hover:text-ink">{Icon.calendar}</IconButton>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-[260px] p-2 rounded-[14px] border border-line shadow-card flex flex-col gap-0.5" style={{ backgroundColor: 'var(--op-panel-solid)' }}
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
          <button type="button" className={OPT + (value.from === L.from && value.to === L.to ? ' font-semibold' : '')} onClick={() => pick(L)}>Last 30 days</button>
          {pastMonths(today).map(m => <button key={m.label} type="button" className={OPT + (value.from === m.range.from && value.to === m.range.to ? ' font-semibold' : '')} onClick={() => pick(m.range)}>{m.label}</button>)}
          <div className="border-t border-line mt-1 pt-2.5 px-1 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[12px] text-ink-muted">From<input type="date" value={from} max={today} onChange={e => setFrom(e.target.value)} className="min-w-0 text-[13px] text-ink bg-ink/5 border border-line rounded-[9px] px-2 py-1.5" /></label>
              <label className="flex flex-col gap-1 text-[12px] text-ink-muted">To<input type="date" value={to} max={today} onChange={e => setTo(e.target.value)} className="min-w-0 text-[13px] text-ink bg-ink/5 border border-line rounded-[9px] px-2 py-1.5" /></label>
            </div>
            <button type="button" className={BTN} onClick={() => { if (!from || !to) return; pick(from <= to ? { from, to } : { from: to, to: from }); }}>Show these dates</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsInner() {
  const access = useDashboardAccess();
  const seesMoney = access.can('money.payments');
  const [today, setToday] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [range, setRange] = useState<Range>(() => lastMonth(new Date().toLocaleDateString('en-CA')));
  const [picked, setPicked] = useState(false); // the course picked its own dates; don't move them when the date settles
  const [tab, setTab] = useState<Tab>('sheet');
  const [metric, setMetric] = useState<Metric>('rev');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // A refusal is not a failure: a staff login gets a plain explanation and a way back, never a Retry that can only fail.
  const [denied, setDenied] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (r: Range) => {
    const mine = ++seq.current;
    setLoading(true); setError('');
    const res = await dfetch<Data>(`/api/operator/analytics?${new URLSearchParams({ ...r, compare: '1' })}`);
    if (mine !== seq.current) return; // a newer pick superseded this one
    if (res.ok) setData(res.data);
    else if (res.status === 403) setDenied(true);
    else if (res.status === 401) setSignedOut(true);
    else setError(res.error);
    setLoading(false);
  }, []);
  useEffect(() => { load(range); }, [load, range]);
  // The browser's date can be a day off the course's: once the course's date is known, the default snapshot follows it.
  useEffect(() => {
    if (!data || data.today === today) return;
    setToday(data.today);
    if (!picked) setRange(lastMonth(data.today));
  }, [data, today, picked]);

  // The ledger's money for the same dates, for logins that see money: Build's `ledger` block on the analytics reply.
  // Until a reply carries it (with `paid`), the Revenue page's own money/sales `all` stands in; once it does, that
  // heavier call is not made.
  const [salesLedger, setLedger] = useState<Ledger | null>(null);
  const [ledgerError, setLedgerError] = useState('');
  const lseq = useRef(0);
  const loadLedger = useCallback(async (r: Range) => {
    const mine = ++lseq.current;
    setLedger(null); setLedgerError(''); // never last range's money beside this range's numbers
    const res = await dfetch<SalesReply>(`/api/operator/money/sales?from=${r.from}&to=${r.to}`);
    if (mine !== lseq.current) return;
    if (res.ok) setLedger(res.data.all ? ledgerOfSales(res.data.all) : null); else { setLedger(null); setLedgerError(res.error); }
  }, []);
  const built = !!data?.ledger?.paid;
  useEffect(() => { if (access.loaded && seesMoney && data && !built) loadLedger(data.range); else setLedger(null); }, [access.loaded, seesMoney, data, built, loadLedger]);
  const ledger: Ledger | null = !seesMoney ? null : data?.ledger ? { ...ledgerOf(data.ledger), paid: data.ledger.paid ?? salesLedger?.paid ?? null } : salesLedger;

  const shop = useRef<Shop | null>(null);
  const onShop = useCallback((r: Shop | null) => { shop.current = r; }, []);
  const exportTab = () => {
    if (!data) return;
    const name = `analytics-${TABS.find(t => t[0] === tab)![1].toLowerCase().replace(/[^a-z]+/g, '-')}-${data.range.from}-${data.range.to}`;
    const rows = tab === 'sheet' ? teeSheetCsv(data) : tab === 'book' ? bookingsCsv(data) : tab === 'golfers' ? golfersCsv(data)
      : tab === 'noshow' ? noShowsCsv(data) : tab === 'shop' && shop.current ? shopCsv(shop.current) : [];
    if (tab === 'review') toast('Reports download one at a time, from their own row.', 'warn');
    else if (downloadCsv(name, rows)) toast(`Downloaded ${name}.csv.`, 'ok');
    else toast('Nothing to download for these dates.', 'warn');
  };

  if (denied || signedOut) return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="analytics" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="max-w-xl mx-auto px-6 py-16">
          <Card className="p-6">
            <h1 className="text-[20px] font-serif font-semibold text-ink">{denied ? 'Your login doesn’t include Analytics' : 'Your session ended'}</h1>
            <p className="text-[13.5px] text-ink-soft mt-2">{denied
              ? 'The course owner can turn on “See analytics” for you in Settings → Staff & permissions.'
              : 'Sign in again to see your analytics.'}</p>
            <Link href={denied ? '/dashboard' : '/dashboard/login'} className={'inline-flex items-center mt-4 ' + BTN}>{denied ? 'Back to the tee sheet' : 'Sign in'}</Link>
          </Card>
        </div>
      </main>
    </div>
  );

  const d = data;
  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="analytics" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="px-4 sm:px-6 py-5 flex flex-col gap-4 min-w-0">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <h1 className="mt-1 font-serif text-[30px] sm:text-[34px] font-semibold leading-none text-ink">Analytics</h1>
            <span className="mr-auto mb-0.5 text-[13px] text-ink-muted tabular-nums max-sm:order-3 max-sm:basis-full">{periodText(d?.range ?? range)}</span>
            <span className="ml-auto inline-flex items-center gap-0.5">
              <Dates value={range} today={today} onChange={r => { setPicked(true); setRange(r); }} />
              <IconButton label="Export this tab as a CSV" onClick={exportTab} className="w-10 h-10 text-ink-soft hover:text-ink">{Icon.download}</IconButton>
            </span>
          </div>

          {error && <LoadError message={d ? `${error} Still showing ${periodText(d.range)}.` : error} onRetry={() => load(range)} />}
          {ledgerError && d && <LoadError message={`Couldn’t load ${d.ledger ? 'how golfers paid' : 'your revenue'} — ${ledgerError}`} onRetry={() => loadLedger(d.range)} />}
          {loading && !d && <p className="py-24 text-center text-[13px] text-ink-muted">Loading…</p>}

          {d && (
            <div className={'flex flex-col gap-4 ' + (loading ? 'opacity-60 pointer-events-none' : '')}>
              <Head d={d} ledger={ledger} metric={metric} setMetric={setMetric} />
              <SlidingTabs value={tab} onChange={setTab} label="Analytics" className="w-full mt-2 [&>button]:min-h-[44px] [&>button]:text-[14px]" tabs={TABS} />
              <div className="flex flex-col gap-7 pt-1">
                {tab === 'sheet' && <TeeSheetTab d={d} money={seesMoney} />}
                {tab === 'book' && <BookingsTab d={d} ledger={ledger} />}
                {tab === 'golfers' && <GolfersTab d={d} />}
                {tab === 'noshow' && <NoShowsTab d={d} money={seesMoney} range={d.range} />}
                {tab === 'shop' && <ShopTab range={d.range} money={seesMoney} onLoad={onShop} />}
                {tab === 'review' && <ReviewsTab />}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AnalyticsPage() {
  return <Suspense fallback={<div className="min-h-screen bg-paper" />}><AnalyticsInner /></Suspense>;
}
