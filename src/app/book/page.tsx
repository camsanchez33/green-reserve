'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements, CardElement, useStripe, useElements,
} from '@stripe/react-stripe-js';
import { ChevronLeft, Lock, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

const ACCESS_FEE_PER_PLAYER = 1.5; // matches ACCESS_FEE_CENTS in src/lib/stripe.ts — display only, server is the source of truth

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
    base: { fontSize: '15px', color: '#111827', '::placeholder': { color: '#9ca3af' } },
    invalid: { color: '#dc2626' },
  },
};

function BookPageInner() {
  const params = useSearchParams();
  const router = useRouter();

  const teeTimeId  = params.get('tee_time_id') || '';
  const courseSlug = params.get('course_slug') || '';
  const date        = params.get('date') || '';
  const requestedPlayers = parseInt(params.get('players') || '2');

  const [course, setCourse]   = useState<CourseInfo | null>(null);
  const [teeTime, setTeeTime] = useState<LiveTeeTime | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [golfer, setGolfer]   = useState<GolferProfile | null>(null);
  const [confirmedData, setConfirmedData] = useState<ConfirmedData | null>(null);
  const [cartSelected, setCartSelected] = useState(false);
  const [rangeBallsSize, setRangeBallsSize] = useState<'' | 'small' | 'medium' | 'large'>('');

  // Re-fetch live course + tee time data — never trust price from the URL
  useEffect(() => {
    if (!courseSlug || !teeTimeId || !date) { setLoadError('Missing booking details.'); setLoadingInfo(false); return; }

    Promise.all([
      fetch(`/api/courses/${courseSlug}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/courses/${courseSlug}/tee-times?date=${date}`).then(r => r.ok ? r.json() : []),
      fetch('/api/golfer/auth/me').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([courseData, teeTimes, golferData]) => {
      if (!courseData) { setLoadError('Course not found.'); setLoadingInfo(false); return; }
      setCourse(courseData);
      if (courseData.cart_required) setCartSelected(true);
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

  if (confirmedData) {
    return (
      <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-3xl border border-gray-100 shadow-sm p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-[#f0fdf4] flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-emerald-500" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">You&apos;re all set!</h1>
          <p className="text-gray-500 mb-8 text-sm">
            {confirmedData.noCard
              ? <>Your spot is reserved — <strong>no card required</strong>. Pay at the course or use the check-in link in your confirmation email.</>
              : <>Your card is on file but <strong>nothing has been charged</strong>. We&apos;ll email you a reminder to check in and pay before your round.</>}
          </p>

          <div className="bg-[#f8faf9] rounded-2xl p-5 mb-8 text-left space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Course</span><span className="font-semibold text-gray-900">{confirmedData.courseName}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Date</span><span className="font-semibold text-gray-900">{displayDate(confirmedData.date)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Tee Time</span><span className="font-semibold text-gray-900">{formatTime(confirmedData.time)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Players</span><span className="font-semibold text-gray-900">{confirmedData.players}</span></div>
            <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-bold text-gray-900">
              <span>Estimated total at check-in</span><span>${confirmedData.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {confirmedData.cancellationFeeTotal > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-8 text-left">
              <p className="text-amber-800 text-xs leading-relaxed">
                Cancel at least {confirmedData.cancellationHours} hours before your tee time to avoid a ${confirmedData.cancellationFeeTotal.toFixed(2)} late-cancellation fee charged to your card on file.
              </p>
            </div>
          )}

          <button onClick={() => router.push('/account')} className="inline-flex items-center justify-center w-full py-4 rounded-xl font-bold text-white text-sm mb-3" style={{ background: '#1b4332' }}>
            View My Bookings
          </button>
          <button onClick={() => router.push('/courses')} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            Back to course search
          </button>
        </div>
      </div>
    );
  }

  if (loadingInfo) {
    return <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  if (loadError || !teeTime || !course) {
    return (
      <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h1 className="font-bold text-gray-900 mb-2">Can&apos;t complete this booking</h1>
          <p className="text-gray-500 text-sm mb-6">{loadError || 'This tee time is no longer available.'}</p>
          <button onClick={() => router.push(courseSlug ? `/courses/${courseSlug}` : '/courses')} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#1b4332' }}>
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

  // No-fee policy courses: skip card collection entirely.
  // late_cancellation_fee may be 0 (explicit) or null (never set) — both mean no fee.
  const hasNoFeePolicy = !course.late_cancellation_fee;

  return (
    <div className="min-h-screen bg-[#f8faf9]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-6 transition-colors">
          <ChevronLeft size={16} /> Back to tee times
        </button>

        <h1 className="text-2xl font-black text-gray-900 mb-2">Confirm Your Tee Time</h1>
        <p className="text-gray-500 text-sm mb-8">
          {hasNoFeePolicy
            ? <>Lock in your tee time at {course.name} — no card required.</>
            : <>Save your card to lock in your tee time at {course.name} — you won&apos;t be charged today.</>}
        </p>

        <div className="grid gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-14 flex items-center px-6" style={{ background: 'linear-gradient(135deg,#0f2218,#1b4332)' }}>
              <span className="text-white font-bold">{course.name}</span>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Date</span><span className="font-semibold text-gray-900">{displayDate(date)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Tee Time</span><span className="font-semibold text-gray-900">{formatTime(teeTime.time)}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Players</span><span className="font-semibold text-gray-900">{players}</span></div>

              {teeTime.cart_fee > 0 && (
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <div>
                    <p className="font-medium text-gray-900">Cart</p>
                    <p className="text-xs text-gray-400">${teeTime.cart_fee.toFixed(2)} per player</p>
                  </div>
                  {course.cart_required ? (
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">Required</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCartSelected(s => !s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${cartSelected ? 'bg-[#1b4332] text-white' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {cartSelected ? 'Added' : 'Add cart'}
                    </button>
                  )}
                </div>
              )}

              {course.has_driving_range && !course.range_balls_free && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="font-medium text-gray-900 mb-2">Range balls (optional)</p>
                  <div className="grid grid-cols-4 gap-2">
                    {(['', 'small', 'medium', 'large'] as const).map(size => (
                      <button
                        key={size || 'none'}
                        type="button"
                        onClick={() => setRangeBallsSize(size)}
                        className={`py-2 rounded-lg text-xs font-semibold capitalize transition-colors ${rangeBallsSize === size ? 'bg-[#1b4332] text-white' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {size || 'None'}
                      </button>
                    ))}
                  </div>
                  {rangeBallsSize && (
                    <p className="text-xs text-gray-400 mt-1.5">${rangeBallsPrice.toFixed(2)} — added to your check-in total</p>
                  )}
                </div>
              )}
              {course.has_driving_range && course.range_balls_free && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs text-emerald-700 bg-[#f0fdf4] inline-block px-2.5 py-1 rounded-full font-medium">Range balls included, free of charge</p>
                </div>
              )}

              <div className="border-t border-gray-100 pt-3 space-y-2">
                <div className="flex justify-between text-gray-500"><span>Green fee (×{players})</span><span>${greenTotal.toFixed(2)}</span></div>
                {cartTotal > 0 && <div className="flex justify-between text-gray-500"><span>Cart fee (×{players})</span><span>${cartTotal.toFixed(2)}</span></div>}
                {rangeBallsTotal > 0 && <div className="flex justify-between text-gray-500"><span>Range balls ({rangeBallsSize})</span><span>${rangeBallsTotal.toFixed(2)}</span></div>}
                <div className="flex justify-between text-gray-500">
                  <span>Fees</span>
                  <span>${accessTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-100 pt-2">
                  <span>Estimated total at check-in</span><span>${total.toFixed(2)}</span>
                </div>
                <p className="text-xs text-gray-400 pt-1">Nothing is charged today. You&apos;ll pay this when you check in for your round.</p>
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
              onConfirmed={setConfirmedData}
            />
          ) : (
            <Elements stripe={stripePromise}>
              <CheckoutForm
                teeTimeId={teeTime.id}
                players={players}
                golfer={golfer}
                cartSelected={cartSelected}
                rangeBallsSize={rangeBallsTotal > 0 ? rangeBallsSize : ''}
                onConfirmed={setConfirmedData}
              />
            </Elements>
          )}

          <div className="bg-[#f0fdf4] rounded-2xl p-5 border border-emerald-100">
            <p className="text-emerald-800 text-sm font-medium mb-1">How this works</p>
            {hasNoFeePolicy ? (
              <p className="text-emerald-700 text-xs leading-relaxed">
                No card required. Book your spot now and pay at the course when you check in — or use the check-in link in your confirmation email to pay online before your round.
              </p>
            ) : (
              <p className="text-emerald-700 text-xs leading-relaxed">
                We save your card to hold your tee time — you&apos;re not charged now. Cancel at least {course.cancellation_hours} hours ahead and it&apos;s free; cancelling later (or no-showing) triggers a ${course.late_cancellation_fee.toFixed(2)} late-cancellation fee. Otherwise, you pay for your round when you check in at the course.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutForm({ teeTimeId, players, golfer, cartSelected, rangeBallsSize, onConfirmed }: {
  teeTimeId: string;
  players: number;
  golfer: GolferProfile | null;
  cartSelected: boolean;
  rangeBallsSize: string;
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
      // Create a SetupIntent server-side (no charge), then confirm it with the card
      // the golfer entered — this saves the card for later off-session use (the
      // cancellation-fee cron, and eventually check-in) instead of charging now.
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

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
      <h2 className="font-bold text-gray-900">Your Details</h2>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="John Smith"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#1b4332] focus:ring-2 focus:ring-[#1b4332]/10 transition-all" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#1b4332] focus:ring-2 focus:ring-[#1b4332]/10 transition-all" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone (optional)</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#1b4332] focus:ring-2 focus:ring-[#1b4332]/10 transition-all" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Card Details</label>
        <div className="w-full px-4 py-3.5 rounded-xl border border-gray-200 focus-within:border-[#1b4332] focus-within:ring-2 focus-within:ring-[#1b4332]/10 transition-all">
          <CardElement options={cardStyle} />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Your card is saved, not charged. You&apos;ll pay when you check in for your round.</p>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={loading || !stripe}
        className="w-full py-4 rounded-xl font-bold text-white text-sm transition-all hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ background: '#1b4332' }}
      >
        {loading ? <><Loader2 size={16} className="animate-spin" /> Saving card…</> : 'Confirm Tee Time'}
      </button>
      <div className="flex items-center justify-center gap-2 text-gray-400 text-xs">
        <Lock size={12} />
        <span>Secure checkout powered by Stripe</span>
      </div>
    </div>
  );
}

/** No-card booking form for courses with no cancellation fee policy. */
function SimpleConfirmForm({ teeTimeId, players, golfer, cartSelected, rangeBallsSize, onConfirmed }: {
  teeTimeId: string; players: number; golfer: GolferProfile | null;
  cartSelected: boolean; rangeBallsSize: string;
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
      <h2 className="font-bold text-gray-900">Your Details</h2>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="John Smith"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#1b4332] focus:ring-2 focus:ring-[#1b4332]/10 transition-all" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#1b4332] focus:ring-2 focus:ring-[#1b4332]/10 transition-all" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone (optional)</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#1b4332] focus:ring-2 focus:ring-[#1b4332]/10 transition-all" />
        </div>
      </div>
      <p className="text-xs text-gray-400">No card needed — you&apos;ll pay at the course or via the check-in link in your confirmation email.</p>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-4 rounded-xl font-bold text-white text-sm transition-all hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ background: '#1b4332' }}
      >
        {loading ? <><Loader2 size={16} className="animate-spin" /> Reserving spot…</> : 'Reserve Tee Time'}
      </button>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f8faf9]" />}>
      <BookPageInner />
    </Suspense>
  );
}
