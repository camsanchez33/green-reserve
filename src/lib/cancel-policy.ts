// SP-B (STAFF_POLICY_SPEC Part B). A course's cancellation & card policy, the
// fee arithmetic, and the ONE function that turns it into words a golfer reads.
// The course page, the booking page, the confirmation email, the check-in page
// and the owner's live preview all call describePolicy(), so the terms a golfer
// is shown can never disagree with each other or with what gets charged.
//
// Card at booking is derived, never stored: a card is asked for only when there
// is something to charge it for — a late fee or a no-show fee (Cam 2026-10-05).
// Client-safe: no Node or Prisma imports.

export type LateFeeTiming = 'hold_at_cutoff' | 'late_cancel' | 'late_cancel_or_no_show';
export type FeeBasis = 'booking' | 'player';

export interface CancelPolicy {
  cancellationHours: number;
  lateCancellationFeeCents: number;
  lateFeeBasis: FeeBasis;
  lateFeeTiming: LateFeeTiming;
  noShowFeeCents: number;
  noShowFeeBasis: FeeBasis;
  autoNoShowMinutes: number | null;
  /** Hours before the round the pay-link / check-in email goes out. */
  checkInWindowHours: number;
}

export const LATE_FEE_TIMINGS: { key: LateFeeTiming; label: string; help: string }[] = [
  { key: 'hold_at_cutoff', label: 'Hold at the cutoff, refunded at check-in', help: 'When free cancellation ends, the fee is charged as a hold. It comes back when they check in; cancelling late keeps it.' },
  { key: 'late_cancel', label: 'Only if they cancel late', help: 'Nothing is charged at the cutoff. The fee is charged the moment they cancel inside the window.' },
  { key: 'late_cancel_or_no_show', label: 'If they cancel late or don’t show', help: 'As above, and a group that never shows is charged too.' },
];

const TIMINGS = new Set<string>(LATE_FEE_TIMINGS.map(t => t.key));
export const isLateFeeTiming = (v: unknown): v is LateFeeTiming => typeof v === 'string' && TIMINGS.has(v);
export const isFeeBasis = (v: unknown): v is FeeBasis => v === 'booking' || v === 'player';

/** Read a Course row (or a wire object) into a policy, with today's defaults. */
export function policyFrom(c: Partial<Record<keyof CancelPolicy, unknown>>): CancelPolicy {
  const int = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : d);
  return {
    cancellationHours: int(c.cancellationHours, 24),
    lateCancellationFeeCents: int(c.lateCancellationFeeCents, 0),
    lateFeeBasis: isFeeBasis(c.lateFeeBasis) ? c.lateFeeBasis : 'booking',
    lateFeeTiming: isLateFeeTiming(c.lateFeeTiming) ? c.lateFeeTiming : 'hold_at_cutoff',
    noShowFeeCents: int(c.noShowFeeCents, 0),
    noShowFeeBasis: isFeeBasis(c.noShowFeeBasis) ? c.noShowFeeBasis : 'booking',
    autoNoShowMinutes: typeof c.autoNoShowMinutes === 'number' && c.autoNoShowMinutes > 0 ? Math.round(c.autoNoShowMinutes) : null,
    checkInWindowHours: int(c.checkInWindowHours, 3),
  };
}

/** A card is needed only when the policy can charge one. */
export function cardRequired(p: CancelPolicy): boolean {
  return p.lateCancellationFeeCents > 0 || p.noShowFeeCents > 0;
}

/** Whether a no-show is charged under this policy (and so whether auto no-show can charge). */
export function chargesNoShow(p: CancelPolicy): boolean {
  return p.noShowFeeCents > 0 || (p.lateCancellationFeeCents > 0 && p.lateFeeTiming === 'late_cancel_or_no_show');
}

export const lateFeeTotalCents = (p: CancelPolicy, players: number) =>
  p.lateCancellationFeeCents * (p.lateFeeBasis === 'player' ? Math.max(1, players) : 1);

/**
 * The no-show charge for a booking: the separate no-show fee when set, else —
 * under "cancel late or don't show" — the late fee. Never both.
 */
export function noShowTotalCents(p: CancelPolicy, players: number): number {
  if (p.noShowFeeCents > 0) return p.noShowFeeCents * (p.noShowFeeBasis === 'player' ? Math.max(1, players) : 1);
  if (p.lateFeeTiming === 'late_cancel_or_no_show') return lateFeeTotalCents(p, players);
  return 0;
}

/** SP-B: does this booking take its late fee as a hold at the cutoff? Bookings made
 *  before SP-B carry no timing and behave exactly as before (yes). */
export const holdsAtCutoff = (b: { lateFeeTimingAtBooking?: string | null }) =>
  (b.lateFeeTimingAtBooking ?? 'hold_at_cutoff') === 'hold_at_cutoff';

/** SP-B: is a late cancellation charged at the moment of cancelling? */
/**
 * R-PAY-003: the cancellation window THIS booking was made under — copied onto
 * the Booking at creation ("the window this golfer agreed to, whatever the
 * course changes later"). The course's live value only for rows older than the
 * copy. Every cutoff (the hold, the warning, the manage page, a cancel) uses this.
 */
export const bookingWindowHours = (
  b: { cancellationHoursAtBooking?: number | null },
  course: { cancellationHours: number },
): number => b.cancellationHoursAtBooking ?? course.cancellationHours;

export const chargesOnLateCancel = (b: { lateFeeTimingAtBooking?: string | null }) =>
  b.lateFeeTimingAtBooking === 'late_cancel' || b.lateFeeTimingAtBooking === 'late_cancel_or_no_show';

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
const basis = (b: FeeBasis) => (b === 'player' ? ' per player' : '');
const hours = (h: number) => (h === 1 ? '1 hour' : `${h} hours`);

/**
 * The one sentence for what happens once free cancellation ends, by timing.
 * `fee` is already worded ("$20", "$5 per player"). describePolicy() and the
 * "your window closes soon" email both use it, so they can't disagree
 * (R-CRON-004). Bookings made before SP-B carry no timing: a hold, as before.
 */
export function afterCutoffLine(timing: string | null | undefined, fee: string, after = 'after that'): string {
  if (timing === 'late_cancel') return `Cancel ${after} and a ${fee} late-cancellation fee is charged to your card.`;
  if (timing === 'late_cancel_or_no_show') return `Cancel ${after}, or don’t show, and a ${fee} fee is charged to your card.`;
  return `${after[0].toUpperCase()}${after.slice(1)}, a ${fee} hold is charged to your card. It’s refunded when you check in, and kept if you cancel late or don’t show.`;
}

/**
 * R-GOLF-009: booked (or looking at a slot) after free cancellation has already
 * ended. The golfer must not read "free to cancel until" a time already past.
 */
export function insideWindowLine(timing: string | null | undefined, fee: string): string {
  if (timing === 'late_cancel') return `This tee time is already past the free-cancellation cutoff. Cancelling now charges the ${fee} late-cancellation fee.`;
  if (timing === 'late_cancel_or_no_show') return `This tee time is already past the free-cancellation cutoff. Cancelling now, or not showing, charges the ${fee} fee.`;
  return `This tee time is already past the free-cancellation cutoff, so the ${fee} hold is charged to your card within the hour. It’s refunded when you check in.`;
}

/** Booked past the cutoff on a hold course: what "today" really means (R-GOLF-009). */
export const holdTodayLine = (fee: string) => `a ${fee} hold is charged within the hour, refunded at check-in`;

/** The short form for a one-line summary: "then a $20 hold, refunded at check-in". */
export function afterCutoffShort(timing: string | null | undefined, fee: string): string {
  if (timing === 'late_cancel') return `then a ${fee} fee if you cancel`;
  if (timing === 'late_cancel_or_no_show') return `then a ${fee} fee if you cancel or don’t show`;
  return `then a ${fee} hold, refunded at check-in`;
}

/**
 * R-GOLF-008: what cancelling a booking costs right now, for the manage page —
 * the banner, the confirm step and the card subtitle, matching what
 * performCancellation() charges: free before the cutoff; after it, the late
 * fee or hold (kept if already taken, charged now if not), and GreenReserve's
 * booking fee with it when a card is on file (SP-B).
 */
export function cancelNowWords(b: {
  windowOpen: boolean;
  cancellationHours: number;
  feeCents: number;
  timing: string | null | undefined;
  feeAlreadyCharged: boolean;
  /** The booking fee charged with a kept late fee — 0 when none would be (no card, none on the booking). */
  bookingFeeCents: number;
  /** A no-show charge is live on this booking — cancelling keeps it and adds nothing. */
  noShowKept?: boolean;
}): { banner: string; confirm: string; subtitle: string } {
  // A no-show fee already charged is kept whatever the clock or policy says (performCancellation).
  if (b.noShowKept) {
    const s = 'The no-show fee already charged is kept if you cancel. Cancelling adds nothing.';
    return { banner: s, confirm: s, subtitle: s };
  }
  if (b.feeCents <= 0) {
    return { banner: 'Free cancellation any time — no late-cancellation fee.', confirm: 'Cancel for free — no charge to your card.', subtitle: 'Free to cancel any time — no late-cancellation fee.' };
  }
  const fee = money(b.feeCents);
  const isHold = (b.timing ?? 'hold_at_cutoff') === 'hold_at_cutoff';
  const what = isHold ? `${fee} hold` : `${fee} fee`;
  const plus = b.bookingFeeCents > 0 ? ` plus the ${money(b.bookingFeeCents)} booking fee` : '';
  // A fee already charged is kept whatever the clock says (performCancellation keeps it).
  if (b.feeAlreadyCharged) {
    return {
      banner: isHold
        ? `The ${what} has been charged to your card. It’s refunded when you check in, and kept if you cancel.`
        : `The ${what} has been charged to your card.`,
      confirm: `The ${what} already charged is kept${plus ? `, and the ${money(b.bookingFeeCents)} booking fee is charged` : ''}. None of it is refundable.`,
      subtitle: `The ${what} already charged is kept if you cancel.`,
    };
  }
  if (b.windowOpen) {
    return {
      banner: `Free cancellation until ${hours(b.cancellationHours)} before your tee time. ${afterCutoffLine(b.timing, fee)}`,
      confirm: 'Cancel for free — no charge to your card.',
      subtitle: 'Free right now — nothing is charged to your card.',
    };
  }
  return {
    banner: insideWindowLine(b.timing, fee),
    confirm: `Cancelling now charges the ${what}${plus} to your card. None of it is refundable.`,
    subtitle: `Cancelling now charges the ${what}${plus}.`,
  };
}

/** Cents as the golfer reads them: "$20", "$7.50". */
export const policyMoney = money;

/**
 * What the golfer reads, as short sentences. `headline` is one line for tight
 * spaces (the booking summary); `lines` is the full terms.
 */
export function describePolicy(p: CancelPolicy): { headline: string; lines: string[]; cardNeeded: boolean } {
  const lines: string[] = [];
  const card = cardRequired(p);
  const late = p.lateCancellationFeeCents > 0;
  if (late) {
    const fee = `${money(p.lateCancellationFeeCents)}${basis(p.lateFeeBasis)}`;
    lines.push(`Free cancellation until ${hours(p.cancellationHours)} before your tee time.`);
    lines.push(afterCutoffLine(p.lateFeeTiming, fee));
  } else {
    lines.push('Cancel any time before your tee time at no charge.');
  }
  if (p.noShowFeeCents > 0) {
    lines.push(`If you don’t show, a ${money(p.noShowFeeCents)}${basis(p.noShowFeeBasis)} no-show fee is charged to your card.`);
  }
  if (p.autoNoShowMinutes && chargesNoShow(p)) {
    lines.push(`A group not checked in ${p.autoNoShowMinutes} minutes after its tee time counts as a no-show.`);
  }
  if (card) {
    lines.push('Your card is saved at booking. Nothing else is charged until you play.');
  } else {
    lines.push(`No card needed to book. Check in and pay online with the link in your confirmation email — we’ll send it again ${hours(p.checkInWindowHours)} before your round.`);
  }
  const headline = late
    ? `Free cancellation until ${hours(p.cancellationHours)} before · then ${money(p.lateCancellationFeeCents)}${basis(p.lateFeeBasis)}`
    : card ? 'Free cancellation · card saved for no-shows' : 'Free cancellation · no card needed';
  return { headline, lines, cardNeeded: card };
}
