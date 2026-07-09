'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import {
  Elements, CardElement, useStripe, useElements,
} from '@stripe/react-stripe-js';
import { ChevronLeft, Lock, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { ACCESS_FEE_PER_PLAYER, serviceFeeLabel } from '@/lib/booking-fees';

// Deferred: only load Stripe when a card is actually needed (fee-policy courses).
// No-fee courses never touch Stripe JS at all.
let _stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!_stripePromise) _stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');
  return _stripePromise;
}

type LiveTeeTime = {
  id: string; date: string; time: string; holes: number;
  players_available: number; green_fee: number; cart_fee: number; status: string;
};
type CourseInfo = {
  name: string; city: string; state: string; address: string;
  cart_required: boolean;
  has_driving_range: boolean;
  range_balls_free: boolean;
  range_balls_small_price: number;
  range_balls_medium_price: number;
  range_balls_large_price: number;
  cancellation_hours: number;
  late_cancellation_fee: number;
  brand_color?: string;
};
type GolferProfile = { firstName: string; lastName: string; email: string; phone: string };
type ConfirmedData = {
  courseName: string; date: string; time: string; players: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number;
  cancellationFeeTotal: number; cancellationHours: number;
  noCard?: boolean;
};

function formatTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}
function displayDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const cardStyle = {
  style: {
    base: { fontSize: '15px', color: '#1C1C18', '::placeholder': { color: '#98968B' } },
    invalid: { color: '#A3452F' },
  },
};

const iCls = "w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors";
const lCls = "block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5";

function BookPageInner() {
  const params = useSearchParams();
  const router = useRouter();

  const teeTimeId  = params.get('tee_time_id') || '';
  const courseSlug = params.get('course_slug') || '';
  const date        = params.get('date') || '';
  const requestedPlayers = parseInt(params.get('players') || '2');
  const cartParam = params.get('cart') === '1';

  const [course, setCourse]   = useState<CourseInfo | null>(null);
  const [teeTime, setTeeTime] = useState<LiveTeeTime | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [golfer, setGolfer]   = useState<GolferProfile | null>(null);
  const [confirmedData, setConfirmedData] = useState<ConfirmedData | null>(null);
  const [cartSelected, setCartSelected] = useState(false);
  const [rangeBallsSize, setRangeBallsSize] = useState<'' | 'small' | 'medium' | 'large'>('');

  useEffect(() => {
    if (!courseSlug || !teeTimeId || !date) { setLoadError('Missing booking details.'); setLoadingInfo(false); return; }

    Promise.all([
      fetch(`/api/courses/${courseSlug}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/courses/${courseSlug}/tee-times?date=${date}`).then(r => r.ok ? r.json() : []),
      fetch('/api/golfer/auth/me').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([courseData, teeTimes, golferData]) => {
      if (!courseData) { setLoadError('Course not found.'); setLoadingInfo(false); return; }
      setCourse(courseData);
      if (courseData.cart_required || cartParam) setCartSelected(true);
      const match = Array.isArray(teeTimes) ? teeTimes.find((t: LiveTeeTime) => String(t.id) === String(teeTimeId)) : null;
      if (!match) {
        setLoadError('This tee time is no longer available. Please pick another.');
      } else {
        setTeeTime(match);
      }
      if (golferData) setGolfer(golferData);
      setLoadingInfo(false);
    }).catch(() => { setLoadError('Something went wrong loading this tee time.'); setLoadingInfo(false); });
  }, [courseSlug, teeTimeId, date]);

  const accent = course?.brand_color || '#24513B';

  if (confirmedData) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-lg border border-line p-10 text-center">
          <div className="w-16 h-16 rounded-lg bg-ok/8 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-ok" />
          </div>
          <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-2">You&apos;re all set!</h1>
          <p className="text-ink-soft mb-8 text-sm">
            {confirmedData.noCard
              ? <>Your spot is reserved — <strong className="text-ink">no card required</strong>. Pay at the course or use the check-in link in your confirmation email.</>
              : <>Your card is on file but <strong className="text-ink">nothing has been charged</strong>. We&apos;ll email you a reminder to check in and pay before your round.</>}
          </p>

          <div className="bg-paper rounded-lg p-5 mb-8 text-left space-y-2 text-sm border border-line">
            <div className="flex justify-between"><span className="text-ink-muted">Course</span><span className="font-medium text-ink">{confirmedData.courseName}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Date</span><span className="font-medium text-ink">{displayDate(confirmedData.date)}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Tee Time</span><span className="font-medium text-ink">{formatTime(confirmedData.time)}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Players</span><span className="font-medium text-ink">{confirmedData.players}</span></div>
            <div className="border-t border-line mt-2 pt-2 space-y-1.5">
              <div className="flex justify-between text-ink-soft"><span>Green Fee</span><span>${confirmedData.greenFeeTotal.toFixed(2)}</span></div>
              {confirmedData.cartFeeTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Cart Fee</span><span>${confirmedData.cartFeeTotal.toFixed(2)}</span></div>}
              {confirmedData.rangeBallsTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Range Balls</span><span>${confirmedData.rangeBallsTotal.toFixed(2)}</span></div>}
              <div className="flex justify-between text-ink-soft"><span>{serviceFeeLabel(confirmedData.players)}</span><span>${confirmedData.accessFeeTotal.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold text-ink border-t border-line pt-2">
                <span>Estimated total at check-in</span><span>${confirmedData.totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {confirmedData.cancellationFeeTotal > 0 && (
            <div className="bg-warn/5 border border-warn/20 rounded-lg p-4 mb-8 text-left">
              <p className="text-warn text-xs leading-relaxed">
                Cancel at least {confirmedData.cancellationHours} hours before your tee time to avoid a ${confirmedData.cancellationFeeTotal.toFixed(2)} late-cancellation fee charged to your card on file.
              </p>
            </div>
          )}

          <button
            onClick={() => router.push('/account')}
            className="inline-flex items-center justify-center w-full py-3.5 rounded-md font-medium text-white text-sm mb-3 transition-colors"
            style={{ backgroundColor: accent }}
          >
            View My Bookings
          </button>
          <button onClick={() => router.push('/')} className="text-sm text-ink-muted hover:text-ink-soft transition-colors">
            Back to home
          </button>
        </div>
      </div>
    );
  }

  if (loadingInfo) {
    return <div className="min-h-screen bg-paper flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink-muted" /></div>;
  }

  if (loadError || !teeTime || !course) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-line p-8 text-center">
          <AlertCircle className="w-10 h-10 text-bad mx-auto mb-4" />
          <h1 className="font-semibold text-ink mb-2">Can&apos;t complete this booking</h1>
          <p className="text-ink-soft text-sm mb-6">{loadError || 'This tee time is no longer available.'}</p>
          <button
            onClick={() => router.push(courseSlug ? `/courses/${courseSlug}` : '/')}
            className="px-5 py-2.5 rounded-md text-sm font-medium text-white bg-pine hover:bg-pine-hover transition-colors"
          >
            Pick Another Time
          </button>
        </div>
      </div>
    );
  }

  const players = Math.min(requestedPlayers, Math.max(teeTime.players_available, 1));
  const greenTotal  = teeTime.green_fee * players;
  const cartTotal    = cartSelected ? teeTime.cart_fee * players : 0;
  const rangeBallsPrice = rangeBallsSize === 'small' ? course.range_balls_small_price
    : rangeBallsSize === 'medium' ? course.range_balls_medium_price
    : rangeBallsSize === 'large' ? course.range_balls_large_price
    : 0;
  const rangeBallsTotal = course.range_balls_free ? 0 : rangeBallsPrice;
  const accessTotal  = ACCESS_FEE_PER_PLAYER * players;
  const total         = greenTotal + cartTotal + rangeBallsTotal + accessTotal;

  const hasNoFeePolicy = !course.late_cancellation_fee;

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-ink-soft hover:text-ink text-sm mb-6 transition-colors">
          <ChevronLeft size={16} /> Back to tee times
        </button>

        <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-2">Confirm Your Tee Time</h1>
        <p className="text-ink-soft text-sm mb-8">
          {hasNoFeePolicy
            ? <>Lock in your tee time at {course.name} — no card required.</>
            : <>Save your card to lock in your tee time at {course.name} — you won&apos;t be charged today.</>}
        </p>

        <div className="grid gap-6">
          <div className="bg-white rounded-lg border border-line overflow-hidden">
            <div className="h-14 flex items-center px-6" style={{ backgroundColor: accent }}>
              <span className="text-white font-medium">{course.name}</span>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Date</span><span className="font-medium text-ink">{displayDate(date)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Tee Time</span><span className="font-medium text-ink">{formatTime(teeTime.time)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Players</span><span className="font-medium text-ink">{players}</span></div>

              {teeTime.cart_fee > 0 && (
                <div className="flex items-center justify-between border-t border-line pt-3">
                  <div>
                    <p className="font-medium text-ink">Cart</p>
                    <p className="text-xs text-ink-muted">${teeTime.cart_fee.toFixed(2)} per player</p>
                  </div>
                  {course.cart_required ? (
                    <span className="text-xs font-medium text-ink-muted bg-paper px-2.5 py-1 rounded-md border border-line">Required</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCartSelected(s => !s)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                      style={cartSelected ? { backgroundColor: accent, color: '#fff' } : { backgroundColor: '#F0EDE2', color: '#6E6D64' }}
                    >
                      {cartSelected ? 'Added' : 'Add cart'}
                    </button>
                  )}
                </div>
              )}

              {course.has_driving_range && !course.range_balls_free && (
                <div className="border-t border-line pt-3">
                  <p className="font-medium text-ink mb-2">Range balls (optional)</p>
                  <div className="grid grid-cols-4 gap-2">
                    {(['', 'small', 'medium', 'large'] as const).map(size => (
                      <button
                        key={size || 'none'}
                        type="button"
                        onClick={() => setRangeBallsSize(size)}
                        className="py-2 rounded-md text-xs font-medium capitalize transition-colors"
                        style={rangeBallsSize === size ? { backgroundColor: accent, color: '#fff' } : { backgroundColor: '#F0EDE2', color: '#6E6D64' }}
                      >
                        {size || 'None'}
                      </button>
                    ))}
                  </div>
                  {rangeBallsSize && (
                    <p className="text-xs text-ink-muted mt-1.5">${rangeBallsPrice.toFixed(2)} — added to your check-in total</p>
                  )}
                </div>
              )}
              {course.has_driving_range && course.range_balls_free && (
                <div className="border-t border-line pt-3">
                  <p className="text-xs text-pine bg-pine/5 inline-block px-2.5 py-1 rounded-md font-medium border border-pine/20">Range balls included, free of charge</p>
                </div>
              )}

              <div className="border-t border-line pt-3 space-y-2">
                <div className="flex justify-between text-ink-soft"><span>Green fee (×{players})</span><span>${greenTotal.toFixed(2)}</span></div>
                {cartTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Cart fee (×{players})</span><span>${cartTotal.toFixed(2)}</span></div>}
                {rangeBallsTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Range balls ({rangeBallsSize})</span><span>${rangeBallsTotal.toFixed(2)}</span></div>}
                <div className="flex justify-between text-ink-soft">
                  <span>{serviceFeeLabel(players)}</span>
                  <span>${accessTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-ink text-base border-t border-line pt-2">
                  <span>Estimated total at check-in</span><span>${total.toFixed(2)}</span>
                </div>
                <p className="text-xs text-ink-muted pt-1">Nothing is charged today. You&apos;ll pay this when you check in for your round.</p>
                <p className="text-xs text-ink-muted pt-0.5">The service fee supports online booking. Green fees go 100% to the course.</p>
              </div>
            </div>
          </div>

          {hasNoFeePolicy ? (
            <SimpleConfirmForm
              teeTimeId={teeTime.id}
              players={players}
              golfer={golfer}
              cartSelected={cartSelected}
              rangeBallsSize={rangeBallsTotal > 0 ? rangeBallsSize : ''}
              accent={accent}
              onConfirmed={setConfirmedData}
            />
          ) : (
            <Elements stripe={getStripePromise()}>
              <CheckoutForm
                teeTimeId={teeTime.id}
                players={players}
                golfer={golfer}
                cartSelected={cartSelected}
                rangeBallsSize={rangeBallsTotal > 0 ? rangeBallsSize : ''}
                accent={accent}
                onConfirmed={setConfirmedData}
              />
            </Elements>
          )}

          <div className="bg-pine/5 rounded-lg p-5 border border-pine/20">
            <p className="text-pine text-sm font-medium mb-1">How this works</p>
            {hasNoFeePolicy ? (
              <p className="text-pine/80 text-xs leading-relaxed">
                No card required. Book your spot now and pay at the course when you check in — or use the check-in link in your confirmation email to pay online before your round.
              </p>
            ) : (
              <p className="text-pine/80 text-xs leading-relaxed">
                We save your card to hold your tee time — you&apos;re not charged now. Cancel at least {course.cancellation_hours} hours ahead and it&apos;s free; cancelling later (or no-showing) triggers a ${course.late_cancellation_fee.toFixed(2)} late-cancellation fee. Otherwise, you pay for your round when you check in at the course.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutForm({ teeTimeId, players, golfer, cartSelected, rangeBallsSize, accent, onConfirmed }: {
  teeTimeId: string;
  players: number;
  golfer: GolferProfile | null;
  cartSelected: boolean;
  rangeBallsSize: string;
  accent: string;
  onConfirmed: (data: ConfirmedData) => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();

  const [name, setName]   = useState(golfer ? `${golfer.firstName} ${golfer.lastName}`.trim() : '');
  const [email, setEmail] = useState(golfer?.email || '');
  const [phone, setPhone] = useState(golfer?.phone || '');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (golfer) {
      setName(`${golfer.firstName} ${golfer.lastName}`.trim());
      setEmail(golfer.email);
      setPhone(golfer.phone || '');
    }
  }, [golfer]);

  async function handleSubmit() {
    setError('');
    if (!name.trim() || !email.trim()) { setError('Please enter your name and email.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email address.'); return; }
    if (!stripe || !elements) { setError('Payment form is still loading — try again in a moment.'); return; }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) { setError('Card details are required.'); return; }

    setLoading(true);
    try {
      const siRes = await fetch('/api/bookings/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const siData = await siRes.json();
      if (!siRes.ok) { setError(siData.error || 'Could not prepare card setup.'); setLoading(false); return; }

      const { error: setupError, setupIntent } = await stripe.confirmCardSetup(siData.clientSecret, {
        payment_method: { card: cardElement, billing_details: { name, email } },
      });
      if (setupError) { setError(setupError.message || 'Your card could not be saved.'); setLoading(false); return; }

      const paymentMethodId = typeof setupIntent?.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent?.payment_method?.id;
      if (!paymentMethodId) { setError('Your card could not be saved. Please try again.'); setLoading(false); return; }

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teeTimeId,
          players,
          golferName: name,
          golferEmail: email,
          golferPhone: phone,
          paymentMethodId,
          customerId: siData.customerId,
          cartSelected,
          rangeBallsSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong. Please try again.'); setLoading(false); return; }

      onConfirmed({
        courseName: data.courseName, date: data.date, time: data.time, players: data.players,
        greenFeeTotal: data.greenFeeTotal, cartFeeTotal: data.cartFeeTotal, rangeBallsTotal: data.rangeBallsTotal,
        accessFeeTotal: data.accessFeeTotal, totalAmount: data.totalAmount,
        cancellationFeeTotal: data.cancellationFeeTotal, cancellationHours: data.cancellationHours ?? 24,
      });
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  // INVIOLABLE: No GolferAccount required to book. Name/email are for the
  // confirmation email only — never for registration or sign-up prompts.
  return (
    <div className="bg-white rounded-lg border border-line p-6 space-y-4">
      <h2 className="font-semibold text-ink">Your Details</h2>
      <div>
        <label className={lCls}>Full Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" className={iCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lCls}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" className={iCls} />
        </div>
        <div>
          <label className={lCls}>Phone (optional)</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" className={iCls} />
        </div>
      </div>

      <div>
        <label className={lCls}>Card Details</label>
        <div className="w-full px-4 py-3.5 rounded-md border border-line bg-paper focus-within:border-pine/40 focus-within:ring-2 focus-within:ring-pine/10 transition-all">
          <CardElement options={cardStyle} />
        </div>
        <p className="text-xs text-ink-muted mt-1.5">Your card is saved, not charged. You&apos;ll pay when you check in for your round.</p>
      </div>

      {error && <p className="text-bad text-sm">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={loading || !stripe}
        className="w-full py-3.5 rounded-md font-medium text-white text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ backgroundColor: accent }}
      >
        {loading ? <><Loader2 size={16} className="animate-spin" /> Saving card…</> : 'Confirm Tee Time'}
      </button>
      <div className="flex items-center justify-center gap-2 text-ink-muted text-xs">
        <Lock size={12} />
        <span>Secure checkout powered by Stripe</span>
      </div>
    </div>
  );
}

function SimpleConfirmForm({ teeTimeId, players, golfer, cartSelected, rangeBallsSize, accent, onConfirmed }: {
  teeTimeId: string; players: number; golfer: GolferProfile | null;
  cartSelected: boolean; rangeBallsSize: string;
  accent: string;
  onConfirmed: (data: ConfirmedData) => void;
}) {
  const [name, setName]   = useState(golfer ? `${golfer.firstName} ${golfer.lastName}`.trim() : '');
  const [email, setEmail] = useState(golfer?.email || '');
  const [phone, setPhone] = useState(golfer?.phone || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (golfer) {
      setName(`${golfer.firstName} ${golfer.lastName}`.trim());
      setEmail(golfer.email);
      setPhone(golfer.phone || '');
    }
  }, [golfer]);

  async function handleSubmit() {
    setError('');
    if (!name.trim() || !email.trim()) { setError('Please enter your name and email.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email address.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teeTimeId, players, golferName: name, golferEmail: email, golferPhone: phone, cartSelected, rangeBallsSize }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong. Please try again.'); setLoading(false); return; }
      onConfirmed({
        courseName: data.courseName, date: data.date, time: data.time, players: data.players,
        greenFeeTotal: data.greenFeeTotal, cartFeeTotal: data.cartFeeTotal, rangeBallsTotal: data.rangeBallsTotal,
        accessFeeTotal: data.accessFeeTotal, totalAmount: data.totalAmount,
        cancellationFeeTotal: data.cancellationFeeTotal, cancellationHours: data.cancellationHours ?? 24,
        noCard: true,
      });
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-line p-6 space-y-4">
      <h2 className="font-semibold text-ink">Your Details</h2>
      <div>
        <label className={lCls}>Full Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="John Smith" className={iCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lCls}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" className={iCls} />
        </div>
        <div>
          <label className={lCls}>Phone (optional)</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" className={iCls} />
        </div>
      </div>
      <p className="text-xs text-ink-muted">No card needed — you&apos;ll pay at the course or via the check-in link in your confirmation email.</p>
      {error && <p className="text-bad text-sm">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-3.5 rounded-md font-medium text-white text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ backgroundColor: accent }}
      >
        {loading ? <><Loader2 size={16} className="animate-spin" /> Reserving spot…</> : 'Reserve Tee Time'}
      </button>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <BookPageInner />
    </Suspense>
  );
}
