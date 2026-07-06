'use client';
import { use, useEffect, useMemo, useState, FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Clock, LogOut, CreditCard, CalendarDays,
  ChevronLeft, ChevronRight, Check, AlertCircle, Mail,
  Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

type MemberTier = {
  id: string;
  name: string;
  color: string;
  greenFeeWeekday: number | null;
  greenFeeWeekend: number | null;
  cartFeeWeekday: number | null;
  cartFeeWeekend: number | null;
  discountPct: number | null;
  advanceBookingDays: number;
  annualFee: number;
  initiationFee: number;
};

type MemberSession = {
  email: string;
  name: string;
  membershipType: string;
  status: string;
  paymentStatus: string;
  startedAt: string | null;
  expiresAt: string | null;
  lastPaidAt: string | null;
  tier: MemberTier | null;
};

type MemberTeeTime = {
  id: string;
  date: string;
  time: string;
  holes: number;
  players_available: number;
  green_fee: number;
  member_green_fee: number;
  cart_fee: number;
  walking_allowed: boolean;
  status: 'available' | 'limited' | 'almost_full';
  has_member_rate: boolean;
};

type PaymentRecord = {
  type: string;
  amount: number;
  date: string | null;
  status: string;
  tierName: string;
};

type PaymentsData = {
  membership: {
    status: string;
    paymentStatus: string;
    expiresAt: string | null;
    startedAt: string | null;
    tierName: string;
    annualFee: number;
    initiationFee: number;
  };
  records: PaymentRecord[];
  courseName: string;
};

function formatDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function displayDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildDateStrip() {
  const today = startOfToday();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function monthLabel(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function buildMonthGrid(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  }
  return cells;
}

const STATUS_COLOR: Record<string, string> = {
  available: 'text-emerald-600',
  limited: 'text-amber-600',
  almost_full: 'text-red-500',
};
const STATUS_LABEL: Record<string, string> = {
  available: 'Available',
  limited: 'Limited',
  almost_full: 'Almost Full',
};

function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-800' },
    paid_offline: { label: 'Paid (offline)', cls: 'bg-emerald-100 text-emerald-800' },
    unpaid: { label: 'Unpaid', cls: 'bg-red-100 text-red-700' },
    comped: { label: 'Comped', cls: 'bg-gray-100 text-gray-600' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ── Sign-in panel ──────────────────────────────────────────────────────────────

function SignInPanel({
  slug,
  errorParam,
}: {
  slug: string;
  errorParam: string | null;
}) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setErr('');
    try {
      const res = await fetch(`/api/member/${slug}/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        setErr('Something went wrong. Please try again.');
      }
    } catch {
      setErr('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] flex flex-col">
      <div className="max-w-md mx-auto w-full px-4 py-16">
        <Link
          href={`/courses/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-8"
        >
          <ArrowLeft size={14} />
          Back to course
        </Link>

        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-8">
          <div className="mb-6">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">
              Member Portal
            </span>
            <h1 className="text-2xl font-black tracking-tight text-gray-900 mt-1">
              Sign in to your account
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Enter your email — we&apos;ll send you a one-click sign-in link.
            </p>
          </div>

          {errorParam === 'invalid' && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-3 mb-4 text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              That sign-in link has expired or is invalid. Request a new one below.
            </div>
          )}
          {errorParam === 'inactive' && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 mb-4 text-sm text-amber-800">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              Your membership is inactive. Contact the course for assistance.
            </div>
          )}

          {sent ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 mb-4">
                <Mail size={22} className="text-emerald-700" />
              </div>
              <p className="font-semibold text-gray-900 mb-1">Check your email</p>
              <p className="text-sm text-gray-500">
                If <strong>{email}</strong> is registered as a member, a sign-in link is on its way.
                It expires in 15 minutes.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(''); }}
                className="mt-4 text-sm text-emerald-700 hover:text-emerald-600 font-semibold"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-bold text-gray-700 mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              {err && (
                <p className="text-sm text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={13} /> {err}
                </p>
              )}
              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="w-full py-3 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {sending && <Loader2 size={15} className="animate-spin" />}
                {sending ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Member dashboard ───────────────────────────────────────────────────────────

function MemberDashboard({
  slug,
  session,
  onSignOut,
}: {
  slug: string;
  session: MemberSession;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'tee-times' | 'payments'>('tee-times');

  // Tee times state
  const [selectedDate, setSelectedDate] = useState(formatDate(startOfToday()));
  const [calMonth, setCalMonth] = useState(() => {
    const t = startOfToday();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [teeTimes, setTeeTimes] = useState<MemberTeeTime[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [players, setPlayers] = useState(2);
  const [selectedTime, setSelectedTime] = useState<MemberTeeTime | null>(null);

  // Payments state
  const [paymentsData, setPaymentsData] = useState<PaymentsData | null>(null);
  const [loadingPayments, setLoadingPayments] = useState(false);

  const todayStr = formatDate(startOfToday());
  const strip = buildDateStrip();

  const todayMonth = (() => {
    const t = startOfToday();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  })();
  const maxMonth = new Date(todayMonth.getFullYear(), todayMonth.getMonth() + 2, 1);
  const canPrevMonth = calMonth > todayMonth;
  const canNextMonth = calMonth < maxMonth;

  useEffect(() => {
    if (tab !== 'tee-times') return;
    setLoadingTimes(true);
    setSelectedTime(null);
    fetch(`/api/member/${slug}/tee-times?date=${selectedDate}`)
      .then(r => (r.ok ? r.json() : []))
      .then(setTeeTimes)
      .catch(() => setTeeTimes([]))
      .finally(() => setLoadingTimes(false));
  }, [slug, selectedDate, tab]);

  useEffect(() => {
    if (tab !== 'payments' || paymentsData) return;
    setLoadingPayments(true);
    fetch(`/api/member/${slug}/payments`)
      .then(r => (r.ok ? r.json() : null))
      .then(setPaymentsData)
      .catch(() => null)
      .finally(() => setLoadingPayments(false));
  }, [slug, tab, paymentsData]);

  // Pre-compute filtered groups before JSX return
  const morningTimes = useMemo(
    () => teeTimes.filter(t => parseInt(t.time.split(':')[0]) < 12),
    [teeTimes]
  );
  const afternoonTimes = useMemo(
    () => teeTimes.filter(t => {
      const h = parseInt(t.time.split(':')[0]);
      return h >= 12 && h < 16;
    }),
    [teeTimes]
  );
  const twilightTimes = useMemo(
    () => teeTimes.filter(t => parseInt(t.time.split(':')[0]) >= 16),
    [teeTimes]
  );
  const groups = useMemo(() => {
    const g = [
      { key: 'morning', label: 'Morning', items: morningTimes },
      { key: 'afternoon', label: 'Afternoon', items: afternoonTimes },
      { key: 'twilight', label: 'Twilight', items: twilightTimes },
    ];
    return g.filter(x => x.items.length > 0);
  }, [morningTimes, afternoonTimes, twilightTimes]);

  function handleBookMemberTime() {
    if (!selectedTime) return;
    const qp = new URLSearchParams({
      tee_time_id: selectedTime.id,
      course_slug: slug,
      date: selectedDate,
      time: selectedTime.time,
      players: String(players),
      cart: '0',
    });
    router.push(`/book?${qp}`);
  }

  async function handleSignOut() {
    await fetch(`/api/member/${slug}/logout`, { method: 'POST' });
    onSignOut();
  }

  const tierColor = session.tier?.color ?? '#1b4332';

  return (
    <div className="min-h-screen bg-[#f8faf9]">
      {/* Member header bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/courses/${slug}`}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="min-w-0">
              <div
                className="inline-block px-2.5 py-0.5 rounded text-xs font-bold text-white mb-0.5"
                style={{ background: tierColor }}
              >
                {session.tier?.name ?? session.membershipType}
              </div>
              <p className="text-sm font-semibold text-gray-900 truncate">{session.name}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-0">
            {(['tee-times', 'payments'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                  tab === t
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'tee-times' ? (
                  <><CalendarDays size={14} /> Tee Times</>
                ) : (
                  <><CreditCard size={14} /> Payments</>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {tab === 'tee-times' && (
          <div className="grid lg:grid-cols-[240px_1fr] gap-8 items-start">
            {/* Left: calendar + players */}
            <aside>
              <div className="lg:sticky lg:top-20 bg-white rounded-lg border border-gray-100 shadow-sm divide-y divide-gray-100">
                {/* Calendar */}
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() =>
                        setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
                      }
                      disabled={!canPrevMonth}
                      className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-25"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="text-sm font-bold text-gray-900">{monthLabel(calMonth)}</span>
                    <button
                      onClick={() =>
                        setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
                      }
                      disabled={!canNextMonth}
                      className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-25"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 text-center text-[10px] font-bold text-gray-400 uppercase mb-1">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <div key={i}>{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {buildMonthGrid(calMonth).map((d, i) => {
                      if (!d) return <div key={`e${i}`} />;
                      const ds = formatDate(d);
                      const isPast = d < startOfToday();
                      const isSelected = ds === selectedDate;
                      const isToday = ds === todayStr;
                      const base =
                        'aspect-square flex items-center justify-center rounded-md text-xs font-semibold transition-colors';
                      let cls = 'text-gray-700 hover:bg-emerald-50';
                      if (isPast) cls = 'text-gray-300 cursor-default';
                      if (isToday && !isSelected)
                        cls = 'text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50';
                      if (isSelected) cls = 'bg-emerald-600 text-white';
                      return (
                        <button
                          key={ds}
                          disabled={isPast}
                          onClick={() => setSelectedDate(ds)}
                          className={`${base} ${cls}`}
                        >
                          {d.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Players */}
                <div className="px-4 py-4">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                    Players
                  </div>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map(n => (
                      <button
                        key={n}
                        onClick={() => { setPlayers(n); setSelectedTime(null); }}
                        className={`flex-1 py-2 rounded-md border text-sm font-bold transition-all ${
                          players === n
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Member rate legend */}
                {session.tier && (
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                      <Check size={12} />
                      Member rates applied
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {/* Right: tee sheet */}
            <section className="min-w-0">
              {/* Mobile date strip */}
              <div className="lg:hidden mb-4 flex gap-1.5 overflow-x-auto pb-1">
                {strip.map(d => {
                  const ds = formatDate(d);
                  const isSelected = ds === selectedDate;
                  const isToday = ds === todayStr;
                  return (
                    <button
                      key={ds}
                      onClick={() => setSelectedDate(ds)}
                      className={`flex flex-col items-center px-3 py-2 rounded-md text-xs font-semibold min-w-[3.25rem] transition-all ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-700'
                      }`}
                    >
                      <span className="text-[10px] font-medium opacity-70">
                        {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className="text-base font-bold leading-tight">{d.getDate()}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-bold text-gray-900 text-lg">
                  Tee times for{' '}
                  <span className="text-emerald-700">{displayDate(selectedDate)}</span>
                </h2>
                {!loadingTimes && teeTimes.length > 0 && (
                  <span className="text-sm text-gray-400">{teeTimes.length} available</span>
                )}
              </div>

              {loadingTimes ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : teeTimes.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-100 shadow-sm text-center py-14 px-6">
                  <Clock size={28} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-400 text-sm">No tee times available for this date.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {groups.map(g => (
                    <div key={g.key}>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <Clock size={11} /> {g.label}
                      </div>
                      <div className="space-y-2">
                        {g.items.map(t => {
                          const isSel = selectedTime?.id === t.id;
                          const hasSavings =
                            t.has_member_rate && t.member_green_fee < t.green_fee;
                          const savings = hasSavings
                            ? (t.green_fee - t.member_green_fee).toFixed(2)
                            : null;
                          return (
                            <button
                              key={t.id}
                              onClick={() => setSelectedTime(isSel ? null : t)}
                              className={`w-full flex items-center justify-between gap-4 rounded-lg border px-4 sm:px-5 py-3.5 text-left transition-all ${
                                isSel
                                  ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600'
                                  : 'bg-white border-gray-200 hover:border-emerald-500 hover:shadow-sm'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-lg sm:text-xl font-black tracking-tight text-gray-900">
                                  {formatTime(t.time)}
                                </div>
                                <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  <span className={STATUS_COLOR[t.status] || 'text-gray-400'}>
                                    {STATUS_LABEL[t.status] || 'Available'}
                                  </span>
                                  <span className="text-gray-400">· {t.players_available} spots</span>
                                  <span className="text-gray-400">· {t.holes} holes</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
                                <div className="text-right">
                                  <div className="font-bold text-emerald-700 text-base">
                                    ${t.member_green_fee}
                                  </div>
                                  {hasSavings && (
                                    <div className="text-[10px] text-gray-400 line-through">
                                      ${t.green_fee}
                                    </div>
                                  )}
                                  {savings && (
                                    <div className="text-[10px] text-emerald-600 font-semibold">
                                      Save ${savings}
                                    </div>
                                  )}
                                  {!hasSavings && (
                                    <div className="text-[11px] text-gray-400">per player</div>
                                  )}
                                </div>
                                <span
                                  className={`hidden sm:inline-flex px-4 py-2 rounded-md text-xs font-bold transition-colors ${
                                    isSel
                                      ? 'bg-emerald-600 text-white'
                                      : 'border border-emerald-600 text-emerald-700'
                                  }`}
                                >
                                  {isSel ? 'Selected' : 'Select'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'payments' && (
          <div className="max-w-2xl">
            {loadingPayments ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : paymentsData ? (
              <div className="space-y-6">
                {/* Membership status card */}
                <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-6">
                  <h2 className="font-bold text-gray-900 text-base mb-4">Membership</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                        Tier
                      </div>
                      <div className="font-semibold text-gray-900 text-sm">
                        {paymentsData.membership.tierName}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                        Status
                      </div>
                      <PaymentStatusBadge status={paymentsData.membership.paymentStatus} />
                    </div>
                    {paymentsData.membership.expiresAt && (
                      <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                          Expires
                        </div>
                        <div className="font-semibold text-gray-900 text-sm">
                          {new Date(paymentsData.membership.expiresAt).toLocaleDateString(
                            'en-US',
                            { month: 'short', day: 'numeric', year: 'numeric' }
                          )}
                        </div>
                      </div>
                    )}
                    {paymentsData.membership.annualFee > 0 && (
                      <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                          Annual dues
                        </div>
                        <div className="font-semibold text-gray-900 text-sm">
                          ${paymentsData.membership.annualFee.toFixed(2)}
                        </div>
                      </div>
                    )}
                    {paymentsData.membership.initiationFee > 0 && (
                      <div>
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                          Initiation fee
                        </div>
                        <div className="font-semibold text-gray-900 text-sm">
                          ${paymentsData.membership.initiationFee.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment records */}
                <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="font-bold text-gray-900 text-base">Payment History</h2>
                  </div>
                  {paymentsData.records.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-gray-400">
                      No payment records yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {paymentsData.records.map((r, i) => (
                        <div key={i} className="px-6 py-4 flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-gray-900 capitalize">
                              {r.type === 'dues' ? 'Annual Dues' : 'Initiation Fee'} — {r.tierName}
                            </div>
                            {r.date && (
                              <div className="text-xs text-gray-400 mt-0.5">
                                {new Date(r.date).toLocaleDateString('en-US', {
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-bold text-gray-900">${r.amount.toFixed(2)}</div>
                            <PaymentStatusBadge status={r.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-sm text-gray-400">
                Unable to load payment data.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky booking bar */}
      {selectedTime && tab === 'tee-times' && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-6px_24px_rgba(0,0,0,0.08)]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 text-sm sm:text-base">
                {formatTime(selectedTime.time)} · {displayDate(selectedDate)} · {players}{' '}
                {players === 1 ? 'player' : 'players'}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Member rate ${selectedTime.member_green_fee} × {players}
                {selectedTime.has_member_rate && selectedTime.member_green_fee < selectedTime.green_fee
                  ? ` · Saving $${((selectedTime.green_fee - selectedTime.member_green_fee) * players).toFixed(2)} total`
                  : ''}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Total
                </div>
                <div className="font-black text-gray-900 text-xl leading-tight">
                  ${(selectedTime.member_green_fee * players + 1.5 * players).toFixed(2)}
                </div>
              </div>
              <button
                onClick={handleBookMemberTime}
                className="px-6 py-3 rounded-md font-bold text-white text-sm bg-emerald-600 hover:bg-emerald-500 transition-colors"
              >
                Book →
              </button>
              <button
                onClick={() => setSelectedTime(null)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function MemberPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = use(params);
  const sp = use(searchParams);
  const errorParam = sp?.error ?? null;

  const [session, setSession] = useState<MemberSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/member/${slug}/session`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        setSession(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!session) {
    return <SignInPanel slug={slug} errorParam={errorParam} />;
  }

  return (
    <MemberDashboard
      slug={slug}
      session={session}
      onSignOut={() => setSession(null)}
    />
  );
}
