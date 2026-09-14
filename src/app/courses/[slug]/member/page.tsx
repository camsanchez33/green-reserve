'use client';
import { use, useEffect, useMemo, useState, FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Clock, LogOut, CreditCard, CalendarDays,
  ChevronLeft, ChevronRight, Check, AlertCircle, Mail,
  Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StatusDot } from '@/components/ui/StatusDot';

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
  available: 'text-ok',
  limited: 'text-warn',
  almost_full: 'text-bad',
};
const STATUS_LABEL: Record<string, string> = {
  available: 'Available',
  limited: 'Limited',
  almost_full: 'Almost Full',
};

// Dots, not tinted pills — same four states, same words.
function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    paid: { label: 'Paid', tone: 'ok' },
    paid_offline: { label: 'Paid (offline)', tone: 'ok' },
    unpaid: { label: 'Unpaid', tone: 'bad' },
    comped: { label: 'Comped', tone: 'neutral' },
  };
  const s = map[status] ?? { label: status, tone: 'neutral' };
  return <StatusDot status={s.tone} label={s.label} />;
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
    <div className="min-h-screen bg-paper flex flex-col">
      <div className="max-w-md mx-auto w-full px-4 py-16">
        <Link
          href={`/courses/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-soft mb-8"
        >
          <ArrowLeft size={14} />
          Back to course
        </Link>

        <div className="bg-white rounded-lg border border-line p-8">
          <div className="mb-6">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-pine">
              Member Portal
            </span>
            <h1 className="text-2xl font-serif font-medium tracking-tight text-ink mt-1">
              Sign in to your account
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              Enter your email — we&apos;ll send you a one-click sign-in link.
            </p>
          </div>

          {errorParam === 'invalid' && (
            <div className="flex items-start gap-2 bg-bad/5 border border-bad/20 rounded-md p-3 mb-4 text-sm text-bad">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              That sign-in link has expired or is invalid. Request a new one below.
            </div>
          )}
          {errorParam === 'inactive' && (
            <div className="flex items-start gap-2 bg-warn/5 border border-warn/20 rounded-md p-3 mb-4 text-sm text-warn">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              Your membership is inactive. Contact the course for assistance.
            </div>
          )}

          {sent ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-pine/10 mb-4">
                <Mail size={22} className="text-pine" />
              </div>
              <p className="font-semibold text-ink mb-1">Check your email</p>
              <p className="text-sm text-ink-muted">
                If <strong>{email}</strong> is registered as a member, a sign-in link is on its way.
                It expires in 15 minutes.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(''); }}
                className="mt-4 text-sm text-pine hover:text-pine-hover font-semibold"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-ink-soft mb-1.5">
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
                  className="w-full border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10"
                />
              </div>
              {err && (
                <p className="text-sm text-bad flex items-center gap-1.5">
                  <AlertCircle size={13} /> {err}
                </p>
              )}
              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="w-full py-3 rounded-md bg-pine hover:bg-pine-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
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
    <div className="min-h-screen bg-paper">
      {/* Member header bar */}
      <div className="bg-white border-b border-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/courses/${slug}`}
              className="text-ink-muted hover:text-ink-soft flex-shrink-0"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="min-w-0">
              <div
                className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium text-white mb-0.5"
                style={{ background: tierColor }}
              >
                {session.tier?.name ?? session.membershipType}
              </div>
              <p className="text-sm font-semibold text-ink truncate">{session.name}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink-soft flex-shrink-0"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-0">
            {(['tee-times', 'payments'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                  tab === t
                    ? 'border-pine text-pine'
                    : 'border-transparent text-ink-muted hover:text-ink-soft'
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
              <div className="lg:sticky lg:top-20 bg-white rounded-lg border border-line divide-y divide-line">
                {/* Calendar */}
                <div className="px-4 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() =>
                        setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
                      }
                      disabled={!canPrevMonth}
                      className="p-1 rounded text-ink-muted hover:text-ink-soft disabled:opacity-25"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="text-sm font-medium text-ink">{monthLabel(calMonth)}</span>
                    <button
                      onClick={() =>
                        setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
                      }
                      disabled={!canNextMonth}
                      className="p-1 rounded text-ink-muted hover:text-ink-soft disabled:opacity-25"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 text-center text-[10px] font-medium text-ink-muted uppercase mb-1">
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
                      let cls = 'text-ink-soft hover:bg-pine/5';
                      if (isPast) cls = 'text-ink-faint cursor-default';
                      if (isToday && !isSelected)
                        cls = 'text-pine ring-1 ring-pine/20 hover:bg-pine/5';
                      if (isSelected) cls = 'bg-pine text-white';
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
                  <div className="text-xs font-medium text-ink-muted uppercase tracking-[0.06em] mb-2">
                    Players
                  </div>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4].map(n => (
                      <button
                        key={n}
                        onClick={() => { setPlayers(n); setSelectedTime(null); }}
                        className={`flex-1 py-2 rounded-md border text-sm font-medium transition-all ${
                          players === n
                            ? 'border-pine bg-pine/5 text-pine'
                            : 'border-line text-ink-muted hover:border-line-strong'
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
                    <div className="flex items-center gap-1.5 text-xs text-pine font-semibold">
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
                          ? 'bg-pine text-white'
                          : 'bg-white border border-line text-ink-soft'
                      }`}
                    >
                      <span className="text-[10px] font-medium opacity-70">
                        {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className="text-base font-medium leading-tight">{d.getDate()}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-serif font-medium tracking-tight text-ink text-xl">
                  Tee times for{' '}
                  <span className="text-pine">{displayDate(selectedDate)}</span>
                </h2>
                {!loadingTimes && teeTimes.length > 0 && (
                  <span className="text-sm text-ink-muted">{teeTimes.length} available</span>
                )}
              </div>

              {loadingTimes ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 bg-line-soft rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : teeTimes.length === 0 ? (
                <div className="bg-white rounded-lg border border-line text-center py-14 px-6">
                  <Clock size={28} className="mx-auto mb-3 text-ink-faint" />
                  <p className="text-ink-muted text-sm">No tee times available for this date.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {groups.map(g => (
                    <div key={g.key}>
                      <div className="text-xs font-medium text-ink-muted uppercase tracking-[0.06em] mb-2 flex items-center gap-1.5">
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
                                  ? 'border-pine bg-pine/5 ring-1 ring-pine'
                                  : 'bg-white border-line hover:border-pine/40'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-lg sm:text-xl font-serif font-medium tracking-tight text-ink">
                                  {formatTime(t.time)}
                                </div>
                                <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  <span className={STATUS_COLOR[t.status] || 'text-ink-muted'}>
                                    {STATUS_LABEL[t.status] || 'Available'}
                                  </span>
                                  <span className="text-ink-muted">· {t.players_available} spots</span>
                                  <span className="text-ink-muted">· {t.holes} holes</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
                                <div className="text-right">
                                  <div className="font-medium text-pine text-base whitespace-nowrap">
                                    ${t.member_green_fee}<span className="text-ink-muted font-normal"> / player</span>
                                  </div>
                                  {hasSavings && (
                                    <div className="text-[10px] text-ink-muted line-through">
                                      ${t.green_fee}
                                    </div>
                                  )}
                                  {savings && (
                                    <div className="text-[10px] text-ok font-semibold">
                                      Save ${savings}
                                    </div>
                                  )}
                                </div>
                                <span
                                  className={`hidden sm:inline-flex px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                                    isSel
                                      ? 'bg-pine text-white'
                                      : 'border border-pine text-pine'
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
                  <div key={i} className="h-20 bg-line-soft rounded-lg animate-pulse" />
                ))}
              </div>
            ) : paymentsData ? (
              <div className="space-y-6">
                {/* Membership status card */}
                <div className="bg-white rounded-lg border border-line p-6">
                  <h2 className="font-serif font-medium text-ink text-lg mb-4">Membership</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted mb-0.5">
                        Tier
                      </div>
                      <div className="font-semibold text-ink text-sm">
                        {paymentsData.membership.tierName}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted mb-0.5">
                        Status
                      </div>
                      <PaymentStatusBadge status={paymentsData.membership.paymentStatus} />
                    </div>
                    {paymentsData.membership.expiresAt && (
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted mb-0.5">
                          Expires
                        </div>
                        <div className="font-semibold text-ink text-sm">
                          {new Date(paymentsData.membership.expiresAt).toLocaleDateString(
                            'en-US',
                            { month: 'short', day: 'numeric', year: 'numeric' }
                          )}
                        </div>
                      </div>
                    )}
                    {paymentsData.membership.annualFee > 0 && (
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted mb-0.5">
                          Annual dues
                        </div>
                        <div className="font-semibold text-ink text-sm">
                          ${paymentsData.membership.annualFee.toFixed(2)}
                        </div>
                      </div>
                    )}
                    {paymentsData.membership.initiationFee > 0 && (
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted mb-0.5">
                          Initiation fee
                        </div>
                        <div className="font-semibold text-ink text-sm">
                          ${paymentsData.membership.initiationFee.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment records */}
                <div className="bg-white rounded-lg border border-line">
                  <div className="px-6 py-4 border-b border-line">
                    <h2 className="font-serif font-medium text-ink text-lg">Payment history</h2>
                  </div>
                  {paymentsData.records.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-ink-muted">
                      No payment records yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-line">
                      {paymentsData.records.map((r, i) => (
                        <div key={i} className="px-6 py-4 flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-ink capitalize">
                              {r.type === 'dues' ? 'Annual Dues' : 'Initiation Fee'} — {r.tierName}
                            </div>
                            {r.date && (
                              <div className="text-xs text-ink-muted mt-0.5">
                                {new Date(r.date).toLocaleDateString('en-US', {
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-medium text-ink">${r.amount.toFixed(2)}</div>
                            <PaymentStatusBadge status={r.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-sm text-ink-muted">
                Unable to load payment data.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky booking bar */}
      {selectedTime && tab === 'tee-times' && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-line shadow-[0_-6px_24px_rgba(0,0,0,0.08)]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-ink text-sm sm:text-base">
                {formatTime(selectedTime.time)} · {displayDate(selectedDate)} · {players}{' '}
                {players === 1 ? 'player' : 'players'}
              </div>
              <div className="text-xs text-ink-muted mt-0.5">
                Member rate ${selectedTime.member_green_fee} × {players}
                {selectedTime.has_member_rate && selectedTime.member_green_fee < selectedTime.green_fee
                  ? ` · Saving $${((selectedTime.green_fee - selectedTime.member_green_fee) * players).toFixed(2)} total`
                  : ''}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[10px] font-medium text-ink-muted uppercase tracking-[0.06em]">
                  Total
                </div>
                <div className="font-serif font-medium text-ink text-xl leading-tight">
                  ${(selectedTime.member_green_fee * players + 1.5 * players).toFixed(2)}
                </div>
              </div>
              <button
                onClick={handleBookMemberTime}
                className="px-6 py-3 rounded-md font-medium text-white text-sm bg-pine hover:bg-pine-hover transition-colors"
              >
                Book →
              </button>
              <button
                onClick={() => setSelectedTime(null)}
                className="p-2 rounded-md text-ink-muted hover:text-ink-soft hover:bg-line-soft transition-colors text-lg leading-none"
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
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-ok" />
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
