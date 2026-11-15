'use client';
// REVENUE-1 (Cam 2026-11-15, approved mockup lanes/dashboard/money-mockup.html; lanes/dashboard.md "Next" 1): Money is
// Revenue. Today against the 30-day average beside the next payout, ONE date range for the whole page, the revenue chart,
// what was sold beside how it was paid, Pending payments, then Payments · Ledger · Payouts · Cancellations. Every row
// opens a side card. The GreenReserve $1.50 fee is never course revenue (one muted Totals line in the Ledger); "Net
// revenue", never "profit". Both Stripe buttons are the small Stripe logo square.
// Kept from Money (SD-8, SP-A, MONEY-1): /dashboard/payments and /dashboard/cancellations still redirect here; each tab is
// its own permission; ?tab, ?show=unpaid, ?date (the tee sheet's deep link), ?q (search opens Cancellations on a golfer)
// and ?stripe (Stripe's return) all still land where they did. Every failed load says so — never shown as nothing.
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CARD } from '@/components/ui/Card';
import OperatorSidebar from '@/components/OperatorSidebar';
import { SlidingTabs } from '@/components/dashboard/SlidingTabs';
import { LoadError } from '@/components/dashboard/LoadError';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { dfetch } from '@/lib/dashboard-fetch';
import type { MoneyBooking, MoneyCourse } from '@/components/dashboard/money/types';
import { StripeSquare } from '@/components/dashboard/money/revenue/ui';
import { TodayCard, NextPayoutCard, RangeBar, RevenueChart, SoldPaid, soldTotal, rangeOf, rangeText } from '@/components/dashboard/money/revenue/Top';
import { PendingPayments } from '@/components/dashboard/money/revenue/PendingPayments';
import { PaymentsTab } from '@/components/dashboard/money/revenue/PaymentsTab';
import { LedgerTab } from '@/components/dashboard/money/revenue/LedgerTab';
import { PayoutsTab } from '@/components/dashboard/money/revenue/PayoutsTab';
import { CancellationsTab } from '@/components/dashboard/money/revenue/CancellationsTab';
import type { Sales, Overview, PayoutsData, Range, RangeKey } from '@/components/dashboard/money/revenue/data';

const TABS = [
  { key: 'payments', label: 'Payments' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'cancellations', label: 'Cancellations' },
] as const;
type TabKey = typeof TABS[number]['key'];
// SP-A: each tab is a permission the course owner grants per person.
const TAB_PERMISSION = { payments: 'money.payments', ledger: 'money.payments', cancellations: 'money.cancellations', payouts: 'money.payouts' } as const;
const EMPTY_COURSE: MoneyCourse = { cancellationHours: 24, lateCancellationFee: 10, stripeAccountActive: false, liveStatus: 'draft' };
const NOTE = `${CARD} !rounded-[16px] border-l-[3px] border-warn px-4 py-3 text-[13.5px] text-ink-soft`;

function RevenuePageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const dateFilter = sp.get('date') || '';
  const stripeParam = sp.get('stripe');
  const tabParam = sp.get('tab');
  const showParam = sp.get('show');
  const access = useDashboardAccess();
  const seesPayments = access.can('money.payments');
  const seesPayouts = access.can('money.payouts');
  const tabs = TABS.filter(t => access.can(TAB_PERMISSION[t.key]));
  const requested = (tabParam && TABS.some(t => t.key === tabParam) ? tabParam : (stripeParam ? 'payouts' : 'payments')) as TabKey;
  const active: TabKey = tabs.some(t => t.key === requested) ? requested : (tabs[0]?.key ?? 'cancellations');
  const setTab = (key: TabKey, show?: 'unpaid') => {
    const q = new URLSearchParams(sp.toString());
    q.set('tab', key);
    if (show) q.set('show', show); else q.delete('show');
    router.replace(`/dashboard/money?${q.toString()}`, { scroll: false });
  };

  // One date range for the whole page (Cam's comments on the mockup).
  const [today, setToday] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [rangeKey, setRangeKey] = useState<RangeKey>('30');
  const [custom, setCustom] = useState<Range | undefined>(undefined);
  const range = rangeOf(rangeKey, today, custom);
  const rangeLabel = rangeText(range);

  const [sales, setSales] = useState<Sales | null>(null);
  const [salesError, setSalesError] = useState('');
  const loadSales = useCallback(async () => {
    if (!seesPayments) return;
    setSalesError('');
    const r = await dfetch<Sales>(`/api/operator/money/sales?from=${range.from}&to=${range.to}`);
    if (r.ok) { setSales(r.data); if (r.data.today !== today) setToday(r.data.today); } else setSalesError(r.error);
  }, [seesPayments, range.from, range.to, today]);
  useEffect(() => { if (access.loaded) loadSales(); }, [access.loaded, loadSales]);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState('');
  const [payouts, setPayouts] = useState<PayoutsData | null>(null);
  const [payoutError, setPayoutError] = useState('');
  const loadOverview = useCallback(async () => {
    const [o, p] = await Promise.all([
      seesPayments ? dfetch<Overview>('/api/operator/money/overview') : Promise.resolve(null),
      seesPayouts ? dfetch<PayoutsData>('/api/operator/stripe/payouts') : Promise.resolve(null),
    ]);
    setOverview(o && o.ok ? o.data : null);
    setOverviewError(o && !o.ok ? o.error : '');
    setPayouts(p && p.ok ? p.data : null);
    setPayoutError(p && !p.ok ? p.error : '');
  }, [seesPayments, seesPayouts]);
  useEffect(() => { if (access.loaded) loadOverview(); }, [access.loaded, loadOverview]);

  const [cancelled, setCancelled] = useState<MoneyBooking[]>([]);
  const [played, setPlayed] = useState<MoneyBooking[] | null>(null);
  const [dated, setDated] = useState<MoneyBooking[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [playedError, setPlayedError] = useState('');
  const [datedError, setDatedError] = useState('');
  const [loading, setLoading] = useState(true);
  const loadBookings = useCallback(async () => {
    setLoading(true);
    const [all, playedRes, day] = await Promise.all([
      dfetch<MoneyBooking[]>('/api/operator/bookings?status=cancelled'),
      dfetch<MoneyBooking[]>('/api/operator/bookings?played=1'),
      dateFilter ? dfetch<MoneyBooking[]>(`/api/operator/bookings?date=${encodeURIComponent(dateFilter)}`) : Promise.resolve(null),
    ]);
    if (all.status === 401) { router.push('/dashboard/login'); return; }
    if (!all.ok) { setCancelled([]); setLoadError(all.error); } else { setCancelled(Array.isArray(all.data) ? all.data : []); setLoadError(''); }
    if (playedRes.ok && Array.isArray(playedRes.data)) { setPlayed(playedRes.data); setPlayedError(''); } else { setPlayed(null); setPlayedError(playedRes.ok ? 'Unreadable reply.' : playedRes.error); }
    // A failed day fetch is its own visible error, never the unfiltered list under "Showing <date>" (SD-8 review).
    if (!day) { setDated(null); setDatedError(''); }
    else if (day.ok && Array.isArray(day.data)) { setDated(day.data); setDatedError(''); }
    else { setDated(null); setDatedError(day.ok ? 'That day couldn’t be read.' : day.error); }
    setLoading(false);
  }, [router, dateFilter]);
  useEffect(() => { loadBookings(); }, [loadBookings]);

  const [course, setCourse] = useState<MoneyCourse>(EMPTY_COURSE);
  const [courseLoaded, setCourseLoaded] = useState(false);
  const [courseError, setCourseError] = useState('');
  const loadCourse = useCallback(async () => {
    setCourseError('');
    const r = await dfetch<Record<string, unknown>>('/api/operator/courses');
    if (!r.ok) { setCourseError(r.error); setCourseLoaded(false); return; }
    const c = r.data ?? {};
    setCourse({
      cancellationHours: typeof c.cancellationHours === 'number' ? c.cancellationHours : 24,
      lateCancellationFee: typeof c.lateCancellationFee === 'number' ? c.lateCancellationFee : 10,
      stripeAccountActive: !!c.stripeAccountActive,
      liveStatus: typeof c.liveStatus === 'string' ? c.liveStatus : 'draft',
    });
    setCourseLoaded(true);
  }, []);
  useEffect(() => { loadCourse(); }, [loadCourse]);

  const [openingStripe, setOpeningStripe] = useState(false);
  const [stripeError, setStripeError] = useState('');
  async function openStripe() {
    setOpeningStripe(true); setStripeError('');
    const r = await dfetch<{ url: string }>('/api/operator/stripe/dashboard-link', { method: 'POST' });
    setOpeningStripe(false);
    if (r.ok && r.data.url) window.open(r.data.url, '_blank', 'noopener'); else setStripeError(r.ok ? 'Stripe sent no link back. Try again.' : r.error);
  }
  const canOpenStripe = !access.isStaff && courseLoaded && course.stripeAccountActive;
  const connected = payouts ? payouts.connected : courseLoaded ? course.stripeAccountActive : null;
  const refreshMoney = () => { loadBookings(); loadSales(); loadOverview(); };

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="money" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="px-4 sm:px-6 py-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="mr-auto mt-1 font-serif text-[30px] sm:text-[34px] font-semibold leading-none text-ink">Revenue</h1>
            {canOpenStripe && <StripeSquare label="Open your Stripe dashboard (new tab)" onClick={openStripe} busy={openingStripe} />}
          </div>
          {stripeError && <LoadError message={stripeError} onRetry={openStripe} />}
          {courseError && <LoadError message={`Couldn't load your course — ${courseError}`} onRetry={loadCourse} />}
          {salesError && <LoadError message={`Couldn't load your revenue — ${salesError}`} onRetry={loadSales} />}
          {overviewError && <LoadError message={`Couldn't load what's owed — ${overviewError}`} onRetry={loadOverview} />}
          {payoutError && <LoadError message={`Couldn't load your payouts from Stripe — ${payoutError}`} onRetry={loadOverview} />}

          {(seesPayments || seesPayouts) && (
            <div className={'grid gap-4 items-stretch ' + (seesPayments && seesPayouts ? 'lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]' : seesPayouts ? 'max-w-sm' : '')}>
              {seesPayments && (sales ? <TodayCard s={sales} /> : <section className={`${CARD} !rounded-[16px] px-5 py-[18px] text-[13px] text-ink-muted`} aria-label="Today">{salesError ? 'Today couldn’t be read.' : 'Loading…'}</section>)}
              {seesPayouts && <NextPayoutCard data={payouts} connected={connected} error={payoutError} onAll={tabs.some(t => t.key === 'payouts') ? () => setTab('payouts') : undefined} />}
            </div>
          )}

          {!dateFilter && <RangeBar value={range} rangeKey={rangeKey} today={today} onChange={(k, r) => { setRangeKey(k); if (r) setCustom(r); }} />}

          {seesPayments && sales && (<>
            <RevenueChart s={sales} range={range} total={soldTotal(sales)} />
            <SoldPaid s={sales} onDrawer />
          </>)}

          {seesPayments && overview && (
            <PendingPayments declined={overview.declined} declinedTotal={overview.declinedTotal} canSendLink={access.can('sheet.checkin')}
              notPaid={{ cents: overview.notPaidCents, groups: overview.notPaidGroups, noShowCents: overview.noShowToChargeCents ?? 0, noShowGroups: overview.noShowToChargeGroups ?? 0 }}
              onSeeUnpaid={tabs.some(t => t.key === 'payments') ? () => setTab('payments', 'unpaid') : undefined} onChanged={loadOverview} />
          )}

          {access.failed && <div className={NOTE}>We couldn&apos;t confirm what your login can see, so nothing is shown yet. Reload the page to try again.</div>}
          {access.loaded && tabs.length === 0 && <div className={NOTE}>Your login doesn&apos;t include the Revenue pages. Ask the course owner.</div>}

          {access.loaded && tabs.length > 0 && (<>
            <SlidingTabs value={active} onChange={k => setTab(k)} label="Revenue" className="w-full mt-1 [&>button]:text-[15px]" tabs={tabs.map(t => [t.key, t.label] as const)} />
            {loadError && <LoadError message={loadError} onRetry={loadBookings} />}
            {playedError && active === 'payments' && !dateFilter && <LoadError message={playedError} onRetry={loadBookings} />}
            {datedError && active === 'payments' && <LoadError message={`Couldn't load that day's bookings — ${datedError}`} onRetry={loadBookings} />}
            {loading && active !== 'ledger' && active !== 'payouts' ? <p className="py-12 text-center text-[13px] text-ink-muted">Loading…</p>
              : active === 'payments' ? (
                <PaymentsTab key={showParam ?? 'all'} bookings={dateFilter ? (dated ?? []) : (played ?? [])} range={range} rangeLabel={rangeLabel}
                  today={overview?.today ?? today} clock={overview?.clock ?? '99:99'} dateFilter={datedError ? '' : dateFilter}
                  onClearDate={() => router.push('/dashboard/money?tab=payments')} initialShow={showParam === 'unpaid' ? 'unpaid' : 'all'}
                  capped={!dateFilter && (played?.length ?? 0) >= 1000} canRefund={access.can('money.refund_rounds')} onRefunded={refreshMoney} />
              ) : active === 'ledger' ? <LedgerTab range={range} rangeLabel={rangeLabel} />
              : active === 'payouts' ? (
                <PayoutsTab data={payouts} error={payoutError} course={course} stripeParam={stripeParam} onConnected={() => { loadCourse(); loadOverview(); }} canConnect={!access.isStaff}
                  range={range} rangeLabel={rangeLabel} onOpenStripe={canOpenStripe ? openStripe : undefined} openingStripe={openingStripe} />
              ) : (
                <CancellationsTab key={sp.get('q') ?? ''} bookings={cancelled} course={course} range={range} rangeLabel={rangeLabel} initialQuery={sp.get('q') ?? ''}
                  canWaive={access.can('sheet.waive_fee')} onRefunded={refreshMoney} />
              )}
          </>)}
        </div>
      </main>
    </div>
  );
}

export default function RevenuePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <RevenuePageInner />
    </Suspense>
  );
}
