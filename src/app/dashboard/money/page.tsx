'use client';
// SD-8 — Payments and Cancellations were two pages querying the same endpoint,
// and Payouts was buried in Settings. One Money page, three tabs, one load.
// /dashboard/payments and /dashboard/cancellations redirect here, so every
// bookmark, email link and tee-sheet deep link still lands in the right place.
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
import type { MoneyBooking, MoneyCourse } from '@/components/dashboard/money/types';

const TABS = [
  { key: 'payments', label: 'Payments' },
  { key: 'cancellations', label: 'Cancellations' },
  { key: 'payouts', label: 'Payouts' },
] as const;
type TabKey = typeof TABS[number]['key'];

// SP-A: each tab is a permission the course owner grants per person.
const TAB_PERMISSION = { payments: 'money.payments', cancellations: 'money.cancellations', payouts: 'money.payouts' } as const;

const EMPTY_COURSE: MoneyCourse = { cancellationHours: 24, lateCancellationFee: 10, stripeAccountActive: false, liveStatus: 'draft' };

function MoneyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateFilter = searchParams.get('date') || '';
  const stripeParam = searchParams.get('stripe');
  const tabParam = searchParams.get('tab');

  const [bookings, setBookings] = useState<MoneyBooking[]>([]);
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

  const setTab = (key: TabKey) => {
    const q = new URLSearchParams(searchParams.toString());
    q.set('tab', key);
    router.replace(`/dashboard/money?${q.toString()}`, { scroll: false });
  };

  const loadBookings = useCallback(async () => {
    setLoading(true);
    // The unfiltered list drives Cancellations and the unfiltered Payments
    // view. A ?date= deep link from the tee sheet gets its own fetch, because
    // the unfiltered one is capped at the newest 200 rows.
    const [all, day] = await Promise.all([
      dfetch<MoneyBooking[]>('/api/operator/bookings'),
      dateFilter ? dfetch<MoneyBooking[]>(`/api/operator/bookings?date=${encodeURIComponent(dateFilter)}`) : Promise.resolve(null),
    ]);
    if (all.status === 401) { router.push('/dashboard/login'); return; }
    if (!all.ok) { setBookings([]); setLoadError(all.error); }
    else { setBookings(Array.isArray(all.data) ? all.data : []); setLoadError(''); }
    // SD-8 review (BLOCKING): this used to discard a failed day fetch and fall
    // back to the unfiltered list while the panel still announced "Showing
    // bookings for <date>" — the wrong rows under a banner asserting they were
    // the right ones. A failed day fetch is now its own visible error.
    if (!day) { setDated(null); setDatedError(''); }
    else if (day.ok && Array.isArray(day.data)) { setDated(day.data); setDatedError(''); }
    else { setDated(null); setDatedError(day.ok ? 'That day came back in a shape we could not read.' : day.error); }
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

  useEffect(() => { loadBookings(); }, [loadBookings]);
  useEffect(() => { loadCourse(); }, [loadCourse]);
  const refresh = () => { loadBookings(); loadCourse(); };

  // With a date asked for but not loaded, show nothing rather than the
  // unfiltered list — the error above says why.
  const paymentRows = dateFilter ? (dated ?? []) : bookings;

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-paper md:overflow-hidden">
      <OperatorSidebar active="money"/>
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {/* U-O (§1b): serif title + one sentence of this page's own numbers. */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[30px] font-serif font-semibold leading-none tracking-tight text-ink">Money</h1>
              </div>
              <p className="text-[13.5px] text-ink-soft mt-2">
                {/* AN-1: the money totals moved to Analytics; this line is status only. */}
                {/* Review (admin-UX): never claim "not connected" from a course that failed to load. */}
                {courseLoaded ? (course.stripeAccountActive ? 'Stripe connected' : 'Stripe not connected')
                  : courseError ? <>Stripe status unavailable — <button onClick={loadCourse} className="underline font-medium">retry</button></> : 'Loading…'}
              </p>
            </div>
            <button onClick={refresh} className="shrink-0 flex items-center gap-1.5 text-[12.5px] text-ink-soft px-3 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">
              Refresh
            </button>
          </div>


          {/* U-O: tabs are square chips, not a segmented pill. */}
          <div className="flex flex-wrap gap-1.5 mb-5 border-b border-line pb-3">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} aria-current={active === t.key ? 'page' : undefined}
                className={'px-3.5 py-1.5 rounded-md text-[13.5px] font-medium border transition-colors ' + (active === t.key ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-line hover:border-line-strong hover:text-ink')}>
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
          {datedError && active === 'payments' && (
            <LoadError message={`Couldn't load that day's bookings — ${datedError}`} onRetry={loadBookings} />
          )}
          {courseError && active !== 'payments' && (
            <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">
              Couldn&apos;t load your course settings ({courseError}) — the cancellation policy and Stripe state below are not trustworthy until it loads. <button onClick={loadCourse} className="underline font-medium">Retry</button>
            </div>
          )}

          {!access.loaded || tabs.length === 0 ? null : loading ? (
            <div className="flex items-center justify-center py-16 text-ink-muted gap-2"><Loader2 className="w-5 h-5 animate-spin"/>Loading...</div>
          ) : active === 'payments' ? (
            <PaymentsPanel bookings={paymentRows} dateFilter={datedError ? '' : dateFilter} onClearDate={() => router.push('/dashboard/money?tab=payments')}/>
          ) : active === 'cancellations' ? (
            <CancellationsPanel bookings={bookings} course={course} courseLoaded={courseLoaded} isStaff={treatAsStaff} onChanged={refresh}/>
          ) : (
            <PayoutsPanel course={course} stripeParam={stripeParam} onConnected={loadCourse}/>
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
