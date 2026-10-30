'use client';
// SD-8 — Payments and Cancellations were two pages querying the same endpoint,
// and Payouts was buried in Settings. One Money page, three tabs, one load.
// /dashboard/payments and /dashboard/cancellations redirect here, so every
// bookmark, email link and tee-sheet deep link still lands in the right place.
import { Card } from '@/components/ui/Card';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { PaymentsPanel } from '@/components/dashboard/money/PaymentsPanel';
import { CancellationsPanel } from '@/components/dashboard/money/CancellationsPanel';
import { PayoutsPanel } from '@/components/dashboard/money/PayoutsPanel';
import { SalesPanel } from '@/components/dashboard/money/SalesPanel';
import type { MoneyBooking, MoneyCourse } from '@/components/dashboard/money/types';
import type { PayoutsData } from '@/components/dashboard/money/PayoutsTable';
import { StatusDot } from '@/components/ui/StatusDot';
import { formatTeeTime, formatTeeDate } from '@/lib/format';
import type { DeclinedCard } from '@/lib/operator-home';
import { DeclinedCardList } from '@/components/dashboard/DeclinedCardList';
import { toast } from '@/components/dashboard/Toast';
import { LedgerPanel } from '@/components/dashboard/money/LedgerPanel';

type Overview = { week: { from: string; to: string }; today: string; clock: string; paidCents: number; notPaidCents: number; notPaidGroups: number; declined: DeclinedCard[]; declinedTotal: number; stripeConnected: boolean };
const usd2 = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmtArrival = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

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

function MoneyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateFilter = searchParams.get('date') || '';
  const stripeParam = searchParams.get('stripe');
  const tabParam = searchParams.get('tab');
  const showParam = searchParams.get('show');

  const [bookings, setBookings] = useState<MoneyBooking[]>([]);
  const [played, setPlayed] = useState<MoneyBooking[] | null>(null);
  const [playedError, setPlayedError] = useState('');
  const [dated, setDated] = useState<MoneyBooking[] | null>(null);
  const [datedError, setDatedError] = useState('');
  const [course, setCourse] = useState<MoneyCourse>(EMPTY_COURSE);
  const [courseLoaded, setCourseLoaded] = useState(false);
  const [courseError, setCourseError] = useState('');
  // SP-A (was SD-8's isStaff probe): until the login's permissions load, no tab
  // that needs one is shown, so a slow or failed load can't flash the ledger.
  const access = useDashboardAccess();
  const roleUnknown = access.failed;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const treatAsStaff = access.isStaff;
  const tabs = TABS.filter(t => access.can(TAB_PERMISSION[t.key]));
  const requested = (tabParam && TABS.some(t => t.key === tabParam) ? tabParam : (stripeParam ? 'payouts' : 'payments')) as TabKey;
  const active: TabKey = tabs.some(t => t.key === requested) ? requested : (tabs[0]?.key ?? 'cancellations');

  const setTab = (key: TabKey, show?: 'unpaid') => {
    const q = new URLSearchParams(searchParams.toString());
    q.set('tab', key);
    if (show) q.set('show', show); else q.delete('show');
    router.replace(`/dashboard/money?${q.toString()}`, { scroll: false });
  };

  const loadBookings = useCallback(async () => {
    setLoading(true);
    // The unfiltered list drives Cancellations and the unfiltered Payments
    // view. A ?date= deep link from the tee sheet gets its own fetch, because
    // the unfiltered one is capped at the newest 200 rows.
    const [all, playedRes, day] = await Promise.all([
      // Cancellations: only cancelled bookings (dead end 13 — 1 of 87 showed in the newest 200 of everything).
      dfetch<MoneyBooking[]>('/api/operator/bookings?status=cancelled'),
      // Payments: rounds already played, newest first (not the newest bookings made).
      dfetch<MoneyBooking[]>('/api/operator/bookings?played=1'),
      dateFilter ? dfetch<MoneyBooking[]>(`/api/operator/bookings?date=${encodeURIComponent(dateFilter)}`) : Promise.resolve(null),
    ]);
    if (all.status === 401) { router.push('/dashboard/login'); return; }
    if (!all.ok) { setBookings([]); setLoadError(all.error); }
    else { setBookings(Array.isArray(all.data) ? all.data : []); setLoadError(''); }
    if (playedRes.ok && Array.isArray(playedRes.data)) { setPlayed(playedRes.data); setPlayedError(''); }
    else { setPlayed(null); setPlayedError(playedRes.ok ? 'Unreadable reply.' : playedRes.error); }
    // SD-8 review (BLOCKING): this used to discard a failed day fetch and fall
    // back to the unfiltered list while the panel still announced "Showing
    // bookings for <date>" — the wrong rows under a banner asserting they were
    // the right ones. A failed day fetch is now its own visible error.
    if (!day) { setDated(null); setDatedError(''); }
    else if (day.ok && Array.isArray(day.data)) { setDated(day.data); setDatedError(''); }
    else { setDated(null); setDatedError(day.ok ? 'That day couldn’t be read.' : day.error); }
    setLoading(false);
  }, [router, dateFilter]);

  const loadCourse = useCallback(async () => {
    setCourseError('');
    // SD-10: a failed course load left the policy form on its 24h / $10
    // defaults, and Save would have written those over the real policy.
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

  // Money rework (Cam 2026-10-19): one line at the top — this week's paid and
  // not-yet-paid (same numbers as Analytics), and when the next payout lands.
  const [overview, setOverview] = useState<Overview | null>(null);
  const [nextPayout, setNextPayout] = useState<PayoutsData['next'] | undefined>(undefined);
  // A failed load is said out loud — never shown as "nothing on its way".
  const [overviewError, setOverviewError] = useState('');
  const [payoutError, setPayoutError] = useState('');
  const [openingStripe, setOpeningStripe] = useState(false);
  const [stripeError, setStripeError] = useState('');
  // Booleans, not the access object: it is a new object every render, and a
  // callback keyed on it would refetch forever.
  const seesPayments = access.can('money.payments');
  const seesPayouts = access.can('money.payouts');
  const loadOverview = useCallback(async () => {
    const [o, p] = await Promise.all([
      seesPayments ? dfetch<Overview>('/api/operator/money/overview') : Promise.resolve(null),
      seesPayouts ? dfetch<PayoutsData>('/api/operator/stripe/payouts') : Promise.resolve(null),
    ]);
    setOverview(o && o.ok ? o.data : null);
    setOverviewError(o && !o.ok ? o.error : '');
    // Not connected is its own state (undefined → "Connect Stripe"), never "nothing on its way".
    setNextPayout(p && p.ok ? (p.data.connected ? (p.data.next ?? null) : undefined) : undefined);
    setPayoutError(p && !p.ok ? p.error : '');
  }, [seesPayments, seesPayouts]);

  useEffect(() => { loadBookings(); }, [loadBookings]);
  useEffect(() => { loadCourse(); }, [loadCourse]);
  useEffect(() => { if (access.loaded) loadOverview(); }, [access.loaded, loadOverview]);
  const refresh = () => { loadBookings(); loadCourse(); loadOverview(); };

  // DASH-C Needs you: the declined-card rows are shared with Home (DeclinedCardList), pay links included.
  const canSendLink = access.can('sheet.checkin');

  async function openStripe() {
    setOpeningStripe(true); setStripeError('');
    const r = await dfetch<{ url: string }>('/api/operator/stripe/dashboard-link', { method: 'POST' });
    setOpeningStripe(false);
    if (r.ok && r.data.url) window.open(r.data.url, '_blank', 'noopener'); else setStripeError(r.ok ? 'Stripe sent no link back. Try again.' : r.error);
  }

  // With a date asked for but not loaded, show nothing rather than the
  // unfiltered list — the error above says why.
  const paymentRows = dateFilter ? (dated ?? []) : (played ?? []);

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="money"/>
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="px-4 sm:px-10 py-7">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h1 className="font-serif text-[32px] leading-none text-ink">Payments and payouts</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!treatAsStaff && courseLoaded && course.stripeAccountActive && (
                <button onClick={openStripe} disabled={openingStripe}
                  className="text-[13px] font-medium text-ink px-3.5 py-2 rounded-md bg-white border border-line hover:border-line-strong disabled:opacity-50">
                  {openingStripe ? 'Opening…' : 'Open your Stripe dashboard ↗'}
                </button>
              )}
              <button onClick={refresh} aria-label="Refresh" title="Refresh"
                className="w-9 h-9 rounded-md bg-white border border-line hover:border-line-strong text-ink-soft text-[17px] leading-none">↻</button>
            </div>
          </div>
          {stripeError && <div className="mb-4"><LoadError message={stripeError} onRetry={openStripe} /></div>}
          {courseError && <div className="mb-4"><LoadError message={`Couldn't load your course — ${courseError}`} onRetry={loadCourse} /></div>}

          {overviewError && <div className="mb-4"><LoadError message={`Couldn't load this week's totals — ${overviewError}`} onRetry={loadOverview} /></div>}
          {payoutError && <div className="mb-4"><LoadError message={`Couldn't load your payouts from Stripe — ${payoutError}`} onRetry={loadOverview} /></div>}
          {/* DENSE-2 (Cam 2026-10-27): Sales — today against last week, the picked dates by day,
              weekday and hour, what it was for, how golfers paid, the cash drawer. */}
          {seesPayments && (
            <SalesPanel nextPayout={nextPayout} showPayout={seesPayouts && !payoutError}
              stripeConnected={courseLoaded && course.stripeAccountActive}
              notPaid={overview ? { cents: overview.notPaidCents, groups: overview.notPaidGroups } : null}
              onSeeUnpaid={tabs.some(t => t.key === 'payments') ? () => setTab('payments', 'unpaid') : undefined} />
          )}
          {!seesPayments && seesPayouts && !payoutError && (
            <Card className="px-5 py-4 mb-6 max-w-sm">
              <div className="text-[13px] text-ink-soft">Next payout</div>
              {nextPayout ? <><div className="text-[24px] font-semibold tabular-nums text-ink">{usd(nextPayout.amountCents)}</div><div className="text-[12.5px] text-ink-muted">{fmtArrival(nextPayout.arrivalDate)}</div></>
                : courseLoaded && !course.stripeAccountActive ? <div className="text-[13.5px] text-ink mt-1">Connect Stripe</div>
                : <div className="text-[13.5px] text-ink-muted mt-1">{nextPayout === null ? 'None on its way' : 'Checking Stripe…'}</div>}
            </Card>
          )}

          {overview && overview.declinedTotal > 0 && (
            <section className="mb-6" aria-labelledby="money-needs">
              <h2 id="money-needs" className="text-[15px] font-semibold text-ink mb-2">Needs you</h2>
              <Card>
                <div className="divide-y divide-line-soft">
                  <DeclinedCardList rows={overview.declined} total={overview.declinedTotal} canSendLink={canSendLink} />
                </div>
              </Card>
            </section>
          )}

          <div className="flex gap-6 border-b border-line mb-5" role="tablist">
            {tabs.map(t => (
              <button key={t.key} role="tab" aria-selected={active === t.key} onClick={() => setTab(t.key)}
                className={'pb-2.5 -mb-px text-[14px] font-semibold border-b-2 transition-colors ' + (active === t.key ? 'text-ink border-fairway' : 'text-ink-soft border-transparent hover:text-ink')}>
                {t.label}
              </button>
            ))}
          </div>

          {roleUnknown && (
            <div className="bg-white border border-line border-l-[3px] border-l-warn rounded-md px-4 py-3 text-[13.5px] text-ink-soft mb-4">
              We couldn&apos;t confirm what your login can see, so nothing is shown yet. Reload the page to try again.
            </div>
          )}
          {access.loaded && tabs.length === 0 && (
            <div className="bg-white border border-line border-l-[3px] border-l-warn rounded-md px-4 py-3 text-[13.5px] text-ink-soft mb-4">
              Your login doesn&apos;t include any of the Money pages — ask the course owner if you need them.
            </div>
          )}
          {loadError && tabs.length > 0 && <LoadError message={loadError} onRetry={loadBookings} />}
          {playedError && active === 'payments' && !dateFilter && <LoadError message={playedError} onRetry={loadBookings} />}
          {datedError && active === 'payments' && (
            <LoadError message={`Couldn't load that day's bookings — ${datedError}`} onRetry={loadBookings} />
          )}

          {!access.loaded || tabs.length === 0 ? null : loading ? (
            <div className="flex items-center justify-center py-16 text-ink-muted gap-2"><Loader2 className="w-5 h-5 animate-spin"/>Loading...</div>
          ) : active === 'payments' ? (
            <PaymentsPanel key={showParam ?? 'all'} initialFilter={showParam === 'unpaid' ? 'unpaid' : 'all'} courseNow={overview ? { today: overview.today, clock: overview.clock } : undefined} capped={!dateFilter && (played?.length ?? 0) >= 1000} canRefund={access.can('money.refund_rounds')} onRefunded={m => { toast(m, 'ok'); loadBookings(); }} bookings={paymentRows} dateFilter={datedError ? '' : dateFilter} onClearDate={() => router.push('/dashboard/money?tab=payments')}/>
          ) : active === 'ledger' ? (
            <LedgerPanel/>
          ) : active === 'cancellations' ? (
            <CancellationsPanel key={searchParams.get('q') ?? ''} canWaive={access.can('sheet.waive_fee')} onRefunded={m => { toast(m, 'ok'); loadBookings(); }} bookings={bookings} course={course} initialQuery={active === 'cancellations' ? searchParams.get('q') ?? '' : ''}/>
          ) : (
            <PayoutsPanel course={course} stripeParam={stripeParam} onConnected={loadCourse} canConnect={!treatAsStaff}/>
          )}
        </div>
      </main>
    </div>
  );
}

export default function MoneyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper"/>}>
      <MoneyPageInner/>
    </Suspense>
  );
}
