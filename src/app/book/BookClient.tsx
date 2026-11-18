'use client';
import { smsWebConsentText } from '@/lib/sms-consent-copy';
import { splitTotal } from '@/lib/member-rates';
import { cartsFor } from '@/lib/cart-pricing';
import { FEE_AT_BOOKING_ON } from '@/lib/booking-fees';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
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
import { CARD } from '@/components/ui/Card';
import { CourseHeaderBar } from '@/components/CourseHeaderBar';
import { describePolicy, policyFrom, afterCutoffLine, insideWindowLine, policyMoney, holdTodayLine, holdsAtCutoff, type CancelPolicy } from '@/lib/cancel-policy';
import { teeToUtcMs } from '@/lib/tee-time-utils';
import { LIKE_UNSAFE_EMAIL } from '@/lib/like-exact';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { golferLookVars, lookAccentHex, lookMode, lookText, type BookingLook, type CourseLook } from '@/components/golfer/look';
import g from '@/components/golfer/golfer.module.css';
import { loginOffered } from '@/app/courses/[slug]/login/login-helpers';

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
  list_green_fee?: number | null; deal_pct?: number;
  // W2-6 slice 3: this time's booking rules (the course's, or its round's own).
  cart_required?: boolean; min_players?: number; max_players?: number;
};
export type CourseInfo = {
  name: string; city: string; state: string; address: string;
  cart_required: boolean;
  cart_pricing?: 'per_player' | 'per_cart';
  has_driving_range: boolean;
  range_balls_free: boolean;
  /** RANGE-1: the course's buckets when it sells them with tee times; empty = no range balls section. */
  range_buckets?: { id: string; name: string; balls: number | null; price_cents: number }[];
  cancellation_hours: number;
  late_cancellation_fee: number;
  /** SP-B: the full policy (cents). Older payloads fall back to the two fields above. */
  cancel_policy?: CancelPolicy;
  brand_color?: string;
  /** GOLFER-LOOK: Light or Dark and a preset accent (Course.bookingLook/bookingAccent). */
  booking_look?: CourseLook;
  /** "Have a promo code?" shows only when the course has a live code (Build). Absent = unknown, shown. */
  has_live_promo?: boolean;
  /** Course.memberLoginOn: false = no Log in (Settings "Show Log in on your booking page"). */
  member_login_on?: boolean;
  /** The groups that can log in here (loginGroups, #495). */
  login_groups?: ('members' | 'residents')[];
  /** The course's IANA timezone, for "is this time already past the free-cancel cutoff" (R-GOLF-009). */
  timezone?: string | null;
  /** PERS-1: the course's own uploads, shown in the header band. */
  hero_image_url?: string; logo_url?: string;
  /** PERS-1: optional note shown once the tee time is confirmed. */
  confirmation_note?: string;
};
type ConfirmedData = {
  courseName: string; date: string; time: string; players: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number;
  cancellationFeeTotal: number; cancellationHours: number;
  /** The booking's late-fee timing and whether its cutoff had already passed at booking. */
  lateFeeTiming?: string | null; cutoffPassed?: boolean;
  noCard?: boolean;
  golferEmail: string;
};

// "Back to tee times": the course page with the date, party and filters it had (there is no member list since item 6).
export function backToTimesHref(courseSlug: string, params: { get(key: string): string | null }, players: number): string {
  const q = new URLSearchParams();
  const date = params.get('date');
  if (date) q.set('date', date);
  q.set('players', String(players));
  for (const k of ['tod', 'holes', 'product']) { const v = params.get(k); if (v) q.set(k, v); }
  return `/courses/${courseSlug}?${q}`;
}

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

function cardStyleFor(look: BookingLook | undefined) {
  const t = lookText(look);
  return {
    style: {
      base: { fontSize: '15px', color: t.ink, '::placeholder': { color: t.muted } },
      invalid: { color: t.bad },
    },
  };
}


// PERF-1: what the server already loaded for this URL (see ./page.tsx). When
// present the page renders the tee time in its first HTML; the course and tee
// time are not fetched again. Undefined = load in the browser as before.
export type BookInitial = { course: CourseInfo | null; teeTime: LiveTeeTime | null; error: string };

function BookPageInner({ initial }: { initial?: BookInitial }) {
  const params = useSearchParams();

  const teeTimeId  = params.get('tee_time_id') || '';
  const courseSlug = params.get('course_slug') || '';
  const date        = params.get('date') || '';
  const requestedPlayers = parseInt(params.get('players') || '2');
  const cartParam = params.get('cart') === '1';

  const [course, setCourse]   = useState<CourseInfo | null>(initial?.course ?? null);
  const [teeTime, setTeeTime] = useState<LiveTeeTime | null>(initial?.teeTime ?? null);
  const [loadError, setLoadError] = useState(initial?.error ?? '');
  const [loadingInfo, setLoadingInfo] = useState(!initial);
  const [confirmedData, setConfirmedData] = useState<ConfirmedData | null>(null);
  // PERF (Cam 2026-10-26): Stripe.js costs ~600ms of main-thread time, so even at a
  // card course it loads on the golfer's first touch of (or tab into) the booking
  // form — before the agree box, so Apple Pay / Google Pay are ready when it is ticked.
  const [stripeWanted, setStripeWanted] = useState(false);
  // A required cart is the tee time's call (cart_required: its price-table cell can't be walked, CART-1).
  const [cartSelected, setCartSelected] = useState(cartParam);
  // PRICE-1 (Cam 2026-10-30): a promo code, checked by the server before booking; the booking prices it again.
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<{ code: string; kind: string; value: number; withRates: boolean } | null>(null);
  const [promoError, setPromoError] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  async function checkPromo(teeTimeId: string) {
    setPromoBusy(true); setPromoError('');
    try {
      const res = await fetch('/api/promo/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teeTimeId, code: promoInput }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setPromo(null); setPromoError(d.error || 'That code didn’t work.'); }
      else setPromo(d);
    } catch { setPromoError('Couldn’t check the code — try again.'); }
    setPromoBusy(false);
  }
  // RANGE-1: how many of each of the course's buckets (bucket id → count).
  const [bucketQty, setBucketQty] = useState<Record<string, number>>({});
  /** After a 409 'range': the course's current buckets, keeping counts only for buckets still sold. */
  async function reloadBuckets() {
    try {
      const r = await fetch(`/api/courses/${encodeURIComponent(courseSlug)}`);
      if (!r.ok) return;
      const fresh = await r.json() as CourseInfo;
      const ids = new Set((fresh.range_buckets ?? []).map(b => b.id));
      setCourse(c => c ? { ...c, range_buckets: fresh.range_buckets ?? [] } : c);
      setBucketQty(q => Object.fromEntries(Object.entries(q).filter(([id]) => ids.has(id))));
    } catch { /* the error from the booking is already on the page */ }
  }
  const [promoOpen, setPromoOpen] = useState(false);
  // Item 4 (Cam 2026-11-18): logged in at this course (gr_member), Name and Email are filled and read-only,
  // so the booking keeps the member's cart and rate at check-in. A 401 just means a guest.
  const [member, setMember] = useState<{ name: string; email: string; groups: string[] } | null>(null);
  const [logoutErr, setLogoutErr] = useState(false);
  async function logOut() {
    // A failed log-out leaves the session as it was, so the header keeps saying so.
    const r = await fetch(`/api/member/${encodeURIComponent(courseSlug)}/logout`, { method: 'POST' }).catch(() => null);
    if (!r || !r.ok) { setLogoutErr(true); return; }
    setLogoutErr(false);
    // The form was filled read-only from the log-in: start it again as a guest.
    window.location.reload();
  }
  useEffect(() => {
    if (!courseSlug) return;
    let live = true;
    fetch(`/api/member/${encodeURIComponent(courseSlug)}/session`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (live && d && typeof d.email === 'string' && d.email) setMember({ name: typeof d.name === 'string' ? d.name : '', email: d.email, groups: Array.isArray(d.groups) ? d.groups.map((x: { name?: unknown }) => String(x?.name ?? '')).filter(Boolean) : d.tier?.name ? [String(d.tier.name)] : [] }); })
      .catch(() => {});
    return () => { live = false; };
  }, [courseSlug]);

  useEffect(() => {
    // Server sent the course + tee time. Everyone books as a guest (Cam 2026-11-18: no golfer accounts).
    if (initial) return;
    if (!courseSlug || !teeTimeId || !date) { setLoadError('Missing booking details.'); setLoadingInfo(false); return; }

    Promise.all([
      fetch(`/api/courses/${courseSlug}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/courses/${courseSlug}/tee-times?date=${date}`).then(r => r.ok ? r.json() : []),
    ]).then(([courseData, teeTimes]) => {
      if (!courseData) { setLoadError('Course not found.'); setLoadingInfo(false); return; }
      setCourse(courseData);
      if (cartParam) setCartSelected(true);
      const match = Array.isArray(teeTimes) ? teeTimes.find((t: LiveTeeTime) => String(t.id) === String(teeTimeId)) : null;
      if (!match) {
        setLoadError('This tee time is no longer available. Please pick another.');
      } else {
        setTeeTime(match);
      }
      setLoadingInfo(false);
    }).catch(() => { setLoadError('Something went wrong loading this tee time.'); setLoadingInfo(false); });
  }, [courseSlug, teeTimeId, date]);

  // RES-1: a signed-in resident sees their own resident rate before booking.
  // Cam 2026-10-29: a signed-in member sees their member rate the same way (the booking charges it).
  const [residentFee, setResidentFee] = useState<number | null>(null);
  const [memberRate, setMemberRate] = useState<{ name: string; greenFee: number; cartFee: number; guestsMemberRate: boolean } | null>(null);
  // PRICE-3: the signed-in golfer's round packs here, and the one they use ('' = none).
  const [packs, setPacks] = useState<{ lineId: string; name: string; left: number; coversCart: boolean; guests: boolean }[]>([]);
  const [packId, setPackId] = useState('');
  const ttId = teeTime?.id;
  useEffect(() => {
    // Launch walk (Cam 2026-10-31): asked with no golfer sign-in too — a member signed in by the
    // member link (gr_member) is charged the member rate, so this page has to show it.
    if (!ttId) { setResidentFee(null); setMemberRate(null); setPacks([]); setPackId(''); return; }
    fetch(`/api/bookings/resident-rate?teeTimeId=${encodeURIComponent(String(ttId))}`)
      .then(r => r.ok ? r.json() : null).then(d => {
        setResidentFee(typeof d?.residentGreenFee === 'number' ? d.residentGreenFee : null);
        setMemberRate(d?.member && typeof d.member.greenFee === 'number' ? d.member : null);
        setPacks(Array.isArray(d?.packs) ? d.packs : []);
      })
      .catch(() => { setResidentFee(null); setMemberRate(null); setPacks([]); });
  }, [ttId]);

  // The confirmation is not on the look tokens yet; it takes the same accent as the page.
  const accent = course ? lookAccentHex(course) : '#173B2A';

  if (confirmedData) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-8">
        <div className={`${CARD} max-w-lg w-full overflow-hidden`}>
          <CourseHeaderBar courseName={confirmedData.courseName} accent={accent} photoUrl={course?.hero_image_url} logoUrl={course?.logo_url} />
          <div className="p-6 sm:p-8 text-center">
            <h1 className="text-[34px] font-serif leading-none text-ink mb-3">You&apos;re all set</h1>
            <p className="text-ink-soft mb-6 text-sm">
              {confirmedData.noCard
                ? <>Your spot is reserved — <strong className="text-ink">no card required</strong>. Pay at the course or use the check-in link in your confirmation email.</>
                : FEE_AT_BOOKING_ON
                  ? <>Your card is on file and <strong className="text-ink">only the ${confirmedData.accessFeeTotal.toFixed(2)} booking fee was charged</strong>. We&apos;ll email you a reminder to check in and pay before your round.</>
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
            <div className="rounded-lg bg-paper/70 p-5 mb-6 text-left">
              <div className="text-[15px] font-semibold text-ink mb-4">What happens next</div>
              <TimelineStep
                accent={accent}
                when="Today"
                what={confirmedData.cutoffPassed && confirmedData.cancellationFeeTotal > 0 && holdsAtCutoff({ lateFeeTimingAtBooking: confirmedData.lateFeeTiming })
                  ? <>Booked · <strong className="text-ink font-medium">{FEE_AT_BOOKING_ON ? `$${confirmedData.accessFeeTotal.toFixed(2)} booking fee charged today; ` : ''}{holdTodayLine(policyMoney(Math.round(confirmedData.cancellationFeeTotal * 100)))}</strong></>
                  : <>Booked · <strong className="text-ink font-medium">charged today ${(FEE_AT_BOOKING_ON && !confirmedData.noCard ? confirmedData.accessFeeTotal : 0).toFixed(2)}</strong></>}
              />
              {/* Wording from cancel-policy.ts (afterCutoffLine / insideWindowLine), by the
                  booking's own timing; booked past the cutoff, it says so (R-GOLF-009). */}
              <TimelineStep
                accent={accent}
                when={confirmedData.cancellationFeeTotal <= 0 ? 'Any time before your round' : confirmedData.cutoffPassed ? 'Cancellation' : 'Free to cancel until'}
                what={confirmedData.cancellationFeeTotal <= 0
                  ? <>Cancel free of charge — this course has no late-cancellation fee.</>
                  : confirmedData.cutoffPassed
                    ? <>{insideWindowLine(confirmedData.lateFeeTiming, policyMoney(Math.round(confirmedData.cancellationFeeTotal * 100)))}</>
                    : <>
                        {deadlineLabel(confirmedData.date, confirmedData.time, confirmedData.cancellationHours) || `${hoursLabel(confirmedData.cancellationHours)} before your tee time`}
                        <span className="block text-ink text-xs mt-0.5">
                          {afterCutoffLine(confirmedData.lateFeeTiming, policyMoney(Math.round(confirmedData.cancellationFeeTotal * 100)))}
                        </span>
                      </>}
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

            <div className="bg-paper/70 rounded-lg p-5 mb-6 text-left space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Date</span><span className="font-medium text-ink">{displayDate(confirmedData.date)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Tee time</span><span className="font-medium text-ink">{formatTime(confirmedData.time)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Players</span><span className="font-medium text-ink">{confirmedData.players}</span></div>
              <div className="border-t border-line mt-2 pt-2 space-y-1.5">
                <div className="flex justify-between text-ink-soft"><span>Green fee</span><span>${confirmedData.greenFeeTotal.toFixed(2)}</span></div>
                {confirmedData.cartFeeTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Cart fee</span><span>${confirmedData.cartFeeTotal.toFixed(2)}</span></div>}
                {confirmedData.rangeBallsTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Range balls</span><span>${confirmedData.rangeBallsTotal.toFixed(2)}</span></div>}
                <div className="flex justify-between gap-3 text-ink-soft"><span>{serviceFeeLabel(confirmedData.players)}</span><span className="shrink-0">${confirmedData.accessFeeTotal.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold text-ink border-t border-line pt-2">
                  <span>Estimated total at check-in</span><span>${confirmedData.totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <Link href={`/courses/${courseSlug}`} className="inline-block text-sm text-ink-soft hover:text-ink transition-colors">
              Back to {confirmedData.courseName}
            </Link>
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
        <div className={`${CARD} max-w-md w-full p-8 text-center`}>
          
          <h1 className="font-serif text-[24px] leading-tight text-ink mb-2">Can&apos;t complete this booking</h1>
          <p className="text-ink-soft text-sm mb-6">{loadError || 'This tee time is no longer available.'}</p>
          <Link
            href={courseSlug ? backToTimesHref(courseSlug, params, requestedPlayers) : '/'}
            className="inline-block px-5 py-2.5 rounded-md text-sm font-medium text-white bg-pine hover:bg-pine-hover transition-colors"
          >
            Pick another time
          </Link>
        </div>
      </div>
    );
  }

  const players = Math.min(requestedPlayers, Math.max(teeTime.players_available, 1));
  const minPlayers = teeTime.min_players ?? 1;
  if (players < minPlayers) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className={`${CARD} max-w-md w-full p-8 text-center`}>
          <h1 className="font-serif text-[24px] leading-tight text-ink mb-2">This tee time is for groups of {minPlayers} or more</h1>
          <p className="text-ink-soft text-sm mb-6">You picked {players} player{players === 1 ? '' : 's'}. Pick another time, or add players and choose this one again.</p>
          <Link href={courseSlug ? backToTimesHref(courseSlug, params, requestedPlayers) : '/'}
            className="inline-block px-5 py-2.5 rounded-md text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: accent }}>
            Pick another time
          </Link>
        </div>
      </div>
    );
  }
  // The server adds a cart whenever the course, the round or this time's schedule requires one — show the same.
  const cartForced = !!teeTime.cart_required;
  const withCart = cartForced || cartSelected;
  // Cents, so the total matches what the booking charges (lib/member-rates splitTotal).
  const memberN = memberRate ? (memberRate.guestsMemberRate ? players : Math.min(1, players)) : 0;
  const c = (d: number) => Math.round(d * 100);
  // PRICE-3: on a round pack the holder (or, when guests can use it, everyone) plays on the pack;
  // the rest pay the public price. The server prices it the same way (lib/round-packs packPrice).
  const pk = packId ? packs.find(p => p.lineId === packId) ?? null : null;
  const packSeatsN = pk ? (pk.guests ? players : 1) : 0;
  const packShort = !!pk && pk.guests && pk.left < players;
  const greenTotal  = pk ? (players - packSeatsN) * teeTime.green_fee : memberRate ? splitTotal(players, memberN, c(memberRate.greenFee), c(teeTime.green_fee)) / 100
    : residentFee != null ? residentFee + teeTime.green_fee * (players - 1) : teeTime.green_fee * players;
  // CART-2: a per-cart course charges the time's cart price per cart of two riders, members too; pack seats
  // that include the cart leave the count (lib/cart-pricing cartCharge — the server's rule).
  const perCart = course.cart_pricing === 'per_cart';
  const cartsN = cartsFor(players - (pk?.coversCart ? packSeatsN : 0));
  const cartTotal    = !withCart ? 0 : perCart ? cartsN * teeTime.cart_fee : pk ? (pk.coversCart ? players - packSeatsN : players) * teeTime.cart_fee : (memberRate ? splitTotal(players, memberN, c(memberRate.cartFee), c(teeTime.cart_fee)) / 100 : teeTime.cart_fee * players);
  const rangeBuckets = (course.range_buckets ?? []).filter(r => (bucketQty[r.id] ?? 0) > 0).map(r => ({ id: r.id, qty: bucketQty[r.id], unitCents: r.price_cents }));
  const rangeBallsTotal = (course.range_buckets ?? []).reduce((t, r) => t + r.price_cents * (bucketQty[r.id] ?? 0), 0) / 100;
  const accessTotal  = ACCESS_FEE_PER_PLAYER * players;
  // A code that doesn't work with member or resident rates takes nothing off one (the server says so too).
  const promoBlocked = !!promo && !promo.withRates && (!!memberRate || residentFee != null);
  // Seat by seat, as the server prices it (lib/promo-codes seatAfter): each player's own rate less the code.
  const seatOff = (d: number) => { const s = c(d); return s - Math.max(0, s - (promo!.kind === 'percent' ? Math.round(s * promo!.value / 100) : promo!.value)); };
  const promoOff = !promo || promoBlocked || pk ? 0 : (memberRate
    ? memberN * seatOff(memberRate.greenFee) + (players - memberN) * seatOff(teeTime.green_fee)
    : residentFee != null ? seatOff(residentFee) + (players - 1) * seatOff(teeTime.green_fee)
    : players * seatOff(teeTime.green_fee)) / 100;
  const total         = greenTotal - promoOff + cartTotal + rangeBallsTotal + accessTotal;

  // SP-B: the course's policy decides whether a card is asked for at all, and
  // describePolicy() is the same wording the course page and the email use.
  const policy = course.cancel_policy ?? policyFrom({ cancellationHours: course.cancellation_hours, lateCancellationFeeCents: Math.round((course.late_cancellation_fee || 0) * 100) });
  const terms = describePolicy(policy);

  // R-GOLF-009: the time's free-cancel cutoff has already passed (course clock) — say what cancelling costs now.
  const pastCutoff = policy.lateCancellationFeeCents > 0 && !!course.timezone
    && teeToUtcMs(date, teeTime.time, course.timezone) - policy.cancellationHours * 3600_000 <= Date.now();
  const lateFeeWords = `${policyMoney(policy.lateCancellationFeeCents)}${policy.lateFeeBasis === 'player' ? ' per player' : ''}`;
  const pastHold = pastCutoff && holdsAtCutoff({ lateFeeTimingAtBooking: policy.lateFeeTiming });
  // The free-cancel sentence names a time that has already passed: leave it out once it has.
  const policyLines = pastCutoff
    ? terms.lines.filter(l => !l.startsWith('Free cancellation until') && l !== afterCutoffLine(policy.lateFeeTiming, lateFeeWords))
    : terms.lines;
  // What leaves the golfer's account today, and what is paid at the course.
  const payNow = FEE_AT_BOOKING_ON && terms.cardAtBooking ? accessTotal : 0;
  const payLater = total - payNow;
  const look = golferLookVars(course);
  const plWord = `${players} ${players === 1 ? 'player' : 'players'}`;
  const perRider = perCart ? 'cart (2 riders)' : 'rider';
  const showPromo = !pk && course.has_live_promo !== false;

  // The cart choice, the range balls and the price box sit between Your details and the card (Option A).
  const summary = (
    <>
      {teeTime.cart_fee > 0 && (cartForced ? (
        <p className={g.cartrow}><span className={g.lab}>Cart</span> Required at this time · ${teeTime.cart_fee.toFixed(2)}/{perRider}</p>
      ) : (
        <fieldset className={g.cartrow}>
          <legend className={g.lab}>Cart</legend>
          <label className={g.pill}><input type="radio" name="cart" value="walk" checked={!cartSelected} onChange={() => setCartSelected(false)} /><span>Walk</span></label>
          <label className={g.pill}><input type="radio" name="cart" value="ride" checked={cartSelected} onChange={() => setCartSelected(true)} /><span>Ride +${teeTime.cart_fee.toFixed(2)}/{perRider}</span></label>
        </fieldset>
      ))}

      {/* Item 5 (RANGE-1): the course's own buckets, each −/+ from 0, between the cart and the price box.
          Shown only when the course sells range balls with tee times (range_buckets is empty otherwise). */}
      {(course.range_buckets ?? []).length > 0 && (
        <fieldset className={g.card}>
          <legend className={g.vh}>Range balls</legend>
          <h3 style={{ marginTop: 0 }} aria-hidden="true">Range balls</h3>
          {(course.range_buckets ?? []).map(r => {
            const n = bucketQty[r.id] ?? 0;
            const label = `${r.name}${r.balls ? ` · ${r.balls} balls` : ''} · $${(r.price_cents / 100).toFixed(2)}`;
            return (
              <div key={r.id} className={g.bucket}>
                <span>{label}</span>
                <span className={g.stepper} role="group" aria-label={label}>
                  <button type="button" aria-label={`One fewer ${r.name}`} disabled={n <= 0} onClick={() => setBucketQty(q => ({ ...q, [r.id]: n - 1 }))}>−</button>
                  <output aria-live="polite" style={{ minWidth: 24, fontSize: 15 }}>{n}</output>
                  <button type="button" aria-label={`One more ${r.name}`} disabled={n >= 20} onClick={() => setBucketQty(q => ({ ...q, [r.id]: n + 1 }))}>+</button>
                </span>
              </div>
            );
          })}
        </fieldset>
      )}
      {course.has_driving_range && course.range_balls_free && <p className={g.cartrow}>Range balls are included, free of charge.</p>}

      <div className={g.card} aria-label="Price">
        <div className={g.li}><span>Green fees · {plWord}</span><span>${greenTotal.toFixed(2)}</span></div>
        {!!teeTime.deal_pct && teeTime.list_green_fee != null && <p className={g.mp}>Last-minute, {teeTime.deal_pct}% off: <s>${teeTime.list_green_fee.toFixed(2)}</s> ${teeTime.green_fee.toFixed(2)} a player.</p>}
        {pk && <p className={g.mp}>{packShort ? `Only ${pk.left} round${pk.left === 1 ? '' : 's'} left on your ${pk.name} — book ${pk.left} player${pk.left === 1 ? '' : 's'}.` : `${packSeatsN === players ? 'Everyone plays' : 'You play'} on your ${pk.name}${pk.coversCart ? ', cart included' : ''}.`}</p>}
        {!pk && memberRate && <p className={g.mp}>{memberRate.name} rate ${memberRate.greenFee.toFixed(2)}{memberN < players ? ` for you; your guests pay $${teeTime.green_fee.toFixed(2)} each` : ''}.</p>}
        {!pk && residentFee != null && <p className={g.mp}>Resident rate for you (${residentFee.toFixed(2)}){players > 1 ? `; the rest of your group pays $${teeTime.green_fee.toFixed(2)} each` : ''}.</p>}
        {promoOff > 0 && <div className={g.li}><span>Code {promo!.code}</span><span>−${promoOff.toFixed(2)}</span></div>}
        {cartTotal > 0 && <div className={g.li}><span>Cart · {perCart ? `${cartsN} cart${cartsN === 1 ? '' : 's'}` : plWord}</span><span>${cartTotal.toFixed(2)}</span></div>}
        {rangeBallsTotal > 0 && <div className={g.li}><span>Range balls</span><span>${rangeBallsTotal.toFixed(2)}</span></div>}
        {/* Cam (mockup thread b48b908c): one "Fees" line with an (i); the detail is the LQ-2 golfer-facing name. */}
        <details className={g.feed}>
          <summary className={g.li}><span>Fees <span className={g.inf} aria-hidden="true">i</span><span className={g.vh}>, show what this is</span></span><span>${accessTotal.toFixed(2)}</span></summary>
          <p>{serviceFeeLabel(players)}</p>
        </details>
        {packs.length > 0 && (
          <label className={g.sms} style={{ margin: '6px 0' }}>
            <input type="checkbox" checked={!!pk} onChange={e => setPackId(e.target.checked ? packs[0].lineId : '')} />
            <span>Use my round pack {packs.length > 1 && pk ? (
              <select value={packId} onChange={e => setPackId(e.target.value)} aria-label="Which round pack" style={{ minHeight: 44, marginLeft: 4, border: '1px solid var(--g-line)', borderRadius: 8, background: 'var(--g-paper)' }}>
                {packs.map(p => <option key={p.lineId} value={p.lineId}>{p.name} ({p.left} left)</option>)}
              </select>
            ) : <>({packs[0].name}, {packs[0].left} left)</>}</span>
          </label>
        )}
        {/* Two lines, always — the number people owe and the number that leaves their account today are not the same number. */}
        <div className={`${g.li} ${g.tot}`}><span>Total</span><span>${total.toFixed(2)}</span></div>
        {pastHold
          ? <p className={g.mp}>Booked now, {holdTodayLine(lateFeeWords)}.</p>
          : <div className={`${g.li} ${g.sub}`}><span>Pay now</span><span>${payNow.toFixed(2)}</span></div>}
        <div className={`${g.li} ${g.sub}`}><span>Pay at the course</span><span>${payLater.toFixed(2)}</span></div>
        {showPromo && (promoOpen || promo || promoError ? (
          <div className={g.promoRow}>
            <label className={g.vh} htmlFor="promo">Promo code</label>
            <input id="promo" value={promoInput} autoComplete="off" enterKeyHint="done"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (promoInput.trim() && !promoBusy) checkPromo(teeTime.id); } }}
              onChange={e => { setPromoInput(e.target.value.toUpperCase()); if (promo) setPromo(null); setPromoError(''); }} />
            <button type="button" onClick={() => checkPromo(teeTime.id)} disabled={!promoInput.trim() || promoBusy}>{promoBusy ? 'Checking…' : 'Apply'}</button>
          </div>
        ) : (
          <button className={`${g.lnk} ${g.promo}`} type="button" onClick={() => setPromoOpen(true)}>Have a promo code?</button>
        ))}
        {promoError && <p role="alert" className={g.err}>{promoError}</p>}
        {promoBlocked && <p className={g.mp}>Code {promo!.code} can’t be used with your {memberRate ? 'member' : 'resident'} rate.</p>}
      </div>
    </>
  );

  // SP-B: the course's cancellation terms, in the words describePolicy() gives every golfer surface.
  const policyLine = (
    <p className={g.pol}>
      {pastCutoff && <span><b>{insideWindowLine(policy.lateFeeTiming, lateFeeWords)}</b></span>}
      {policyLines.map((l, i) => <span key={i}>{l}</span>)}
      {/* Launch walk (Cam 2026-10-31): "or if you pay at the counter" deleted — nothing charges it since PAY-2. */}
      {terms.cardAtBooking && !FEE_AT_BOOKING_ON && (
        <span>When a fee above is charged, the ${(ACCESS_FEE_PER_PLAYER * players).toFixed(2)} booking fee (${ACCESS_FEE_PER_PLAYER.toFixed(2)} per player) is charged to this card too.</span>
      )}
    </p>
  );

  return (
    <div className={g.root} style={look}>
      <div className={g.site}>
        <header className={g.top}>
          <h1><Link href={`/courses/${courseSlug}`}>{course.name}</Link></h1>
          {/* Item 2: one Log in in the header; it comes back to this Book page, now filled from the log-in. */}
          {!member && loginOffered(course) && (
            <nav className={g.topLinks} aria-label="Your account at this course">
              <Link className={g.lnk} href={`/courses/${encodeURIComponent(courseSlug)}/login?back=${encodeURIComponent(`/book?${params.toString()}`)}`}>Log in</Link>
            </nav>
          )}
          {member && (
            <nav className={g.topLinks} aria-label="Your account at this course">
              <span>Logged in · {member.name || member.email}{member.groups.length ? ` · ${member.groups.join(' and ')}` : ''}</span>
              <Link className={g.lnk} href={`/courses/${encodeURIComponent(courseSlug)}/member`}>Your {course.name}</Link>
              <button type="button" className={g.lnk} onClick={logOut}>Log out</button>
              {logoutErr && <span role="alert">Couldn&rsquo;t log out. Try again.</span>}
            </nav>
          )}
        </header>
        {/* The site layout's main element is the page's one main landmark; this is its content. */}
        <div className={g.wrap}>
          <div className={g.bk}>
            <Link href={backToTimesHref(courseSlug, params, players)} className={`${g.lnk} ${g.back}`}>‹ Back to tee times</Link>
            <h2 id="book-h">Book your tee time</h2>
            <div className={`${g.card} ${g.recap}`}>
              <div>
                <b>{formatTime(teeTime.time)} · {displayDate(date)}</b>
                <span>{teeTime.product_label ? `${teeTime.product_label} · ` : ''}{teeTime.holes} holes · {plWord}</span>
              </div>
              <Link className={g.lnk} href={backToTimesHref(courseSlug, params, players)} aria-label="Change the tee time">Change</Link>
            </div>

            {/* SP-B: Stripe JS loads only when this course's policy needs a card —
                and then only once the golfer starts on the form (stripeWanted). */}
            <div onPointerDown={() => setStripeWanted(true)} onFocusCapture={() => setStripeWanted(true)}>
              <Elements stripe={terms.cardAtBooking && stripeWanted ? getStripePromise() : null}>
                <CheckoutForm
                  teeTimeId={teeTime.id}
                  players={players}
                  cartSelected={withCart}
                  rangeBuckets={rangeBuckets}
                  accent={accent}
                  needsCard={terms.cardAtBooking}
                  promoCode={promo && !promoBlocked && !pk ? promo.code : ''}
                  packLineId={pk ? pk.lineId : ''}
                  courseName={course.name}
                  onConfirmed={setConfirmedData}
                  onRangeStale={reloadBuckets}
                  member={member}
                  payNow={payNow}
                  summary={summary}
                  policy={policyLine}
                  look={lookMode(course)}
                  holdNow={pastHold ? holdTodayLine(lateFeeWords) : ''}
                />
              </Elements>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutForm({ onRangeStale, teeTimeId, players, cartSelected, rangeBuckets, accent, needsCard, courseName, onConfirmed, promoCode = '', packLineId = '', member = null, payNow = 0, summary = null, policy = null, look = 'light', holdNow = '' }: {
  /** The course's look, for the card field (Stripe draws it in its own frame). */
  look?: BookingLook;
  /** Past the cutoff at a hold course: what is charged within the hour (holdTodayLine), instead of "$0 now". */
  holdNow?: string;
  /** Logged in at this course: Name and Email come from the log-in and can't be edited here. */
  member?: { name: string; email: string } | null;
  /** What the golfer pays today, for the Book button. */
  payNow?: number;
  /** The cart, range balls and price box, shown after Your details. */
  summary?: React.ReactNode;
  /** The course's cancellation policy, shown just above the agree box. */
  policy?: React.ReactNode;
  promoCode?: string;
  /** PRICE-3: the golfer's round pack, when they use it. */
  packLineId?: string;
  teeTimeId: string;
  players: number;
  cartSelected: boolean;
  rangeBuckets: { id: string; qty: number; unitCents: number }[];
  accent: string;
  /** SP-B: false when the course's policy charges nothing — no card is asked for. */
  needsCard: boolean;
  courseName: string;
  onConfirmed: (data: ConfirmedData) => void;
  /** RANGE-1: the server refused the range balls (409 code 'range'): reload the bucket list. */
  onRangeStale?: () => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();

  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  // Mockup thread 262a4911: a field left invalid turns red with a short message under it; Book moves to the first.
  const [bad, setBad] = useState<{ name?: string; email?: string; phone?: string }>({});
  const loginName = member?.name && member.name !== 'Member' ? member.name : '';
  useEffect(() => {
    if (!member) return;
    if (loginName) setName(loginName);
    setEmail(member.email);
    // Filled once, when the log-in is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member]);
  function fieldError(k: 'name' | 'email' | 'phone', v: string): string | undefined {
    const t = v.trim();
    if (k === 'name') return t ? undefined : 'Enter your name';
    if (k === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) && !LIKE_UNSAFE_EMAIL.test(t) ? undefined : 'Enter a valid email';
    return !t || t.replace(/\D/g, '').length >= 10 ? undefined : 'Enter a valid mobile number, or leave it blank';
  }
  function check(k: 'name' | 'email' | 'phone', v: string, always = false) {
    if (!always && !v.trim() && !bad[k]) return;
    setBad(b => ({ ...b, [k]: fieldError(k, v) }));
  }

  // The wallet sheet's handler is registered once, so it reads the latest
  // form values from here.
  // Cam 2026-10-19: agreeing is a box the golfer ticks, never implied by the
  // button (clickwrap). Nothing books — card form, Apple Pay or no card — until it is.
  const [agreed, setAgreed] = useState(false);
  // SMS-1 (Twilio A2P 10DLC): text consent is its own box, never pre-ticked, never part of the terms box.
  const [smsOk, setSmsOk] = useState(false);
  // The wallet button's handler is registered once; it reads the code from here, never a stale render.
  // The cart and range balls too: on this page they are often chosen after Stripe loads (Your details comes first).
  const latest = useRef({ name, email, phone, agreed, promoCode, packLineId, smsOk, cartSelected, rangeBuckets });
  latest.current = { name, email, phone, agreed, promoCode, packLineId, smsOk, cartSelected, rangeBuckets };

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
        cartSelected: latest.current.cartSelected,
        rangeBuckets: latest.current.rangeBuckets,
        ...(latest.current.promoCode ? { promoCode: latest.current.promoCode } : {}),
        ...(latest.current.packLineId ? { packLineId: latest.current.packLineId } : {}),
        termsAccepted: latest.current.agreed === true,
        smsConsent: latest.current.smsOk === true && who.phone.replace(/\D/g, '').length >= 10,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Something went wrong. Please try again.');
      // RANGE-1: a bucket changed or sold out — fetch the course's buckets again (the message says what happened).
      if (res.status === 409 && data.code === 'range') onRangeStale?.();
      return false;
    }
    onConfirmed({
      courseName: data.courseName, date: data.date, time: data.time, players: data.players,
      greenFeeTotal: data.greenFeeTotal, cartFeeTotal: data.cartFeeTotal, rangeBallsTotal: data.rangeBallsTotal,
      accessFeeTotal: data.accessFeeTotal, totalAmount: data.totalAmount,
      cancellationFeeTotal: data.cancellationFeeTotal, cancellationHours: data.cancellationHours ?? 24,
      lateFeeTiming: data.lateFeeTiming ?? null, cutoffPassed: !!data.cutoffPassed,
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
      total: { label: `${courseName || 'Tee time'} · ${holdNow ? `card held, ${holdNow}` : FEE_AT_BOOKING_ON ? 'card held, booking fee charged today' : 'card held, nothing charged today'}`, amount: 0, pending: true },
      requestPayerName: true,
      requestPayerEmail: true,
    });
    let live = true;
    req.canMakePayment().then(r => { if (live && r) setWalletRequest(req); }).catch(() => {});
    req.on('paymentmethod', async (ev) => {
      setError('');
      const f = latest.current;
      if (!f.agreed) { ev.complete('fail'); setError('Tick the box to agree to the terms, then try again.'); return; }
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
    // Item 4: name and email are checked together with the box.
    const errs = { name: fieldError('name', name), email: fieldError('email', email), phone: fieldError('phone', phone) };
    setBad(errs);
    const first = (['name', 'email', 'phone'] as const).find(k => errs[k]);
    if (first) { document.getElementById(`bk-${first}`)?.focus(); return; }
    if (!agreed) { setError('Tick the box to agree to the terms before you book.'); return; }
    setLoading(true);
    try {
      // SP-B: no card at this course — book straight away; they pay at check-in.
      let setupIntentId: string | undefined;
      if (needsCard) {
      if (!stripe || !elements) { setError('Payment form is still loading — try again in a moment.'); setLoading(false); return; }
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) { setError('Card details are required.'); setLoading(false); return; }
      const clientSecret = await newSetupIntent({ name: name.trim(), email: email.trim() });
      if (!clientSecret) { setLoading(false); return; }

      const { error: setupError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement, billing_details: { name: name.trim(), email: email.trim() } },
      });
      if (setupError) { setError(setupError.message || 'Your card could not be saved.'); setLoading(false); return; }

      const paymentMethodId = typeof setupIntent?.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent?.payment_method?.id;
      if (!paymentMethodId) { setError('Your card could not be saved. Please try again.'); setLoading(false); return; }
      setupIntentId = setupIntent.id;
      }

      if (!(await book({ name: name.trim(), email: email.trim(), phone }, setupIntentId))) setLoading(false);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  // INVIOLABLE: No GolferAccount required to book. Name/email are for the
  // confirmation email only — never for registration or sign-up prompts.
  const fromLogin = !!member;
  const bookWords = holdNow ? 'Book' : `Book · ${payNow > 0 ? `$${payNow.toFixed(2)}` : '$0'} now`;
  return (
    <form noValidate onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
      <h3>Your details</h3>
      {fromLogin && <p className={g.hintline}>From your {courseName} log-in.</p>}
      <div className={g.inp}>
        <label className={g.lab} htmlFor="bk-name">Name</label>
        <input id="bk-name" type="text" autoComplete="name" value={name} readOnly={!!loginName}
          onChange={e => { setName(e.target.value); if (bad.name) check('name', e.target.value, true); }} onBlur={e => check('name', e.target.value)}
          aria-invalid={bad.name ? true : undefined} aria-describedby="bk-name-err" />
        <div className={g.err} id="bk-name-err" role="alert">{bad.name ?? ''}</div>
      </div>
      <div className={g.inp}>
        <label className={g.lab} htmlFor="bk-email">Email</label>
        <input id="bk-email" type="email" autoComplete="email" value={email} readOnly={fromLogin}
          onChange={e => { setEmail(e.target.value); if (bad.email) check('email', e.target.value, true); }} onBlur={e => check('email', e.target.value)}
          aria-invalid={bad.email ? true : undefined} aria-describedby="bk-email-err" />
        <div className={g.err} id="bk-email-err" role="alert">{bad.email ?? ''}</div>
      </div>
      <div className={g.inp}>
        <label className={g.lab} htmlFor="bk-phone">Mobile (optional)</label>
        <input id="bk-phone" type="tel" autoComplete="tel" value={phone}
          onChange={e => { setPhone(e.target.value); if (bad.phone) check('phone', e.target.value, true); }} onBlur={e => check('phone', e.target.value)}
          aria-invalid={bad.phone ? true : undefined} aria-describedby="bk-phone-err" />
        <div className={g.err} id="bk-phone-err" role="alert">{bad.phone ?? ''}</div>
      </div>
      {phone.replace(/\D/g, '').length >= 10 && (
        <label className={g.sms}>
          <input type="checkbox" checked={smsOk} onChange={e => setSmsOk(e.target.checked)} />
          <span>{smsWebConsentText(courseName)} <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> · <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>. Optional — you can book without it.</span>
        </label>
      )}

      {summary}

      {needsCard && <>
      <h3>A card to hold your spot</h3>
      <p className={g.hintline}>{holdNow ? 'The terms below say when your card is charged.' : FEE_AT_BOOKING_ON ? 'Only the booking fee is charged today. The terms below say when else your card can be.' : 'Nothing is charged today. The terms below say when your card can be.'}</p>
      {walletRequest && agreed && (
        <>
          <PaymentRequestButtonElement options={{ paymentRequest: walletRequest, style: { paymentRequestButton: { type: 'book', theme: look === 'dark' ? 'light' : 'dark', height: '48px' } } }} />
          <p className={g.or}>or enter a card</p>
        </>
      )}
      <div className={g.inp}>
        <span className={g.lab} id="bk-card-l">Card details</span>
        <div className={g.cardbox} role="group" aria-labelledby="bk-card-l">
          <CardElement options={cardStyleFor(look)} />
        </div>
        <p className={g.small}>Secured by Stripe.</p>
      </div>
      </>}

      {policy}

      <label className={g.agree}>
        <input type="checkbox" checked={agreed} onChange={e => { setAgreed(e.target.checked); if (e.target.checked) setError(''); }} aria-describedby={agreed ? undefined : 'bk-hint'} />
        <span>
          I agree to GreenReserve&apos;s <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and
          to {courseName || 'this course'}&apos;s cancellation policy shown on this page, including that {courseName || 'the course'} and GreenReserve keep my booking history.
        </span>
      </label>

      <div className={g.bookbar}>
        {error && <p className={g.formerr} role="alert">{error}</p>}
        {!agreed && <p className={g.hint} id="bk-hint">Tick the box to agree to the terms before you book{needsCard ? ' (Apple Pay and Google Pay appear once you do)' : ''}.</p>}
        <button
          type="submit"
          disabled={loading || !agreed || (needsCard && !stripe)}
          className={`${g.btn} ${g.bookbtn}`}
        >
          {loading ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> {needsCard ? 'Saving card…' : 'Booking…'}</> : bookWords}
        </button>
      </div>
    </form>
  );
}


// The Book page's footer, in the course's look (the site footer skips /book). Privacy, Terms and support stay
// on every state of the page: the form, the confirmation and the errors.
function BookFooter({ course }: { course: CourseInfo | null | undefined }) {
  const look = course ? golferLookVars(course) : golferLookVars({});
  return (
    <footer className={g.bookfoot} style={look}>
      <span>Powered by <Link href="/">GreenReserve</Link></span>
      <span className={g.bookfootLinks}>
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </span>
    </footer>
  );
}

export default function BookClient({ initial }: { initial?: BookInitial }) {
  return (
    <>
      <Suspense fallback={<div className="min-h-screen bg-paper" />}>
        <BookPageInner initial={initial} />
      </Suspense>
      <BookFooter course={initial?.course} />
    </>
  );
}
