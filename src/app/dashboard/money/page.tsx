'use client';
// SD-8 — Payments and Cancellations were two pages querying the same endpoint,
// and Payouts was buried in Settings. One Money page, three tabs, one load.
// /dashboard/payments and /dashboard/cancellations redirect here, so every
// bookmark, email link and tee-sheet deep link still lands in the right place.
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { TabIntroButton, TabIntroCard } from '@/components/dashboard/TabIntro';
import { useTabIntro } from '@/lib/use-tab-intro';
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

// Staff run the tee sheet (SD-1). They could always see Cancellations and
// never Payments; merging the pages must not quietly widen that.
const STAFF_TABS: TabKey[] = ['cancellations'];

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
  // SD-8 review: null = not yet known. The tab list assumes STAFF until the
  // probe says otherwise, so a slow or failed probe cannot flash the Payments
  // ledger and the revenue tiles at a staff login. (Those tabs are a UI
  // control, not a boundary — every action behind them is refused server-side
  // — but they still must not widen what staff are shown.)
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [roleUnknown, setRoleUnknown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const intro = useTabIntro('money');

  const treatAsStaff = isStaff !== false;
  const tabs = TABS.filter(t => !treatAsStaff || STAFF_TABS.includes(t.key));
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
  useEffect(() => {
    let cancelled = false;
    fetch('/api/operator/my-courses')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => { if (!cancelled) { setIsStaff(!!d?.isStaff); setRoleUnknown(false); } })
      .catch(() => { if (!cancelled) setRoleUnknown(true); });
    return () => { cancelled = true; };
  }, []);

  const refresh = () => { loadBookings(); loadCourse(); };

  // With a date asked for but not loaded, show nothing rather than the
  // unfiltered list — the error above says why.
  const paymentRows = dateFilter ? (dated ?? []) : bookings;
  const nonCancelled = bookings.filter(b => b.status !== 'cancelled');
  const collectedRevenue = nonCancelled.filter(b => b.paymentStatus === 'paid').reduce((s, b) => s + b.greenFeeTotal + b.cartFeeTotal, 0);
  const stillToCome = nonCancelled.filter(b => b.paymentStatus !== 'paid').length;
  const cancelledCount = bookings.filter(b => b.status === 'cancelled').length;

  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen bg-paper md:overflow-hidden">
      <OperatorSidebar active="money"/>
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {/* U-O (§1b): serif title + one sentence of this page's own numbers. */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[30px] font-serif font-medium leading-none tracking-tight text-ink">Money</h1>
                <TabIntroButton onClick={intro.show}/>
              </div>
              <p className="text-[13.5px] text-ink-soft mt-2">
                ${(collectedRevenue / 100).toFixed(2)} collected · {stillToCome} booking{stillToCome !== 1 ? 's' : ''} still to come · {cancelledCount} cancelled · {course.stripeAccountActive ? 'Stripe connected' : 'Stripe not connected'}
              </p>
            </div>
            <button onClick={refresh} className="shrink-0 flex items-center gap-1.5 text-[12.5px] text-ink-soft px-3 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">
              <RefreshCw className="w-3.5 h-3.5"/>Refresh
            </button>
          </div>

          <TabIntroCard
            open={intro.open}
            onDismiss={intro.dismiss}
            title="This is your Money."
            bullets={[
              'Payments: green fees, cart fees and GreenReserve’s service fee, per booking.',
              'Cancellations: who cancelled, when, whether a late fee applied — and your policy.',
              'Payouts: connect Stripe and open your balance. Payments settle to your own Stripe account on its normal schedule.',
            ]}
          />

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
              We couldn&apos;t confirm your access level, so this is the limited view. If you own this course, reload to see Payments and Payouts.
            </div>
          )}
          {loadError && <LoadError message={loadError} onRetry={loadBookings} />}
          {datedError && active === 'payments' && (
            <LoadError message={`Couldn't load that day's bookings — ${datedError}`} onRetry={loadBookings} />
          )}
          {courseError && active !== 'payments' && (
            <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">
              Couldn&apos;t load your course settings ({courseError}) — the cancellation policy and Stripe state below are not trustworthy until it loads. <button onClick={loadCourse} className="underline font-medium">Retry</button>
            </div>
          )}

          {loading ? (
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
