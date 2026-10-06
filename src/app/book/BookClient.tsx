'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, Suspense } from 'react';
// SP-B: the /pure entry injects Stripe.js only when loadStripe() is called — the
// main entry injects it on import, which loaded Stripe even on no-card courses.
import { loadStripe } from '@stripe/stripe-js/pure';
import type { Stripe } from '@stripe/stripe-js';
import {
  Elements, CardElement, PaymentRequestButtonElement, useStripe, useElements,
} from '@stripe/react-stripe-js';
import type { PaymentRequest } from '@stripe/stripe-js';
import { Loader2 } from 'lucide-react';
import { ACCESS_FEE_PER_PLAYER, serviceFeeLabel, hoursLabel } from '@/lib/booking-fees';
import { TrustNote } from '@/components/TrustNote';
import { CourseHeaderBar } from '@/components/CourseHeaderBar';
import { describePolicy, policyFrom, type CancelPolicy } from '@/lib/cancel-policy';

// Deferred: only load Stripe when a card is actually needed (fee-policy courses).
// No-fee courses never touch Stripe JS at all.
let _stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!_stripePromise) _stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');
  return _stripePromise;
}

export type LiveTeeTime = {
  id: string; date: string; time: string; holes: number; product_label?: string | null;
  players_available: number; green_fee: number; cart_fee: number; status: string;
};
export type CourseInfo = {
  name: string; city: string; state: string; address: string;
  cart_required: boolean;
  has_driving_range: boolean;
  range_balls_free: boolean;
  range_balls_small_price: number;
  range_balls_medium_price: number;
  range_balls_large_price: number;
  cancellation_hours: number;
  late_cancellation_fee: number;
  /** SP-B: the full policy (cents). Older payloads fall back to the two fields above. */
  cancel_policy?: CancelPolicy;
  brand_color?: string;
  /** PERS-1: the course's own uploads, shown in the header band. */
  hero_image_url?: string; logo_url?: string;
  /** PERS-1: optional note shown once the tee time is confirmed. */
  confirmation_note?: string;
};
type GolferProfile = { firstName: string; lastName: string; email: string; phone: string };
type ConfirmedData = {
  courseName: string; date: string; time: string; players: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number;
  cancellationFeeTotal: number; cancellationHours: number;
  noCard?: boolean;
  golferEmail: string;
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
// Formatting only: turns the policy's "24 hours before" into the actual moment
// the free-cancel window shuts, so nobody has to do date arithmetic in their head.
// The tee time is a wall-clock time at the COURSE. The arithmetic runs on UTC
// components and formats in UTC so the browser's own timezone never shifts the
// answer — a golfer in Denver booking a New York course sees New York's deadline.
// (Review fix: the first cut parsed the wall clock as browser-local time.)
function deadlineLabel(dateStr: string, timeStr: string, hoursBefore: number) {
  if (!dateStr || !timeStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.slice(0, 5).split(':').map(Number);
  if ([y, m, d, hh, mm].some(n => Number.isNaN(n))) return '';
  const cutoff = new Date(Date.UTC(y, m - 1, d, hh, mm) - hoursBefore * 3600_000);
  const day = cutoff.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const clock = cutoff.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  return `${day} at ${clock} (course time)`;
}

// The reserve screen's two sections. CLUB-5 (Cam 2026-10-05, "drop the
// numbers"): headed by name alone — no numbered circles.
function StepHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div>
      <h2 className="font-serif text-ink text-[22px] leading-none">{title}</h2>
      {note && <p className="text-[13px] text-ink mt-1.5">{note}</p>}
    </div>
  );
}

// One step of the confirmation timeline — a dot, a rule, a line of plain English.
function TimelineStep({ when, what, last = false, accent }: {
  when: string; what: React.ReactNode; last?: boolean; accent: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-1">
        <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ backgroundColor: accent }} />
        {!last && <span className="w-px flex-1 mt-1" style={{ backgroundColor: '#E6E3D7' }} />}
      </div>
      <div className={last ? 'pb-0' : 'pb-4'}>
        <div className="text-[13px] font-semibold text-ink">{when}</div>
        <div className="text-sm text-ink mt-0.5 leading-relaxed">{what}</div>
      </div>
    </div>
  );
}

const cardStyle = {
  style: {
    base: { fontSize: '15px', color: '#141814', '::placeholder': { color: '#979B94' } },
    invalid: { color: '#A3452F' },
  },
};

const iCls = "w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors";
const lCls = "block text-[13px] font-semibold text-ink mb-1.5";

// PERF-1: what the server already loaded for this URL (see ./page.tsx). When
// present the page renders the tee time in its first HTML; the course and tee
// time are not fetched again. Undefined = load in the browser as before.
export type BookInitial = { course: CourseInfo | null; teeTime: LiveTeeTime | null; error: string };

function BookPageInner({ initial }: { initial?: BookInitial }) {
  const params = useSearchParams();
  const router = useRouter();

  const teeTimeId  = params.get('tee_time_id') || '';
  const courseSlug = params.get('course_slug') || '';
  const date        = params.get('date') || '';
  const requestedPlayers = parseInt(params.get('players') || '2');
  const cartParam = params.get('cart') === '1';

  const [course, setCourse]   = useState<CourseInfo | null>(initial?.course ?? null);
  const [teeTime, setTeeTime] = useState<LiveTeeTime | null>(initial?.teeTime ?? null);
  const [loadError, setLoadError] = useState(initial?.error ?? '');
  const [loadingInfo, setLoadingInfo] = useState(!initial);
  const [golfer, setGolfer]   = useState<GolferProfile | null>(null);
  const [confirmedData, setConfirmedData] = useState<ConfirmedData | null>(null);
  const [cartSelected, setCartSelected] = useState(!!(initial?.course?.cart_required || cartParam));
  const [rangeBallsSize, setRangeBallsSize] = useState<'' | 'small' | 'medium' | 'large'>('');

  useEffect(() => {
    if (initial) {
      // Server sent the course + tee time; only the signed-in golfer is left.
      fetch('/api/golfer/auth/me').then(r => r.ok ? r.json() : null).then(g => { if (g) setGolfer(g); }).catch(() => {});
      return;
    }
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

  const accent = course?.brand_color || '#173B2A';

  if (confirmedData) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
          <CourseHeaderBar courseName={confirmedData.courseName} accent={accent} photoUrl={course?.hero_image_url} logoUrl={course?.logo_url} />
          <div className="p-8 text-center">
            <h1 className="text-[34px] font-serif leading-none text-ink mb-3">You&apos;re all set</h1>
            <p className="text-ink-soft mb-6 text-sm">
              {confirmedData.noCard
                ? <>Your spot is reserved — <strong className="text-ink">no card required</strong>. Pay at the course or use the check-in link in your confirmation email.</>
                : <>Your card is on file but <strong className="text-ink">nothing has been charged</strong>. We&apos;ll email you a reminder to check in and pay before your round.</>}
            </p>

            {/* PERS-1: the course's own note, in its own words — left-aligned, its colour on the rule. */}
            {course?.confirmation_note && (
              <div className="text-left mb-6 pl-4 border-l-[3px]" style={{ borderColor: accent }}>
                <div className="text-[13px] font-semibold text-ink mb-1">From {confirmedData.courseName}</div>
                <p className="text-sm text-ink whitespace-pre-line">{course.confirmation_note}</p>
              </div>
            )}

            {/* What happens next — the same three facts the policy copy already
                states, laid out in the order they actually happen. */}
            <div className="rounded-lg border border-line p-5 mb-6 text-left">
              <div className="text-[15px] font-semibold text-ink mb-4">What happens next</div>
              <TimelineStep
                accent={accent}
                when="Today"
                what={<>Booked · <strong className="text-ink font-medium">charged today $0.00</strong></>}
              />
              <TimelineStep
                accent={accent}
                when={confirmedData.cancellationFeeTotal > 0 ? 'Free to cancel until' : 'Any time before your round'}
                what={confirmedData.cancellationFeeTotal > 0
                  ? <>
                      {deadlineLabel(confirmedData.date, confirmedData.time, confirmedData.cancellationHours) || `${hoursLabel(confirmedData.cancellationHours)} before your tee time`}
                      <span className="block text-ink text-xs mt-0.5">
                        After that, a ${confirmedData.cancellationFeeTotal.toFixed(2)} late-cancellation fee is charged to your card on file.
                      </span>
                    </>
                  : <>Cancel free of charge — this course has no late-cancellation fee.</>}
              />
              <TimelineStep
                last
                accent={accent}
                when={displayDate(confirmedData.date)}
                what={<>
                  Check in at {formatTime(confirmedData.time)} and pay ${confirmedData.totalAmount.toFixed(2)}
                  <span className="block text-ink text-xs mt-0.5">
                    {confirmedData.noCard ? 'At the pro shop, or online with the link in your email.' : 'Online with the link in your email, or at the pro shop.'}
                  </span>
                </>}
              />
            </div>

            <div className="bg-paper rounded-lg p-5 mb-6 text-left space-y-2 text-sm border border-line">
              <div className="flex justify-between"><span className="text-ink-muted">Date</span><span className="font-medium text-ink">{displayDate(confirmedData.date)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Tee time</span><span className="font-medium text-ink">{formatTime(confirmedData.time)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Players</span><span className="font-medium text-ink">{confirmedData.players}</span></div>
              <div className="border-t border-line mt-2 pt-2 space-y-1.5">
                <div className="flex justify-between text-ink-soft"><span>Green fee</span><span>${confirmedData.greenFeeTotal.toFixed(2)}</span></div>
                {confirmedData.cartFeeTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Cart fee</span><span>${confirmedData.cartFeeTotal.toFixed(2)}</span></div>}
                {confirmedData.rangeBallsTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Range balls</span><span>${confirmedData.rangeBallsTotal.toFixed(2)}</span></div>}
                <div className="flex justify-between text-ink-soft"><span>{serviceFeeLabel(confirmedData.players)}</span><span>${confirmedData.accessFeeTotal.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold text-ink border-t border-line pt-2">
                  <span>Estimated total at check-in</span><span>${confirmedData.totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push(`/courses/${courseSlug}/account?email=${encodeURIComponent(confirmedData.golferEmail)}`)}
              className="inline-flex items-center justify-center w-full py-3.5 rounded-md font-medium text-white text-sm mb-3 transition-colors"
              style={{ backgroundColor: accent }}
            >
              View my bookings
            </button>
            <button onClick={() => router.push(`/courses/${courseSlug}`)} className="text-sm text-ink-soft hover:text-ink transition-colors">
              Back to {confirmedData.courseName}
            </button>
          </div>
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

  // SP-B: the course's policy decides whether a card is asked for at all, and
  // describePolicy() is the same wording the course page and the email use.
  const policy = course.cancel_policy ?? policyFrom({ cancellationHours: course.cancellation_hours, lateCancellationFeeCents: Math.round((course.late_cancellation_fee || 0) * 100) });
  const terms = describePolicy(policy);

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-ink-soft hover:text-ink text-sm mb-6 transition-colors">
           Back to tee times
        </button>

        <h1 className="text-[34px] font-serif leading-none text-ink mb-3">Confirm your tee time</h1>
        <p className="text-ink-soft text-sm mb-8">
          {terms.cardNeeded
            ? <>Save your card to lock in your tee time at {course.name} — you won&apos;t be charged today.</>
            : <>Reserve your tee time at {course.name} — no card needed. You pay when you check in.</>}
        </p>

        <div className="grid gap-6">
          <div className="bg-white rounded-lg border border-line overflow-hidden">
            <CourseHeaderBar courseName={course.name} accent={accent} photoUrl={course.hero_image_url} logoUrl={course.logo_url} />
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Date</span><span className="font-medium text-ink">{displayDate(date)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Tee time</span><span className="font-medium text-ink">{formatTime(teeTime.time)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Round</span><span className="font-medium text-ink">{teeTime.product_label ? `${teeTime.product_label} · ` : ''}{teeTime.holes} holes</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Players</span><span className="font-medium text-ink">{players}</span></div>

              {teeTime.cart_fee > 0 && (
                <div className="flex items-center justify-between border-t border-line pt-3">
                  <div>
                    <p className="font-medium text-ink">Cart</p>
                    <p className="text-xs text-ink">${teeTime.cart_fee.toFixed(2)} per player</p>
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
                    <p className="text-xs text-ink mt-1.5">${rangeBallsPrice.toFixed(2)} — added to your check-in total</p>
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
                {/* Two lines, always — the number people owe and the number
                    that leaves their account today are not the same number. */}
                <div className="border-t border-line pt-3 space-y-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="font-medium text-ink">You&apos;ll pay at check-in</span>
                    <span className="font-bold text-ink text-xl leading-none tabular-nums">${total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-ink-muted">Charged today</span>
                    <span className="font-medium text-ink-soft">$0.00</span>
                  </div>
                </div>
                <TrustNote className="pt-1">Your green fee goes to the course; the $1.50 per player is GreenReserve&apos;s.</TrustNote>
              </div>
            </div>
          </div>

          {/* SP-B: Stripe JS loads only when this course's policy needs a card. */}
            <Elements stripe={terms.cardNeeded ? getStripePromise() : null}>
              <CheckoutForm
                teeTimeId={teeTime.id}
                players={players}
                golfer={golfer}
                cartSelected={cartSelected}
                rangeBallsSize={rangeBallsTotal > 0 ? rangeBallsSize : ''}
                accent={accent}
                needsCard={terms.cardNeeded}
                courseName={course.name}
                onConfirmed={setConfirmedData}
              />
            </Elements>


          {/* SP-B: the course's cancellation terms, in the words describePolicy()
              gives every golfer surface. */}
          <div className="bg-white rounded-lg p-5 border border-line">
            <p className="text-ink text-sm font-medium mb-1.5">Cancellation policy</p>
            <ul className="space-y-1">
              {terms.lines.map((l, i) => <li key={i} className="text-ink-soft text-xs leading-relaxed">{l}</li>)}
              {terms.cardNeeded && (
                <li className="text-ink-soft text-xs leading-relaxed">When a fee above is charged, or if you pay at the counter instead of checking in, the ${(ACCESS_FEE_PER_PLAYER * players).toFixed(2)} booking fee (${ACCESS_FEE_PER_PLAYER.toFixed(2)} per player) is charged to this card too.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutForm({ teeTimeId, players, golfer, cartSelected, rangeBallsSize, accent, needsCard, courseName, onConfirmed }: {
  teeTimeId: string;
  players: number;
  golfer: GolferProfile | null;
  cartSelected: boolean;
  rangeBallsSize: string;
  accent: string;
  /** SP-B: false when the course's policy charges nothing — no card is asked for. */
  needsCard: boolean;
  courseName: string;
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

  // The wallet sheet's handler is registered once, so it reads the latest
  // form values from here.
  const latest = useRef({ name, email, phone });
  latest.current = { name, email, phone };

  /** Create the booking. setupIntentId when a card was saved for it. */
  async function book(who: { name: string; email: string; phone: string }, setupIntentId?: string): Promise<boolean> {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teeTimeId,
        players,
        golferName: who.name,
        golferEmail: who.email,
        golferPhone: who.phone,
        // SEC-1: only the SetupIntent — the server reads its customer and card from Stripe.
        ...(setupIntentId ? { setupIntentId } : {}),
        cartSelected,
        rangeBallsSize,
        termsAccepted: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Something went wrong. Please try again.'); return false; }
    onConfirmed({
      courseName: data.courseName, date: data.date, time: data.time, players: data.players,
      greenFeeTotal: data.greenFeeTotal, cartFeeTotal: data.cartFeeTotal, rangeBallsTotal: data.rangeBallsTotal,
      accessFeeTotal: data.accessFeeTotal, totalAmount: data.totalAmount,
      cancellationFeeTotal: data.cancellationFeeTotal, cancellationHours: data.cancellationHours ?? 24,
      golferEmail: who.email,
      noCard: !needsCard,
    });
    return true;
  }

  /** A SetupIntent for this golfer (the card is held, nothing charged). */
  async function newSetupIntent(who: { name: string; email: string }): Promise<string | null> {
    const siRes = await fetch('/api/bookings/setup-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: who.email, name: who.name }),
    });
    const siData = await siRes.json();
    if (!siRes.ok) { setError(siData.error || 'Could not prepare card setup.'); return null; }
    return siData.clientSecret as string;
  }

  // PAY-3 (Cam 2026-10-06: "if the course takes the card then it should be
  // able to take apple pay"): Apple Pay / Google Pay hold the card exactly as
  // the card form does — a SetupIntent, $0 today. Stripe shows the button only
  // where a wallet is set up. The wallet supplies name and email when the form
  // has none yet.
  const [walletRequest, setWalletRequest] = useState<PaymentRequest | null>(null);
  useEffect(() => {
    if (!needsCard || !stripe) return;
    const req = stripe.paymentRequest({
      country: 'US',
      currency: 'usd',
      total: { label: `${courseName || 'Tee time'} · card held, nothing charged today`, amount: 0, pending: true },
      requestPayerName: true,
      requestPayerEmail: true,
    });
    let live = true;
    req.canMakePayment().then(r => { if (live && r) setWalletRequest(req); }).catch(() => {});
    req.on('paymentmethod', async (ev) => {
      setError('');
      const f = latest.current;
      const who = {
        name: f.name.trim() || ev.payerName || '',
        email: f.email.trim() || ev.payerEmail || '',
        phone: f.phone,
      };
      if (!who.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(who.email)) {
        ev.complete('fail');
        setError('Please enter your name and email, then try Apple Pay again.');
        return;
      }
      if (!f.name.trim()) setName(who.name);
      if (!f.email.trim()) setEmail(who.email);
      setLoading(true);
      try {
        const clientSecret = await newSetupIntent(who);
        if (!clientSecret) { ev.complete('fail'); setLoading(false); return; }
        const first = await stripe.confirmCardSetup(clientSecret, { payment_method: ev.paymentMethod.id }, { handleActions: false });
        if (first.error || !first.setupIntent) { ev.complete('fail'); setError(first.error?.message || 'Your card could not be saved.'); setLoading(false); return; }
        ev.complete('success');
        let si = first.setupIntent;
        if (si.status === 'requires_action') {
          const again = await stripe.confirmCardSetup(clientSecret);
          if (again.error || !again.setupIntent) { setError(again.error?.message || 'Your bank did not approve the card.'); setLoading(false); return; }
          si = again.setupIntent;
        }
        if (!(await book(who, si.id))) setLoading(false);
      } catch {
        setError('Something went wrong. Please try again.');
        setLoading(false);
      }
    });
    return () => { live = false; };
    // Registered once per Stripe instance; form values are read from `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe, needsCard]);

  async function handleSubmit() {
    setError('');
    if (!name.trim() || !email.trim()) { setError('Please enter your name and email.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email address.'); return; }
    setLoading(true);
    try {
      // SP-B: no card at this course — book straight away; they pay at check-in.
      let setupIntentId: string | undefined;
      if (needsCard) {
      if (!stripe || !elements) { setError('Payment form is still loading — try again in a moment.'); setLoading(false); return; }
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) { setError('Card details are required.'); setLoading(false); return; }
      const clientSecret = await newSetupIntent({ name, email });
      if (!clientSecret) { setLoading(false); return; }

      const { error: setupError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement, billing_details: { name, email } },
      });
      if (setupError) { setError(setupError.message || 'Your card could not be saved.'); setLoading(false); return; }

      const paymentMethodId = typeof setupIntent?.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent?.payment_method?.id;
      if (!paymentMethodId) { setError('Your card could not be saved. Please try again.'); setLoading(false); return; }
      setupIntentId = setupIntent.id;
      }

      if (!(await book({ name, email, phone }, setupIntentId))) setLoading(false);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  // INVIOLABLE: No GolferAccount required to book. Name/email are for the
  // confirmation email only — never for registration or sign-up prompts.
  return (
    <div className="bg-white rounded-lg border border-line p-6 space-y-5">
      <StepHeading title="Your details" note="Where your confirmation goes — no account is created." />
      <div>
        <label className={lCls}>Full name</label>
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

      {needsCard && <>
      <div className="pt-1 border-t border-line-soft" />
      <StepHeading title="A card to hold your spot" note="Nothing is charged today." />
      {walletRequest && (
        <>
          <PaymentRequestButtonElement options={{ paymentRequest: walletRequest, style: { paymentRequestButton: { type: 'book', theme: 'dark', height: '48px' } } }} />
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="h-px flex-1 bg-line" />or enter a card<span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <div>
        <label className={lCls}>Card details</label>
        <div className="w-full px-4 py-3.5 rounded-md border border-line bg-paper focus-within:border-pine/40 focus-within:ring-2 focus-within:ring-pine/10 transition-all">
          <CardElement options={cardStyle} />
        </div>
        <TrustNote className="mt-1.5">Nothing is charged now — you pay at the course when you check in.</TrustNote>
      </div>
      </>}

      {error && <p className="text-bad text-sm">{error}</p>}

      {!needsCard && <TrustNote>No charge until check-in.</TrustNote>}
      <p className="text-[11px] text-ink text-center leading-snug">
        By confirming, you agree to GreenReserve&apos;s <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">Terms of Service</a> and this course&apos;s cancellation policy.
      </p>
      <button
        onClick={handleSubmit}
        disabled={loading || (needsCard && !stripe)}
        className="w-full py-3.5 rounded-md font-medium text-white text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ backgroundColor: accent }}
      >
        {loading ? <><Loader2 size={16} className="animate-spin" /> {needsCard ? 'Saving card…' : 'Booking…'}</> : 'Confirm tee time'}
      </button>
      {needsCard && (
      <div className="flex items-center justify-center gap-2 text-ink-muted text-xs">
        
        <span>Secured by Stripe</span>
      </div>
      )}
    </div>
  );
}


export default function BookClient({ initial }: { initial?: BookInitial }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <BookPageInner initial={initial} />
    </Suspense>
  );
}
