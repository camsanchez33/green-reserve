// Emails and texts redo (Cam 2026-11-19, lanes/build.md "Emails and texts redo — APPROVED",
// mockup lanes/build/emails-texts-mockup.html v17): every email a golfer gets, built on the
// one Letter layout (lib/email-layout). Golfer emails come FROM THE COURSE: the From name is
// the course's full name at noreply@ (no replies), the top is the course's name under a thin
// bar in its colour, and the footer is the course's name, address and phone, then "Powered by
// GreenReserve". Body: one line saying what happened, the essentials as stacked rows, one
// button with a text arrow, then at most a small "Change or cancel booking" link.
//
// Not in the body any more (Cam's approval): the cancellation policy (it lives on the booking
// details page; golfers agreed to it when they booked), "Questions?" lines, Privacy/Terms,
// emojis, itemised breakdowns the receipt page already shows.
//
// Pure: each builder takes the data and the course (looked up by the sender in lib/email.ts)
// and returns { subject, html, text }. scripts/emails-golfer-test.ts renders every one.
import { letterEmail, emailSite, emailDate, emailTime, usd, usdDollars, plural, longDate, subjectLine, type EmailCourse, type EmailRow, type EmailNote } from './email-layout';
import { serviceFeeLabel, SHOP_FEE_LABEL, EVENT_FEE_LABEL } from './booking-fees';
import { afterCutoffLine, policyMoney } from './cancel-policy';
import { membershipFeeCents } from './stripe';
import { confirmationLines, confirmationPartsOf, type ConfirmationParts } from './confirmation-parts';
import { saleRef } from './sale-ref';

export type BuiltEmail = { subject: string; html: string; text: string };
const built = (subject: string, input: Parameters<typeof letterEmail>[0]): BuiltEmail => ({ subject: subjectLine(subject), ...letterEmail(input) });
const from = (course: EmailCourse) => ({ from: 'course' as const, course });

// ---------- Links (every one is the long link the golfer already had) ----------
const enc = encodeURIComponent;
export const bookingLinks = (bookingId: string, token: string | null | undefined, courseSlug?: string | null) => {
  const site = emailSite();
  const page = courseSlug ? `${site}/courses/${enc(courseSlug)}` : site;
  return {
    /** The booking details page (the confirmation/receipt page). */
    details: token ? `${site}/receipt/${enc(bookingId)}?token=${enc(token)}` : page,
    /** Change or cancel. */
    manage: token ? `${site}/manage/${enc(bookingId)}?token=${enc(token)}` : page,
    /** Check in and pay (the pay link). */
    pay: token ? `${site}/checkin/${enc(bookingId)}?token=${enc(token)}` : '',
    page,
    hasToken: !!token,
  };
};

const roundRows = (d: { date: string; time: string; players?: number; holes?: number; productLabel?: string | null; price?: string; priceLabel?: string }): EmailRow[] => {
  const rows: EmailRow[] = [{ label: 'Date', value: emailDate(d.date) }, { label: 'Time', value: emailTime(d.time) }];
  if (d.players != null) rows.push({ label: 'Players', value: String(d.players) });
  if (d.holes != null) rows.push({ label: 'Holes', value: d.productLabel ? `${d.holes} · ${d.productLabel}` : String(d.holes) });
  if (d.price) rows.push({ label: d.priceLabel ?? 'Price', value: d.price });
  return rows;
};

// ---------- Booking ----------

export type ConfirmationData = {
  courseName: string; courseSlug?: string; date: string; time: string; players: number; holes: number; productLabel?: string | null;
  totalAmount: number; bookingId: string; checkInToken?: string;
  confirmationNote?: string | null; parts?: ConfirmationParts; testSend?: boolean;
};
/**
 * The course's own words (arrival, dress code, parking, note, contact) — Settings → Confirmation email.
 * Exactly confirmationLines(), default arrival line included, so the email matches the Settings preview.
 */
export function confirmationNotes(d: { parts?: ConfirmationParts; confirmationNote?: string | null }): EmailNote[] {
  return confirmationLines(d.parts ?? confirmationPartsOf({ confirmationNote: d.confirmationNote }))
    .map(l => ({ label: l.label || undefined, text: l.text }));
}
export function bookingConfirmationEmail(d: ConfirmationData, course: EmailCourse): BuiltEmail {
  const l = bookingLinks(d.bookingId, d.checkInToken, d.courseSlug);
  const subject = `Booked: ${emailDate(d.date)} at ${emailTime(d.time)} – ${d.courseName}`;
  return built(d.testSend ? `Test: ${subject}` : subject, {
    ...from(course),
    preheader: `${plural(d.players, 'player')}, ${d.holes} holes.`,
    line: `You’re booked at ${d.courseName}.`,
    rows: roundRows({ ...d, price: usd(d.totalAmount) }),
    notes: confirmationNotes(d),
    button: { label: 'See booking details', url: l.details },
    small: l.hasToken ? { label: 'Change or cancel booking', url: l.manage } : undefined,
    after: d.testSend ? ['Test email: this is what golfers get. Nothing was booked.'] : [],
  });
}

export type ModifiedData = {
  courseName: string; courseSlug?: string; date: string; time: string; players: number; holes: number; productLabel?: string | null;
  totalAmount: number; shopTotalCents?: number; shopFeeCents?: number; shopTaxCents?: number;
  bookingId: string; checkInToken: string | null; checkedIn?: boolean;
};
export function bookingModifiedEmail(d: ModifiedData, course: EmailCourse): BuiltEmail {
  const l = bookingLinks(d.bookingId, d.checkInToken, d.courseSlug);
  const grand = d.totalAmount + (d.shopTotalCents ?? 0) + (d.shopFeeCents ?? 0) + (d.shopTaxCents ?? 0);
  return built(`Changed: ${emailDate(d.date)} at ${emailTime(d.time)} – ${d.courseName}`, {
    ...from(course),
    preheader: `${plural(d.players, 'player')}, ${d.holes} holes.`,
    line: `Your booking at ${d.courseName} changed.`,
    rows: roundRows({ ...d, price: usd(grand), priceLabel: d.checkedIn ? 'Paid' : 'Price' }),
    button: { label: 'See booking details', url: l.details },
    small: l.hasToken && !d.checkedIn ? { label: 'Change or cancel booking', url: l.manage } : undefined,
  });
}

export type ReminderData = {
  courseName: string; courseSlug?: string; date: string; time: string; players: number; holes: number; productLabel?: string | null;
  bookingId: string; checkInToken?: string | null;
};
/** The day-before reminder. `totalCents` is the booking's price, read from the booking row by the sender. */
export function reminderEmail(d: ReminderData & { totalCents?: number | null }, course: EmailCourse): BuiltEmail {
  const l = bookingLinks(d.bookingId, d.checkInToken, d.courseSlug);
  return built(`Tomorrow: ${emailTime(d.time)} at ${d.courseName}`, {
    ...from(course),
    preheader: `${plural(d.players, 'player')}, ${d.holes} holes.`,
    line: `Your tee time is tomorrow at ${emailTime(d.time)}.`,
    rows: roundRows({ ...d, price: d.totalCents != null ? usd(d.totalCents) : undefined }),
    button: { label: 'See booking details', url: l.details },
    small: l.hasToken ? { label: 'Change or cancel booking', url: l.manage } : undefined,
  });
}

export type CancelWarningData = {
  courseName: string; courseSlug?: string; date: string; time: string; feeAmount: number; bookingId: string;
  cancellationHours: number; checkInToken?: string | null; lateFeeTiming?: string | null;
};
/** ~1 hour before free cancellation ends (card on file, a fee policy). The consequence line is the policy's own (afterCutoffLine). */
export function cancellationWarningEmail(d: CancelWarningData, course: EmailCourse): BuiltEmail {
  const l = bookingLinks(d.bookingId, d.checkInToken, d.courseSlug);
  return built(`Free cancellation ends soon: ${emailDate(d.date)} at ${emailTime(d.time)} – ${d.courseName}`, {
    ...from(course),
    preheader: 'Keeping your tee time? Nothing to do.',
    line: 'Free cancellation ends within the hour.',
    paragraphs: [afterCutoffLine(d.lateFeeTiming, policyMoney(d.feeAmount), 'once the window closes'), 'Keeping your tee time? Nothing to do.'],
    rows: roundRows(d),
    button: { label: 'Change or cancel booking', url: l.manage },
  });
}

export type CancelledData = {
  courseName: string; date: string; time: string; players: number; bookingId: string;
  feeCharged: boolean; feeAmount: number; refunded?: boolean; reason?: string;
};
/** The money line: kept in the cancellation email because it says what happened to their money. */
export function cancellationMoneyLine(d: { feeCharged: boolean; feeAmount: number; refunded?: boolean }): string {
  return !d.feeCharged
    ? (d.refunded ? 'What you paid has been refunded to your card. Nothing else was charged.' : 'You weren’t charged anything.')
    : `The ${usd(d.feeAmount)} cancellation fee you were charged is non-refundable: this cancellation came after free cancellation ended.`;
}
export function cancellationEmail(d: CancelledData, course: EmailCourse): BuiltEmail {
  return built(`Cancelled: ${emailDate(d.date)} at ${emailTime(d.time)} – ${d.courseName}`, {
    ...from(course),
    preheader: cancellationMoneyLine(d),
    line: `Your ${emailTime(d.time)} tee time is cancelled.`,
    paragraphs: d.reason ? [d.reason] : [],
    rows: roundRows({ date: d.date, time: d.time, players: d.players }),
    after: [cancellationMoneyLine(d)],
  });
}

export type FeeChargedData = { courseName: string; date: string; time: string; feeAmount: number; bookingId: string; checkInToken?: string | null };
/** The hold charged when free cancellation ended. Refunded at check-in, so not framed as final. */
export function cancellationFeeChargedEmail(d: FeeChargedData, course: EmailCourse): BuiltEmail {
  const l = bookingLinks(d.bookingId, d.checkInToken);
  return built(`Charged ${usd(d.feeAmount)}: ${emailDate(d.date)} at ${emailTime(d.time)} – ${d.courseName}`, {
    ...from(course),
    preheader: 'Refunded when you check in and pay for your round.',
    line: `Your card was charged ${usd(d.feeAmount)} to hold your tee time.`,
    paragraphs: [`Free cancellation ended, so the hold was charged. It’s refunded when you check in and pay for your round: use the button below on the day of your round.`],
    rows: [...roundRows(d), { label: 'Charged', value: usd(d.feeAmount) }],
    button: l.pay ? { label: 'Pay', url: l.pay } : undefined,
    small: l.hasToken ? { label: 'Change or cancel booking', url: l.manage } : undefined,
  });
}

export type PayLinkData = { courseName: string; date: string; time: string; bookingId: string; checkInToken?: string | null };
/** "Time to check in" with the golfer's pay link (lib/check-in-email, the cutoff cron, staff). Players and price come from the booking row. */
export function payLinkEmail(d: PayLinkData & { players?: number | null; totalCents?: number | null }, course: EmailCourse): BuiltEmail {
  const l = bookingLinks(d.bookingId, d.checkInToken);
  return built(`Pay for your ${emailTime(d.time)} tee time – ${d.courseName}`, {
    ...from(course),
    preheader: 'Apple Pay, Google Pay or card.',
    line: `Time to check in for your round at ${d.courseName}.`,
    rows: roundRows({ date: d.date, time: d.time, players: d.players ?? undefined, price: d.totalCents != null ? usd(d.totalCents) : undefined }),
    button: l.pay ? { label: 'Pay', url: l.pay } : undefined,
    small: l.hasToken ? { label: 'Change or cancel booking', url: l.manage } : undefined,
    after: l.pay ? [] : ['Check in at the pro shop when you arrive.'],
  });
}

export type FrostData = { courseName: string; date: string; oldTime: string; newTime: string; players: number; bookingId: string; checkInToken: string | null };
export function frostDelayEmail(d: FrostData, course: EmailCourse): BuiltEmail {
  const l = bookingLinks(d.bookingId, d.checkInToken);
  return built(`Frost delay: now ${emailTime(d.newTime)} – ${d.courseName}`, {
    ...from(course),
    preheader: `Your tee time moved from ${emailTime(d.oldTime)} to ${emailTime(d.newTime)}.`,
    line: `Frost delay: your tee time moved to ${emailTime(d.newTime)}.`,
    rows: [{ label: 'Date', value: emailDate(d.date) }, { label: 'Was', value: emailTime(d.oldTime) }, { label: 'Now', value: emailTime(d.newTime) }, { label: 'Players', value: String(d.players) }],
    after: ['Your price hasn’t changed. If the new time doesn’t work for your group, call the course.'],
    button: { label: 'See booking details', url: l.details },
    small: l.hasToken ? { label: 'Change or cancel booking', url: l.manage } : undefined,
  });
}

/** A note from the course to the day's golfers (lib/golfer-messages). One function sends and previews. */
export function courseNoticeEmail(d: { courseName: string; dateLabel: string; teeTime: string; body: string; course?: EmailCourse }): BuiltEmail {
  return built(`${d.courseName}: about your ${d.teeTime} tee time`, {
    ...from(d.course ?? { name: d.courseName }),
    preheader: d.body.slice(0, 90),
    line: `A note about your ${d.teeTime} tee time.`,
    paragraphs: [d.body],
    rows: [{ label: 'Date', value: d.dateLabel }, { label: 'Time', value: d.teeTime }],
  });
}

export type RoundReceiptLinkData = { courseName: string; date: string; time: string; bookingId: string; checkInToken: string };
export function roundReceiptLinkEmail(d: RoundReceiptLinkData, course: EmailCourse): BuiltEmail {
  const l = bookingLinks(d.bookingId, d.checkInToken);
  return built(`Your receipt – ${d.courseName}`, {
    ...from(course),
    preheader: `Your round on ${emailDate(d.date)}.`,
    line: `Thanks for playing ${d.courseName}.`,
    rows: roundRows(d),
    button: { label: 'View receipt', url: l.details },
  });
}

export type CheckInReceiptData = {
  courseName: string; courseSlug?: string; date: string; time: string; players: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number;
  shopLines?: { name: string; unitPriceCents: number; quantity: number }[]; shopFeeCents?: number; shopTaxCents?: number;
  feePaidAtBookingCents?: number; feeRefunded: boolean; feeRefundAmount: number; feeRefundFailed?: boolean;
  bookingId: string; checkInToken?: string | null;
};
/** Paid at check-in (online or at the counter). With a receipt page, the page itemises; without one, this email does. */
export function checkInReceiptEmail(d: CheckInReceiptData, course: EmailCourse): BuiltEmail {
  const l = bookingLinks(d.bookingId, d.checkInToken, d.courseSlug);
  const rows: EmailRow[] = roundRows({ date: d.date, time: d.time, players: d.players });
  if (!l.hasToken) {
    rows.push({ label: 'Green fee', value: usd(d.greenFeeTotal) });
    if (d.cartFeeTotal > 0) rows.push({ label: 'Cart', value: usd(d.cartFeeTotal) });
    if (d.rangeBallsTotal > 0) rows.push({ label: 'Range balls', value: usd(d.rangeBallsTotal) });
    rows.push({ label: serviceFeeLabel(d.players), value: usd(Math.max(0, d.accessFeeTotal - (d.feePaidAtBookingCents ?? 0))) });
    for (const s of d.shopLines ?? []) rows.push({ label: s.quantity > 1 ? `${s.name} × ${s.quantity}` : s.name, value: usd(s.unitPriceCents * s.quantity) });
    if (d.shopFeeCents) rows.push({ label: SHOP_FEE_LABEL, value: usd(d.shopFeeCents) });
    if (d.shopTaxCents) rows.push({ label: 'Sales tax on shop items', value: usd(d.shopTaxCents) });
  }
  rows.push({ label: 'Paid', value: usd(d.totalAmount) });
  const after: string[] = [];
  if (d.feeRefunded) after.push(`The ${usd(d.feeRefundAmount)} late-cancellation fee charged earlier has been refunded.`);
  if (d.feeRefundFailed) after.push(`Your earlier ${usd(d.feeRefundAmount)} late-cancellation fee is owed back to you, but the automatic refund didn’t go through. The course has been told; if it hasn’t appeared within a few days, call the course.`);
  return built(`Receipt: ${usd(d.totalAmount)} – ${d.courseName}`, {
    ...from(course),
    preheader: `Paid ${usd(d.totalAmount)} on ${emailDate(d.date)}.`,
    line: `You paid ${usd(d.totalAmount)} at ${d.courseName}.`,
    rows,
    button: l.hasToken ? { label: 'View receipt', url: l.details } : undefined,
    after,
  });
}

export type RefundData = { courseName: string; date: string; time: string; amountCents: number; full: boolean; reason: string; bookingId: string };
export function refundEmail(d: RefundData, course: EmailCourse): BuiltEmail {
  return built(`Refund: ${usd(d.amountCents)} – ${d.courseName}`, {
    ...from(course),
    preheader: 'It goes back to the card you paid with.',
    line: `${usd(d.amountCents)} is on its way back to your card.`,
    paragraphs: d.reason ? [d.reason] : [],
    rows: [...roundRows(d), { label: d.full ? 'Refund' : 'Refund (partial)', value: usd(d.amountCents) }],
    after: ['Refunds usually show on your statement within 5 to 10 business days, depending on your bank.'],
  });
}

// ---------- Tee time alerts ----------

const alertDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
export type AlertData = { courseName: string; courseSlug: string; date: string; time?: string; players: number; lastDate?: string };
/** A watched time opened. First come, first served; nothing is held. `stopUrl` stops the alert. */
export function teeTimeAlertEmail(d: AlertData, course: EmailCourse, stopUrl: string): BuiltEmail {
  const bookUrl = `${emailSite()}/courses/${enc(d.courseSlug)}?date=${enc(d.date)}&players=${d.players}`;
  const time = d.time ? emailTime(d.time) : '';
  const rows: EmailRow[] = [{ label: 'Date', value: alertDay(d.date) }];
  if (time) rows.push({ label: 'Time', value: time });
  rows.push({ label: 'Room for', value: plural(d.players, 'player') });
  return built(`A tee time opened: ${alertDay(d.date)}${time ? ` at ${time}` : ''}`, {
    ...from(course),
    preheader: `Room for ${plural(d.players, 'player')}. First come, first served.`,
    line: `A tee time just opened at ${d.courseName}.`,
    rows,
    button: { label: 'Book this time', url: bookUrl },
    after: ['It isn’t held for you. First come, first served.', d.lastDate ? `This alert ends after ${new Date(d.lastDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}.` : ''],
    stop: { label: 'Stop this alert', url: stopUrl },
  });
}

export type AlertConfirmData = { courseName: string; dates: string[]; players: number; phone?: string | null };
/** A guest's alert turns on only from this link. */
export function alertConfirmEmail(d: AlertConfirmData, course: EmailCourse, confirmUrl: string, stopUrl: string): BuiltEmail {
  const days = d.dates.map(alertDay).join(', ');
  const by = d.phone ? `, by email and by text to the number ending ${String(d.phone).slice(-4)}` : '';
  return built(`Turn on your tee time alert – ${d.courseName}`, {
    ...from(course),
    preheader: 'Nothing is sent until you turn it on.',
    line: 'Turn on your tee time alert.',
    paragraphs: [`You asked ${d.courseName} to tell you when a time opens on ${days} for ${plural(d.players, 'player')}${by}. Nothing is sent until you turn it on.`],
    button: { label: 'Turn on alert', url: confirmUrl },
    after: ['Didn’t ask for this? Ignore this email and nothing will be sent.'],
    stop: { label: 'Stop this alert', url: stopUrl },
  });
}

// ---------- Members ----------

export type MemberInviteData = { name: string; courseName: string; groupName: string; coursePageUrl: string; benefits: string; memberPricing: boolean };
/** GOLFER-LOGIN-1: one invite for every member, "Log in", never "sign in as a member". */
export function memberInviteAfter(d: { benefits: string; memberPricing: boolean }): string {
  // Members pricing off (Build 2026-11-19): no rate is promised.
  const offLine = !d.benefits ? '' : d.benefits.startsWith('book ') ? `You can ${d.benefits}.` : `${d.benefits[0].toUpperCase()}${d.benefits.slice(1)}.`;
  return `Log in with this email address ${d.memberPricing ? `to get your rates${d.benefits ? `: ${d.benefits}.` : '.'}` : `to book.${offLine ? ` ${offLine}` : ''}`}`;
}
export function memberInviteEmail(d: MemberInviteData, course: EmailCourse): BuiltEmail {
  return built(`${d.courseName} set you up as a ${d.groupName}`, {
    ...from(course),
    preheader: 'Log in with this email address.',
    line: `${d.courseName} set you up as a ${d.groupName}.`,
    paragraphs: [memberInviteAfter(d)],
    button: { label: `Log in to ${d.courseName}`, url: d.coursePageUrl },
    after: ['No password: we email you a code each time. Didn’t expect this? Call the pro shop. Nothing happens until you log in.'],
  });
}

export function memberMagicLinkEmail(d: { courseName: string; magicLink: string }, course: EmailCourse): BuiltEmail {
  return built(`Log in to ${d.courseName}`, {
    ...from(course),
    preheader: 'This link works for 15 minutes.',
    line: `Log in to ${d.courseName}.`,
    button: { label: 'Log in', url: d.magicLink },
    after: ['This link works for 15 minutes. If you didn’t try to log in, ignore this email.'],
  });
}

export function memberLoginCodeEmail(d: { courseName: string; code: string }, course: EmailCourse): BuiltEmail {
  const shown = `${d.code.slice(0, 3)} ${d.code.slice(3)}`;
  return built(`Your ${d.courseName} log-in code: ${shown}`, {
    ...from(course),
    preheader: 'It works for 10 minutes.',
    line: 'Your log-in code',
    code: shown,
    paragraphs: [`Enter this code to log in to ${d.courseName}. It works for 10 minutes. If you didn’t ask for it, you can ignore this email.`],
  });
}

export type DuesPayLinkData = { courseName: string; tierName: string; annualFee: number; initiationFee: number; payLink: string; isRenewal?: boolean };
/** Same rule the pay page charges (amountsDue() in api/membership/[id]): dues + GreenReserve's 1%. */
export function duesPayLinkEmail(d: DuesPayLinkData, course: EmailCourse): BuiltEmail {
  const dues = d.annualFee + d.initiationFee;
  const feeCents = membershipFeeCents(Math.round(dues * 100));
  const totalCents = Math.round(dues * 100) + feeCents;
  const rows: EmailRow[] = [];
  if (d.initiationFee > 0) rows.push({ label: 'One-time initiation fee', value: usdDollars(d.initiationFee) });
  rows.push({ label: `${d.tierName} dues`, value: usdDollars(d.annualFee) });
  if (feeCents > 0) rows.push({ label: 'GreenReserve service fee (1% of dues)', value: usd(feeCents) });
  rows.push({ label: 'Total', value: usd(totalCents) });
  return built(d.isRenewal ? `Renew your membership – ${d.courseName}` : `Pay your membership dues – ${d.courseName}`, {
    ...from(course),
    preheader: `${usd(totalCents)}. Apple Pay, Google Pay or card.`,
    line: d.isRenewal ? `Time to renew your ${d.tierName} membership.` : `${d.courseName} set you up as a ${d.tierName} member.`,
    rows,
    button: { label: `Pay ${usd(totalCents)}`, url: d.payLink },
    after: [`Your dues go to ${d.courseName}. Paying at the pro shop instead? Let the course know.`],
  });
}

export type DuesReceiptData = { courseName: string; tierName: string; amountPaid: number; serviceFee: number; expiresAt: Date | null };
export function duesReceiptEmail(d: DuesReceiptData, course: EmailCourse): BuiltEmail {
  const rows: EmailRow[] = [{ label: 'Membership', value: d.tierName }];
  if (d.serviceFee > 0) {
    rows.push({ label: 'Dues', value: usdDollars(d.amountPaid - d.serviceFee) });
    rows.push({ label: 'GreenReserve service fee (1% of dues)', value: usdDollars(d.serviceFee) });
  }
  rows.push({ label: 'Paid', value: usdDollars(d.amountPaid) });
  if (d.expiresAt) rows.push({ label: 'Active through', value: longDate(d.expiresAt) });
  return built(`Receipt: ${d.tierName} membership – ${d.courseName}`, {
    ...from(course),
    preheader: `Paid ${usdDollars(d.amountPaid)}.`,
    line: `You paid ${usdDollars(d.amountPaid)} to ${d.courseName}.`,
    rows,
    after: ['Keep this email as your receipt. Your rates apply when you book logged in.'],
  });
}

export type AutoRenewOnData = { courseName: string; tierName: string; terms: string; renewsOn: Date | null; totalCents: number; manageLink: string };
export function autoRenewOnEmail(d: AutoRenewOnData, course: EmailCourse): BuiltEmail {
  const rows: EmailRow[] = [{ label: 'Membership', value: d.tierName }];
  if (d.renewsOn) rows.push({ label: 'Renews', value: longDate(d.renewsOn) });
  rows.push({ label: 'Amount', value: usd(d.totalCents) });
  return built(`Automatic renewal is on – ${d.courseName}`, {
    ...from(course),
    preheader: `${usd(d.totalCents)} each renewal.`,
    line: 'Your membership will renew automatically.',
    rows,
    notes: [{ label: 'The terms you agreed to', text: d.terms }],
    button: { label: 'Manage automatic renewal', url: d.manageLink },
  });
}

export function autoRenewReminderEmail(d: { courseName: string; tierName: string; renewsOn: Date; totalCents: number; manageLink: string }, course: EmailCourse): BuiltEmail {
  return built(`Your membership renews on ${longDate(d.renewsOn)} – ${d.courseName}`, {
    ...from(course),
    preheader: `${usd(d.totalCents)} to the card you saved.`,
    line: `Your membership renews on ${longDate(d.renewsOn)}.`,
    rows: [{ label: 'Membership', value: d.tierName }, { label: 'Renews', value: longDate(d.renewsOn) }, { label: 'Amount', value: usd(d.totalCents) }],
    paragraphs: [`${usd(d.totalCents)} will be charged to the card you saved. Nothing to do if you’d like to keep it. Don’t want to renew? Turn automatic renewal off before then; your membership runs to the end of the period you’ve paid for.`],
    button: { label: 'Turn off automatic renewal', url: d.manageLink },
  });
}

export function autoRenewDeclinedEmail(d: { courseName: string; tierName: string; totalCents: number; payLink: string; retryOn: Date | null }, course: EmailCourse): BuiltEmail {
  return built(`Your membership renewal didn’t go through – ${d.courseName}`, {
    ...from(course),
    preheader: 'Pay with another card to keep your rates.',
    line: 'Your membership renewal didn’t go through.',
    paragraphs: [`We couldn’t charge ${usd(d.totalCents)} to your saved card to renew your ${d.tierName} membership.${d.retryOn ? ` We’ll try the card once more on ${longDate(d.retryOn)}.` : ''} To keep your rates, pay with another card.`],
    rows: [{ label: 'Membership', value: d.tierName }, { label: 'Due', value: usd(d.totalCents) }],
    button: { label: `Pay ${usd(d.totalCents)}`, url: d.payLink },
  });
}

export function autoRenewOffEmail(d: { courseName: string; tierName: string; endsOn: Date | null }, course: EmailCourse): BuiltEmail {
  return built(`Automatic renewal is off – ${d.courseName}`, {
    ...from(course),
    preheader: 'Your card won’t be charged.',
    line: 'Automatic renewal is off.',
    paragraphs: [`Your ${d.tierName} membership won’t renew automatically, and your card won’t be charged.${d.endsOn ? ` Your membership runs through ${longDate(d.endsOn)}.` : ''} You can renew any time from the course’s reminder email.`],
  });
}

const monthName = (period: string) => { const [y, m] = period.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
export function statementEmail(d: { courseName: string; period: string; totalCents: number; lineCount: number; dueAt: Date; chargeOn: Date | null; payLink: string }, course: EmailCourse): BuiltEmail {
  const rows: EmailRow[] = [{ label: 'Items', value: String(d.lineCount) }, { label: 'Total', value: usd(d.totalCents) }];
  rows.push(d.chargeOn ? { label: 'Charged to your card', value: longDate(d.chargeOn) } : { label: 'Due by', value: longDate(d.dueAt) });
  return built(`Your ${d.courseName} statement – ${monthName(d.period)}`, {
    ...from(course),
    preheader: `${usd(d.totalCents)} for ${monthName(d.period)}.`,
    line: `Your ${monthName(d.period)} statement is ready.`,
    rows,
    after: d.chargeOn ? ['To pay another way, use the button before then.'] : [],
    button: { label: d.chargeOn ? 'See the statement' : `Pay ${usd(d.totalCents)}`, url: d.payLink },
  });
}

export function statementDeclinedEmail(d: { courseName: string; period: string; totalCents: number; dueAt: Date; retryOn: Date | null; payLink: string }, course: EmailCourse): BuiltEmail {
  return built(`Your ${d.courseName} statement didn’t go through`, {
    ...from(course),
    preheader: `Due by ${longDate(d.dueAt)}.`,
    line: 'Your statement payment didn’t go through.',
    paragraphs: [`We couldn’t charge ${usd(d.totalCents)} to your saved card for your ${monthName(d.period)} statement.${d.retryOn ? ` We’ll try the card once more on ${longDate(d.retryOn)}.` : ''} After the due date nothing more can go on your account until it’s paid.`],
    rows: [{ label: 'Total', value: usd(d.totalCents) }, { label: 'Due by', value: longDate(d.dueAt) }],
    button: { label: `Pay ${usd(d.totalCents)}`, url: d.payLink },
  });
}

export function statementPaidEmail(d: { courseName: string; period: string; amountCents: number; cardSaved: boolean; link: string }, course: EmailCourse): BuiltEmail {
  return built(`Statement paid – ${d.courseName}`, {
    ...from(course),
    preheader: `Paid ${usd(d.amountCents)}.`,
    line: `You paid ${usd(d.amountCents)} for your ${monthName(d.period)} statement.`,
    rows: [{ label: 'Statement', value: monthName(d.period) }, { label: 'Paid', value: usd(d.amountCents) }],
    after: d.cardSaved ? ['This card will be charged for your next statements, 3 days after each one is emailed. You can turn that off from any statement.'] : [],
    button: { label: 'See the statement', url: d.link },
  });
}

// ---------- Events ----------

export type SignupVariant = 'in' | 'paid' | 'waitlist' | 'moved_in';
export type EventSignupData = {
  variant: SignupVariant; name: string; players: string[]; courseName: string;
  eventName: string; dateLabel: string; startLabel: string; paidCents: number; terms: string;
};
export function eventSignupHeading(v: SignupVariant): string {
  return v === 'waitlist' ? 'You’re on the waiting list' : v === 'moved_in' ? 'A spot opened: you’re in' : 'You’re signed up';
}
export function eventSignupEmail(d: EventSignupData, course: EmailCourse): BuiltEmail {
  const wait = d.variant === 'waitlist';
  const heading = eventSignupHeading(d.variant);
  const lead = wait
    ? `${d.eventName} is full right now, so you’re on the waiting list. The course will email you if a spot opens. Nothing has been charged.`
    : d.variant === 'moved_in' ? `${d.courseName} moved you off the waiting list: you’re playing in ${d.eventName}.` : '';
  const rows: EmailRow[] = [
    { label: 'Event', value: d.eventName }, { label: 'Date', value: d.dateLabel }, { label: 'Start', value: d.startLabel },
    { label: d.players.length === 1 ? 'Player' : 'Players', value: d.players.join('\n') },
  ];
  if (d.variant === 'paid' && d.paidCents) rows.push({ label: 'Paid', value: usd(d.paidCents) });
  return built(`${heading}: ${d.eventName}`, {
    ...from(course),
    preheader: `${d.eventName}, ${d.dateLabel}.`,
    line: `${heading}.`,
    paragraphs: lead ? [lead] : [],
    rows,
    notes: d.terms && !wait ? [{ label: `${d.courseName}’s terms`, text: d.terms }] : [],
  });
}

export type EventPayLinkData = { courseName: string; eventName: string; dateLabel: string; label: string; amountCents: number; feeCents: number; payUrl: string; terms: string };
export function eventPayLinkEmail(d: EventPayLinkData, course: EmailCourse): BuiltEmail {
  const total = d.amountCents + d.feeCents;
  const rows: EmailRow[] = [{ label: 'Event', value: d.eventName }, { label: 'Date', value: d.dateLabel }, { label: d.label, value: usd(d.amountCents) }];
  if (d.feeCents) rows.push({ label: EVENT_FEE_LABEL, value: usd(d.feeCents) });
  rows.push({ label: 'Total', value: usd(total) });
  return built(`${d.label} for ${d.eventName} – ${d.courseName}`, {
    ...from(course),
    preheader: `${usd(total)}. Apple Pay, Google Pay or card.`,
    line: `${d.label} for ${d.eventName}.`,
    rows,
    notes: d.terms ? [{ label: `${d.courseName}’s terms`, text: d.terms }] : [],
    button: { label: `Pay ${usd(total)}`, url: d.payUrl },
    after: ['Apple Pay, Google Pay or card.'],
  });
}

export type PairingsData = { courseName: string; eventName: string; dateLabel: string; startLabel: string; groupNo: number; startHole: string | null; groupmates: string[] };
export function eventPairingsEmail(d: PairingsData, course: EmailCourse): BuiltEmail {
  const rows: EmailRow[] = [{ label: 'Date', value: d.dateLabel }, { label: d.startHole ? 'Shotgun' : 'Tee time', value: d.startLabel }, { label: 'Group', value: String(d.groupNo) }];
  if (d.startHole) rows.push({ label: 'Starting hole', value: d.startHole });
  if (d.groupmates.length) rows.push({ label: 'Playing with', value: d.groupmates.join('\n') });
  return built(`Your group for ${d.eventName}`, {
    ...from(course),
    preheader: `${d.dateLabel}, ${d.startLabel}.`,
    line: `Your group for ${d.eventName}.`,
    rows,
  });
}

// ---------- Pro shop ----------

type ShopLine = { name: string; unitPriceCents: number; quantity: number };
const shopRows = (lines: ShopLine[], o: { discountCents?: number; discountNote?: string; taxCents?: number; feeCents?: number }): EmailRow[] => {
  const rows: EmailRow[] = lines.map(l => ({ label: l.quantity > 1 ? `${l.name} × ${l.quantity}` : l.name, value: usd(l.unitPriceCents * l.quantity) }));
  if (o.discountCents) rows.push({ label: `Discount${o.discountNote ? ` (${o.discountNote})` : ''}`, value: `−${usd(o.discountCents)}` });
  if (o.taxCents) rows.push({ label: 'Sales tax', value: usd(o.taxCents) });
  if (o.feeCents) rows.push({ label: SHOP_FEE_LABEL, value: usd(o.feeCents) });
  return rows;
};

export type ShopPayLinkData = { courseName: string; totalCents: number; taxCents?: number; lines: ShopLine[]; payUrl: string; discountCents?: number; discountNote?: string; serviceFeeCents?: number };
export function shopPayLinkEmail(d: ShopPayLinkData, course: EmailCourse): BuiltEmail {
  return built(`Pay for your pro shop items – ${d.courseName}`, {
    ...from(course),
    preheader: `${usd(d.totalCents)}. Apple Pay, Google Pay or card.`,
    line: `Your pro shop total is ${usd(d.totalCents)}.`,
    rows: [...shopRows(d.lines, { discountCents: d.discountCents, discountNote: d.discountNote, taxCents: d.taxCents, feeCents: d.serviceFeeCents }), { label: 'Total', value: usd(d.totalCents) }],
    button: { label: `Pay ${usd(d.totalCents)}`, url: d.payUrl },
    after: ['Apple Pay, Google Pay or card.'],
  });
}

export type ShopReceiptData = {
  courseName: string; saleId: string; saleNumber?: number | null; lines: ShopLine[];
  discountCents: number; discountNote: string; taxCents: number; totalCents: number;
  paidWith: string; paidAt: string; cashTenderedCents: number | null; refundedCents: number; serviceFeeCents?: number;
};
/** There is no receipt page for a walk-up sale, so this email is the whole receipt. */
export function shopReceiptEmail(d: ShopReceiptData, course: EmailCourse): BuiltEmail {
  const rows = shopRows(d.lines, { discountCents: d.discountCents, discountNote: d.discountNote, taxCents: d.taxCents, feeCents: d.serviceFeeCents });
  rows.push({ label: 'Paid', value: usd(d.totalCents) });
  rows.push({ label: 'Paid with', value: `${d.paidWith} · ${d.paidAt}` });
  if (d.cashTenderedCents != null) rows.push({ label: 'Cash given · change', value: `${usd(d.cashTenderedCents)} · ${usd(d.cashTenderedCents - d.totalCents)}` });
  if (d.refundedCents) rows.push({ label: 'Refunded', value: `−${usd(d.refundedCents)}` });
  rows.push({ label: 'Receipt', value: saleRef(d.saleId, d.saleNumber) });
  return built(`Your receipt – ${d.courseName}`, {
    ...from(course),
    preheader: `Paid ${usd(d.totalCents)}.`,
    line: `You paid ${usd(d.totalCents)} at ${d.courseName}.`,
    rows,
  });
}
