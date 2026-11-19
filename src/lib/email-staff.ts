// Emails and texts redo (Cam 2026-11-19, lanes/build.md "Emails and texts redo — APPROVED", mockup
// lanes/build/emails-texts-mockup.html v17): every email GreenReserve sends in its own name — to
// course staff, to courses in onboarding, and to Cam — on the one Letter layout (lib/email-layout)
// with the GreenReserve logo at the top and greenreserve.app in the footer. Cam's own replies are
// plain personal emails (plainEmail), with no layout.
//
// Where replies go is unchanged from before: admin@ (a reply reaches Cam) for everything but codes,
// sign-in links and security alerts, which come from noreply@ and name admin@ instead (MAIL-1).
//
// Pure: each builder takes the data and returns { subject, html, text }. scripts/emails-staff-test.ts
// renders every one.
import { letterEmail, plainEmail, emailSite, emailDate, emailTime, usd, plural, subjectLine, type EmailRow, type EmailNote, type LetterInput } from './email-layout';
import { welcomeParts, type WelcomeInput } from './team-welcome';
import { sheetRecap, SHEET_NEXT_STEPS } from './setup-sheet-recap';
import { ADMIN_EMAIL } from './contact';

export type BuiltEmail = { subject: string; html: string; text: string };
const gr = (subject: string, input: Omit<LetterInput, 'from'>): BuiltEmail => ({ subject: subjectLine(subject), ...letterEmail({ from: 'greenreserve', ...input }) });
const site = () => emailSite();
const first = (full: string | null | undefined) => (full ?? '').trim().split(/\s+/)[0] || 'there';

/** The line routine staff notices end with (they come from admin@, so a reply reaches Cam). */
export const STAFF_QUESTIONS = 'Questions? Reply to this email, or ask in Course support in your dashboard.';
/** LQ-2 (legal/LQ-2_FEE_COPY.md), the allowed sentences, verbatim. */
export const FEE_SENTENCES = 'Golfers pay $1.50 per player on each online booking, added to your price. Stripe’s standard card-processing fee applies to the payment, the same as any card you take today. GreenReserve charges you nothing on top of it.';

// ---------- Course staff ----------

export type OperatorBookingData = {
  golferName: string; golferEmail: string; courseName: string; date: string; time: string; players: number; holes: number; productLabel?: string | null;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal?: number; noCard?: boolean; feePaidAtBooking?: boolean;
};
/** A golfer booked online (if the course wants these). "Expected" = green + cart, as Payments shows it: nothing is charged yet. */
export function operatorBookingEmail(d: OperatorBookingData): BuiltEmail {
  const rows: EmailRow[] = [
    { label: 'Golfer', value: `${d.golferName}\n${d.golferEmail}` },
    { label: 'Date', value: emailDate(d.date) }, { label: 'Time', value: emailTime(d.time) },
    { label: 'Players', value: String(d.players) },
    { label: 'Holes', value: d.productLabel ? `${d.holes} · ${d.productLabel}` : String(d.holes) },
    { label: 'Green fee', value: usd(d.greenFeeTotal) },
  ];
  if (d.cartFeeTotal > 0) rows.push({ label: 'Cart', value: usd(d.cartFeeTotal) });
  if ((d.rangeBallsTotal ?? 0) > 0) rows.push({ label: 'Range balls', value: usd(d.rangeBallsTotal ?? 0) });
  rows.push({ label: 'Expected', value: usd(d.greenFeeTotal + d.cartFeeTotal) });
  const card = d.noCard
    ? 'No card was taken: the golfer pays at the course or with the check-in link.'
    : d.feePaidAtBooking
      ? 'Their card is saved. Only GreenReserve’s booking fee was charged; the round is charged when they check in (or when free cancellation ends).'
      : 'Their card is saved. Nothing is charged until they check in (or when free cancellation ends).';
  return gr(`New booking at ${d.courseName}: ${plural(d.players, 'player')} – ${emailDate(d.date)} at ${emailTime(d.time)}`, {
    preheader: `${d.golferName}, ${plural(d.players, 'player')}.`,
    line: `New online booking at ${d.courseName}.`,
    rows,
    after: [card, `Expected once they check in and pay. ${FEE_SENTENCES.split('. ')[0]}.`, STAFF_QUESTIONS],
    button: { label: 'Open the tee sheet', url: `${site()}/dashboard` },
    small: { label: 'See it in Payments', url: `${site()}/dashboard/money?tab=payments` },
  });
}

/** MP-5b: the course was taken offline or archived. From admin@: a reply reaches Cam. */
export function courseClosedEmail(d: { courseName: string; action: 'offline' | 'archived'; cancelledCount: number }): BuiltEmail {
  const what = d.action === 'archived' ? 'archived' : 'taken offline';
  const bookingLine = d.cancelledCount === 0
    ? 'There were no upcoming bookings, so no golfers were affected.'
    : `${d.cancelledCount} upcoming booking${d.cancelledCount === 1 ? ' was' : 's were'} cancelled, and ${d.cancelledCount === 1 ? 'that golfer has' : 'those golfers have'} been emailed. Nobody was charged for a round they won’t play.`;
  return gr(`${d.courseName} is no longer taking bookings on GreenReserve`, {
    line: `${d.courseName} has been ${what}.`,
    paragraphs: ['Your GreenReserve booking page is no longer taking tee times.', bookingLine,
      'Nothing has been deleted: your tee sheet, bookings and history are all still here, and we can put you back online whenever you’re ready. If this isn’t what you expected, reply to this email.'],
  });
}

/** Team: the invite. Its words come from lib/team-welcome (the Invite popup previews this exact email). */
export function staffWelcomeEmail(d: WelcomeInput, setupLink: string): BuiltEmail {
  const w = welcomeParts(d);
  return gr(w.subject, {
    preheader: w.preheader,
    line: w.line,
    paragraphs: [w.intro],
    rows: w.rows,
    button: { label: w.button, url: setupLink },
    after: [w.footer],
  });
}

export function staffResetLinkEmail(d: { to: string; personName: string; ownerName: string; courseName: string; resetLink: string }): BuiltEmail {
  const owner = d.ownerName.trim() || 'The course owner';
  return gr(`Set a new password for ${d.courseName}`, {
    preheader: 'The link works once, for 1 hour.',
    line: 'Set a new password.',
    paragraphs: [`${owner} at ${d.courseName} sent you a link to set a new password for your GreenReserve login (${d.to}). Your current password works until you change it.`],
    button: { label: 'Set a new password', url: d.resetLink },
    after: [`This link works once, for 1 hour. Didn’t expect this? Ask ${owner}, or write to ${ADMIN_EMAIL}.`],
  });
}

export function operatorPasswordResetEmail(d: { operatorEmail: string; resetLink: string }): BuiltEmail {
  return gr('Reset your GreenReserve password', {
    preheader: 'This link expires in 1 hour.',
    line: 'Reset your password.',
    paragraphs: [`We got a request to reset the password on your GreenReserve dashboard (${d.operatorEmail}). If this wasn’t you, you can ignore this email.`],
    button: { label: 'Set a new password', url: d.resetLink },
    after: [`This link expires in 1 hour. Questions? Email ${ADMIN_EMAIL}.`],
  });
}

export function operatorVerifyEmail(d: { operatorEmail: string; verifyLink: string }): BuiltEmail {
  return gr('Confirm your GreenReserve account', {
    preheader: 'Confirm your email to finish setting up.',
    line: 'Confirm your email.',
    paragraphs: [`Confirm ${d.operatorEmail} to finish setting up your GreenReserve dashboard.`],
    button: { label: 'Confirm my email', url: d.verifyLink },
    after: [`Didn’t ask for this? You can ignore this email. Questions? Email ${ADMIN_EMAIL}.`],
  });
}

export function twoFactorCodeEmail(d: { code: string }): BuiltEmail {
  return gr(`Your GreenReserve verification code: ${d.code}`, {
    preheader: 'It expires in 10 minutes.',
    line: 'Your sign-in code',
    code: d.code,
    paragraphs: ['Enter this code to finish signing in to your GreenReserve dashboard. It expires in 10 minutes.'],
    after: [`Didn’t try to sign in? Email ${ADMIN_EMAIL}.`],
  });
}

export function passwordChangedEmail(d: { email: string; admin?: boolean }): BuiltEmail {
  const what = d.admin ? 'admin account' : 'dashboard';
  return gr(d.admin ? 'Your GreenReserve admin password was changed' : 'Your GreenReserve password was changed', {
    line: 'Your password was changed.',
    paragraphs: [`This confirms the password on your GreenReserve ${what} (${d.email}) was just changed.`],
    after: [`Wasn’t you? Email ${ADMIN_EMAIL} right away.`],
  });
}

export function messageNotificationEmail(d: { senderName: string; courseName: string; messageBody: string; replyUrl: string }): BuiltEmail {
  const preview = d.messageBody.length > 200 ? d.messageBody.slice(0, 200) + '…' : d.messageBody;
  return gr(`Message from ${d.senderName} – ${d.courseName}`, {
    preheader: preview.slice(0, 90),
    line: `${d.senderName} sent a message about ${d.courseName}.`,
    paragraphs: [preview],
    button: { label: 'View and reply', url: d.replyUrl },
    after: ['Reply from the button so the conversation stays in one place.'],
  });
}

/** Cam's announcement to every course. The text is Cam's, escaped (it was never meant as HTML). */
export function announcementEmail(d: { title: string; body: string }): BuiltEmail {
  return gr(`[GreenReserve] ${d.title}`, {
    preheader: d.body.slice(0, 90),
    line: d.title,
    paragraphs: d.body.split(/\n{2,}/).map(x => x.trim()).filter(Boolean),
    after: ['From the GreenReserve team to every course on GreenReserve.', STAFF_QUESTIONS],
  });
}

/** BI-1: the monthly review. No metrics in the email (Cam 2026-11-19): the review lives in the dashboard. */
export function monthlyReviewEmail(d: { courseName: string; monthLabel: string }): BuiltEmail {
  const month = d.monthLabel.replace(/\s+\d{4}$/, '');
  return gr(`${d.courseName}: your ${d.monthLabel} review`, {
    preheader: 'Open it in your dashboard.',
    line: `Your ${month} review from GreenReserve is ready.`,
    button: { label: 'Open your review', url: `${site()}/dashboard/analytics#reviews` },
    topBar: false,
  });
}

export function lowStockEmail(d: { courseName: string; items: { name: string; stockCount: number; reorderAt: number }[] }): BuiltEmail {
  const one = d.items.length === 1;
  return gr(one ? `Low stock: ${d.items[0].name}` : `Low stock: ${d.items.length} items at ${d.courseName}`, {
    line: one ? 'An item is running low.' : `${d.items.length} items are running low.`,
    paragraphs: [`${one ? 'This item' : 'These items'} in the ${d.courseName} pro shop reached the number you set to be reminded at. We won’t email about ${one ? 'it' : 'them'} again until ${one ? 'it’s' : 'each is'} restocked above that number.`],
    rows: d.items.map(i => ({ label: i.name, value: `${Math.max(0, i.stockCount)} left (reminder at ${i.reorderAt})` })),
    button: { label: 'Open the pro shop', url: `${site()}/dashboard/shop` },
    after: [STAFF_QUESTIONS],
  });
}

export type SignedAgreementsData = { courseName: string; legalName: string; signerName: string; signerEmail: string; acceptedAt: Date; documents: { title: string; version: string }[]; pending: string[]; attached: boolean };
export function signedAgreementsEmail(d: SignedAgreementsData): BuiltEmail {
  const when = d.acceptedAt.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' }) + ' ET';
  const after: string[] = [];
  if (d.pending.length) after.push(`The PDF for ${d.pending.join(' and ')} is still being prepared and will follow.`);
  after.push(`Signed electronically from ${d.signerEmail}. Keep this email for your records. Questions? Reply to this email.`);
  return gr(`Your signed GreenReserve agreements – ${d.courseName}`, {
    line: 'Your signed GreenReserve agreements.',
    paragraphs: [`${d.signerName || 'You'} signed these for ${d.legalName || d.courseName} on ${when}.${d.attached ? ' The signed copies are attached.' : ''}`],
    rows: d.documents.map(x => ({ label: x.title, value: `v${x.version}` })),
    after,
  });
}

export function agreementBumpEmail(d: { courseName: string; title: string; version: string; effectiveAt: Date; reacceptBy: Date; changeSummary: string }): BuiltEmail {
  const day = (x: Date) => x.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  return gr(`Action needed: the GreenReserve ${d.title} changed – sign by ${day(d.reacceptBy)}`, {
    preheader: `Please sign it by ${day(d.reacceptBy)}.`,
    line: `The ${d.title} has changed.`,
    paragraphs: [`A new version (v${d.version}) of the GreenReserve ${d.title} took effect on ${day(d.effectiveAt)} for ${d.courseName}. Please review and sign it by ${day(d.reacceptBy)}.`],
    notes: d.changeSummary ? [{ label: 'What changed', text: d.changeSummary }] : [],
    button: { label: 'Review and sign', url: `${site()}/dashboard/sign` },
    after: [`After ${day(d.reacceptBy)}, course settings in your dashboard become read-only until the new version is signed. Bookings and check-ins are never affected.`, 'Questions? Reply to this email.'],
  });
}

// ---------- Courses in onboarding (from admin@: replies reach Cam) ----------

export const INQUIRY_CALL_FALLBACK_URL = 'https://calendly.com/greenreserve';

export function inquiryConfirmationEmail(d: { firstName: string; courseName: string; callUrl?: string | null }): BuiltEmail {
  return gr(`We got your question – ${d.courseName}`, {
    line: `Got it, ${d.firstName}.`,
    paragraphs: [`Thanks for your question about ${d.courseName}. We’ll reply to this address. If you’d rather see GreenReserve working, book a demo: we’ll walk through your tee sheet, your green fees and what going live looks like.`],
    button: { label: 'Book a demo', url: d.callUrl || INQUIRY_CALL_FALLBACK_URL },
    after: ['Questions? Reply to this email.'],
  });
}

/** Cam 2026-09-16: a built course used the intake form. Says where the right door is. */
export function inquiryAlreadyBuiltEmail(d: { firstName: string; courseName: string }): BuiltEmail {
  return gr(`${d.courseName} already has a GreenReserve page`, {
    line: `You’re already set up, ${d.firstName}.`,
    paragraphs: [`${d.courseName} already has a GreenReserve page, so there’s nothing to set up again. To change your contact details, your rates or anything else on the page, sign in to your dashboard: that’s the one place those live, and changes there go out straight away.`],
    button: { label: 'Sign in to your dashboard', url: `${site()}/dashboard` },
    after: ['Use the email address your course is registered under. Can’t get in, or think this isn’t your course? Reply to this email.'],
  });
}

/** SD-11: proves someone reads the address on file. NOT a way in (lib/inquiry-signin), and it says so. */
export function inquirySigninCodeEmail(d: { courseName: string; code: string }): BuiltEmail {
  return gr(`${d.code} is your GreenReserve code`, {
    preheader: 'It expires in 10 minutes.',
    line: 'Your code',
    code: d.code,
    paragraphs: [`Someone just asked to get back into ${d.courseName} from the GreenReserve sign-up form. Enter this code on that page to confirm it’s you, and we’ll show you where to sign in. It expires in 10 minutes.`],
    after: ['This code doesn’t sign you in on its own: you’ll still use your normal password. If you didn’t ask for it, ignore this email; nothing has changed and nobody has been let in.', `Questions? Email ${ADMIN_EMAIL}.`],
  });
}

export function detailsSheetConfirmationEmail(d: { firstName: string; contactName: string; courseName: string; details: Record<string, unknown> }): BuiltEmail {
  const recap = sheetRecap(d.details);
  return gr(`Your setup sheet is in – ${d.courseName}`, {
    line: `Your setup sheet is in, ${first(d.firstName || d.contactName)}.`,
    paragraphs: [`Thanks for the details for ${d.courseName}. Here’s what happens next, and a copy of what you sent us.`],
    sections: [
      { title: 'What happens next', notes: SHEET_NEXT_STEPS.map((t, i) => ({ label: String(i + 1), text: t })) },
      ...(recap.length ? [{ title: 'What you sent us', rows: recap.map(r => ({ label: r.label, value: r.value })) }] : []),
    ],
    after: ['Something wrong? Reply to this email and we’ll fix it before we build.'],
  });
}

export function detailsRequestEmail(d: { courseName: string; detailsLink: string }): BuiltEmail {
  return gr(`Quick setup sheet for ${d.courseName}`, {
    line: `One short form to get ${d.courseName} live.`,
    paragraphs: [`We reviewed your inquiry and we’d love to have ${d.courseName} on GreenReserve. Before we build your booking page, we need a few specifics: tee sheet schedule, green fees, policies and facilities. It takes about 5 minutes and saves as you go, so you can close it and come back any time.`],
    rows: [{ label: '1. Fill out the sheet', value: 'About 5 minutes' }, { label: '2. We build your page', value: 'Usually the same business day' }, { label: '3. You go live', value: 'After you review everything' }],
    button: { label: 'Open the setup sheet', url: d.detailsLink },
    after: ['Questions? Reply to this email.'],
  });
}

const etWhen = (d: Date) => d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

/** SC-3 §3: 24 hours before a scheduled call. */
export function callReminderEmail(d: { courseName: string; scheduledAt: Date; durationMin?: number; direction: string; phone: string; manageUrl: string | null }): BuiltEmail {
  const clock = d.scheduledAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  return gr(`Talking tomorrow at ${clock} – GreenReserve`, {
    line: `Talking tomorrow at ${clock}.`,
    paragraphs: [`A quick reminder about our call about ${d.courseName}.`],
    rows: [{ label: 'When', value: `${etWhen(d.scheduledAt)} ET` }, { label: 'Length', value: `About ${d.durationMin || 30} minutes` },
      { label: 'Who calls', value: d.direction === 'they_call' ? 'You call us (the number is in your confirmation email)' : `We call you at ${d.phone}` }],
    small: d.manageUrl ? { label: 'Reschedule or cancel', url: d.manageUrl } : undefined,
    after: d.manageUrl ? [] : ['Need to move it? Reply to this email.'],
  });
}

/** IC-1 §5: a discovery call was put on the books. */
export function callScheduledEmail(d: { courseName: string; scheduledAt: Date; durationMin: number; direction: string; phone: string; agendaLabels: string[] }): BuiltEmail {
  const when = etWhen(d.scheduledAt);
  return gr(`Your call with GreenReserve – ${when} ET`, {
    line: 'Your call with GreenReserve.',
    paragraphs: [`Here are the details for our call about ${d.courseName}.`],
    rows: [{ label: 'When', value: `${when} ET` }, { label: 'Length', value: `About ${d.durationMin} minutes` },
      { label: 'Who calls', value: d.direction === 'they_call' ? `You call us${d.phone ? ` at ${d.phone}` : ''}` : `We call you${d.phone ? ` at ${d.phone}` : ''}` }],
    sections: d.agendaLabels.length ? [{ title: 'What we’ll go over', notes: d.agendaLabels.map(l => ({ text: l })) }] : [],
    after: ['Reply to this email if the time doesn’t work and we’ll find another.'],
  });
}

/** A-05 4b: the auto-chase for a course that hasn't finished onboarding. */
export function onboardingChaseEmail(d: { courseName: string; remainingSteps: string[] }): BuiltEmail {
  return gr(`${d.courseName} is still waiting to go live`, {
    line: `Finish setting up ${d.courseName}.`,
    paragraphs: [`${d.courseName} isn’t bookable yet. Here’s what’s left:`],
    notes: d.remainingSteps.map((t, i) => ({ label: String(i + 1), text: t })),
    button: { label: 'Finish setup', url: `${site()}/dashboard` },
    after: ['Stuck on something? Reply to this email.'],
  });
}

// ---------- Cam's own, plain personal emails ----------

const signature = (name: string) => [name, `GreenReserve · ${ADMIN_EMAIL}`];

/** A reply Cam wrote in the admin (Pipeline → the inquiry → Reply). */
export function inquiryReplyEmail(d: { contactName: string; courseName: string; body: string; question?: string | null; adminName: string }): BuiltEmail {
  return {
    subject: subjectLine(`Re: your question about ${d.courseName}`),
    ...plainEmail({
      paragraphs: [`Hi ${first(d.contactName)},`, ...d.body.trim().split(/\n{2,}/).map(x => x.trim())],
      signature: signature(d.adminName),
      quote: d.question?.trim() ? `You asked: ${d.question.trim()}` : undefined,
    }),
  };
}

/** Declined. Deliberately doesn't name the internal close reason, and leaves the door open. */
export function inquiryDeclinedEmail(d: { contactName: string; courseName: string }): BuiltEmail {
  return {
    subject: subjectLine(`Your GreenReserve inquiry – ${d.courseName}`),
    ...plainEmail({
      paragraphs: [`Hi ${first(d.contactName)},`,
        `Thanks for considering GreenReserve. We’ve looked over your inquiry for ${d.courseName}, and we’re not able to take it on right now.`,
        'That isn’t a verdict on your course. We’re a small team bringing courses on in a deliberate order, and where we are in that order changes. If you’d like us to take another look later, just reply to this email: we keep every inquiry on file.',
        `Either way, thank you for the time you spent telling us about ${d.courseName}.`],
      signature: signature('Cam Sanchez'),
    }),
  };
}

/** SC-2 §1: pick a 30-minute time. Signed by name. */
export function callInviteEmail(d: { firstName: string; courseName: string; url: string; agendaLines: string[] }): BuiltEmail {
  return {
    subject: 'Set up your call with GreenReserve',
    ...plainEmail({
      paragraphs: [`Hi ${d.firstName},`,
        `Thanks for the note about ${d.courseName}. Pick a 30-minute time that suits you and I’ll call you then: ${d.url}`,
        ...(d.agendaLines.length ? [`What the call covers:\n${d.agendaLines.map(l => `- ${l}`).join('\n')}`] : []),
        'If none of the times work, just reply to this email.'],
      signature: signature('Cam'),
    }),
  };
}

// ---------- To Cam (admin@) ----------

const adminUrl = (href: string) => `${site()}${href}`;

export function inquiryNotificationEmail(d: { inquiryId?: string | null; contactName: string; contactTitle: string; email: string; phone: string; courseName: string; city: string; state: string; additionalNotes: string; inviteNote?: string | null }): BuiltEmail {
  const url = d.inquiryId ? `${site()}/admin/inquiries/${encodeURIComponent(d.inquiryId)}` : `${site()}/admin/inquiries`;
  const q = d.additionalNotes.trim();
  const rows: EmailRow[] = [{ label: 'Contact', value: d.contactName + (d.contactTitle ? `, ${d.contactTitle}` : '') }];
  const where = [d.city, d.state].filter(Boolean).join(', ');
  if (where) rows.push({ label: 'Where', value: where });
  if (d.phone) rows.push({ label: 'Phone', value: d.phone });
  rows.push({ label: 'Email', value: d.email });
  return gr(`${d.courseName} asked a question`, {
    preheader: (q || 'No question written.').slice(0, 90),
    line: d.courseName,
    paragraphs: [q || 'No question written.'],
    rows,
    after: d.inviteNote ? [`The call-booking link didn’t send (${d.inviteNote}). Send it from the inquiry.`] : [],
    button: { label: 'Reply', url: `${url}?reply=1` },
    small: { label: 'Open inquiry', url },
  });
}

export function lockedOutAlertEmail(d: { courseName: string; inquiryId: string; operatorEmail: string; reason: 'no-account' | 'unverified' }): BuiltEmail {
  return gr(`Locked out: ${d.courseName} confirmed their email but has no login`, {
    line: 'An operator proved their email and still can’t get in.',
    paragraphs: [`Someone at ${d.courseName} used the public sign-up form, confirmed a code sent to ${d.operatorEmail} (so they do read that inbox), and hit a dead end. They were told someone would email them; this is that alert.`,
      d.reason === 'no-account' ? 'No CourseOperator row exists for that address at all.' : 'A CourseOperator row exists but its email is still unverified, so they can’t complete a login.'],
    button: { label: 'Open the inquiry', url: adminUrl(`/admin/inquiries/${encodeURIComponent(d.inquiryId)}`) },
  });
}

export function detailsSubmittedEmail(d: { courseName: string; contactName: string }): BuiltEmail {
  return gr(`Setup sheet ready: ${d.courseName}`, {
    line: `${d.courseName} sent their setup sheet.`,
    paragraphs: [`${d.contactName} from ${d.courseName} just submitted their setup sheet. It’s ready to build.`],
    button: { label: 'Review in Admin', url: adminUrl('/admin') },
  });
}

export function courseApprovedEmail(d: { courseName: string; contactName: string }): BuiltEmail {
  return gr(`Approved: ${d.courseName}`, {
    line: `${d.courseName} approved their page.`,
    paragraphs: [`${d.contactName} from ${d.courseName} reviewed their preview page and approved it. It’s ready to go live.`],
    button: { label: 'Review in Admin', url: adminUrl('/admin') },
  });
}

export function agreementBumpSummaryEmail(d: { title: string; version: string; reacceptBy: Date; notified: number; failures: string[] }): BuiltEmail {
  return gr(`[GreenReserve] ${d.title} v${d.version} notice sent to ${d.notified}`, {
    line: `${d.title} v${d.version}: the day-0 notice went out.`,
    rows: [{ label: 'Notified', value: plural(d.notified, 'operator') }, { label: 'Sign by', value: d.reacceptBy.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) }],
    after: d.failures.length ? [`Failed to send to: ${d.failures.join(', ')}. Contact them another way.`] : [],
  });
}

export function adminUrgentEmail(d: { findings: { title: string; detail: string; href: string }[] }): BuiltEmail {
  const n = d.findings.length;
  return gr(n === 1 ? `[GreenReserve] ${d.findings[0].title}` : `[GreenReserve] ${n} things need you`, {
    line: n === 1 ? 'Something needs you.' : `${n} things need you.`,
    paragraphs: [`The hourly check just found ${n === 1 ? 'this' : 'these'}. You won’t be emailed about ${n === 1 ? 'it' : 'them'} again unless ${n === 1 ? 'it clears and comes back' : 'one clears and comes back'}.`],
    notes: d.findings.map(f => ({ label: f.title, text: f.detail, url: adminUrl(f.href) })),
    button: { label: 'Open Today', url: adminUrl('/admin') },
  });
}

export type DigestFacts = {
  date: string;
  urgentOpen: { title: string; detail: string; since: string }[];
  needsYou: { total: number; money: number; stalled: number };
  money: { daysIn: number; volume: number; volumeLastMonth: number; fees: number; feesLastMonth: number; net: number | null; netLastMonth: number | null };
  onboarding: { stage: string; count: number; stuck: number }[];
};
export function adminDigestEmail(d: { summary: string; facts: DigestFacts }): BuiltEmail {
  const f = d.facts;
  const money = (v: number | null) => v === null ? '—' : `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
  const urgent: EmailNote[] = f.urgentOpen.length ? f.urgentOpen.map(u => ({ label: u.title, text: `${u.detail} (since ${u.since})` })) : [{ text: 'Nothing urgent.' }];
  return gr(`[GreenReserve] Morning digest – ${f.date}`, {
    line: 'Good morning.',
    paragraphs: d.summary ? [d.summary] : [],
    sections: [
      { title: 'Urgent', notes: urgent },
      { title: 'Needs you', notes: [{ text: f.needsYou.total === 0 ? 'Nothing on the list.' : `${f.needsYou.total} on the list: ${f.needsYou.money} about money, ${f.needsYou.stalled} stalled.` }] },
      { title: `This month so far (${plural(f.money.daysIn, 'day')})`, rows: [
        { label: 'Booked through courses', value: `${money(f.money.volume)}\n${money(f.money.volumeLastMonth)} by now last month` },
        { label: 'GreenReserve fees', value: `${money(f.money.fees)}\n${money(f.money.feesLastMonth)} by now last month` },
        { label: 'Net after Stripe and expenses', value: `${money(f.money.net)}\n${f.money.net === null ? 'Stripe didn’t answer' : `${money(f.money.netLastMonth)} by now last month`}` },
      ] },
      { title: 'Onboarding', rows: f.onboarding.map(o => ({ label: o.stage, value: `${o.count}${o.stuck ? ` (${o.stuck} stuck)` : ''}` })) },
    ],
    button: { label: 'Open Today', url: adminUrl('/admin') },
  });
}

// ---------- Owner and admin security (noreply@) ----------

const deviceRows = (d: { device: string; place?: string; when: string }, deviceLabel = 'Device'): EmailRow[] =>
  [{ label: deviceLabel, value: d.device }, ...(d.place !== undefined ? [{ label: 'Where', value: d.place || 'Unknown' }] : []), { label: 'When', value: d.when }];

export function adminTwoFactorEmail(d: { code: string }): BuiltEmail {
  return gr(`GreenReserve admin code: ${d.code}`, {
    preheader: 'It expires in 10 minutes.',
    line: 'Your admin code',
    code: d.code,
    paragraphs: ['Enter this code to finish signing in to the GreenReserve admin. It expires in 10 minutes.'],
    after: [`Not you? Email ${ADMIN_EMAIL} right away.`],
  });
}

export function adminPasswordResetEmail(d: { adminEmail: string; resetLink: string }): BuiltEmail {
  return gr('Reset your GreenReserve admin password', {
    preheader: 'This link expires in 24 hours.',
    line: 'Reset your admin password.',
    paragraphs: [`We got a request to reset the password on your GreenReserve admin account (${d.adminEmail}). If this wasn’t you, you can ignore this email.`],
    button: { label: 'Set a new password', url: d.resetLink },
    after: [`This link expires in 24 hours. Questions? Email ${ADMIN_EMAIL}.`],
  });
}

export function ownerDeviceApprovalEmail(d: { approvalUrl: string; device: string; place: string; when: string }): BuiltEmail {
  return gr('Approve a new device for GreenReserve', {
    line: 'Approve a new device.',
    paragraphs: ['Someone with your password is signing in to the GreenReserve owner account from a device it hasn’t seen before.'],
    rows: deviceRows(d),
    button: { label: 'Review this device', url: d.approvalUrl },
    after: ['The link works for 15 minutes. If this wasn’t you, don’t approve it: change your password now, because whoever it was knows it.'],
  });
}

export function ownerSignInEmail(d: { device: string; place: string; when: string; method: string }): BuiltEmail {
  const how = d.method === 'passkey' ? 'a passkey' : d.method === 'totp' ? 'your authenticator app' : d.method === 'recovery' ? 'a recovery code' : 'an emailed code';
  return gr('GreenReserve owner sign-in', {
    line: 'You signed in.',
    paragraphs: [`The GreenReserve owner account just signed in with ${how}.`],
    rows: deviceRows(d),
    after: ['Not you? Sign in, go to My profile and choose “Sign out everywhere”, then change your password.'],
  });
}

export function ownerPasswordChangedEmail(d: { how: string; device: string; place: string; when: string }): BuiltEmail {
  return gr('Your GreenReserve owner password was changed', {
    line: 'Your password was changed.',
    paragraphs: [`The password on the GreenReserve owner account was just changed (${d.how}).`],
    rows: deviceRows(d),
    after: ['Not you? Use “Forgot password” on the admin sign-in page to set a new one right away, then sign in, go to My profile and choose “Sign out everywhere”.'],
  });
}

export function ownerPasskeyChangedEmail(d: { change: 'added' | 'removed'; passkey: string; device: string; when: string }): BuiltEmail {
  return gr(`GreenReserve passkey ${d.change}`, {
    line: `A passkey was ${d.change}.`,
    paragraphs: [`A passkey was ${d.change} ${d.change === 'added' ? 'to' : 'from'} the GreenReserve owner account.`],
    rows: [{ label: 'Passkey', value: d.passkey }, ...deviceRows({ device: d.device, when: d.when }, 'From')],
    after: ['Not you? Sign in, go to My profile and choose “Sign out everywhere”, remove the passkey, then change your password.'],
  });
}

// ---------- Outreach to new courses (plain, personal, with the CAN-SPAM footer) ----------

/** The footer's one line: "<postal address> · Reply “no thanks” to stop." Throws while the address is empty. */
export function outreachFooterLine(postalAddress: string): string {
  const a = String(postalAddress ?? '').replace(/\s+/g, ' ').trim();
  if (!a) throw new Error('Outreach is off until GreenReserve’s postal address is set (OUTREACH_POSTAL_ADDRESS in lib/contact.ts): the law needs it in every outreach email.');
  return `${a} · Reply “no thanks” to stop.`;
}

/** An outreach email, as the mockup's "Outreach email 1": Cam's words, signed, then the logo and the footer line. */
export function outreachEmail(d: { subject: string; paragraphs: string[]; senderName?: string }, postalAddress: string): BuiltEmail {
  return {
    subject: subjectLine(d.subject),
    ...plainEmail({ paragraphs: d.paragraphs, signature: signature(d.senderName || 'Cam Sanchez'), footerLine: outreachFooterLine(postalAddress) }),
  };
}

// ---------- Merged pairs (emails redo: 78 → 72) ----------

/**
 * Dashboard access for a course in onboarding. One email for both cases (merged with the old
 * "page ready in your dashboard" email): with a set-your-password link for an owner who has never
 * signed in, or straight to the dashboard for one who already does (their sign-in is never touched).
 */
export function dashboardAccessEmail(d: { operatorName: string; operatorEmail: string; courseName: string; setupUrl: string | null; pageReady: boolean; linkDays: number }): BuiltEmail {
  const firstName = first(d.operatorName);
  if (!d.setupUrl) {
    return gr(`Your ${d.courseName} booking page is ready for a look`, {
      line: `Your booking page is ready for a look, ${firstName}.`,
      paragraphs: [`We’ve updated the booking page for ${d.courseName}. Sign in to review it, then approve it or tell us what to change.`],
      button: { label: 'Review it in your dashboard', url: `${site()}/dashboard` },
      after: ['Questions? Reply to this email.'],
    });
  }
  const steps = [
    d.pageReady ? 'Review your booking page, and approve it or tell us what to change.' : 'Look over your booking page as we finish it.',
    'Sign the operator agreement.',
    'Connect Stripe so payments reach your bank.',
  ];
  return gr(d.pageReady ? `Your ${d.courseName} booking page is ready for a look` : `Set up your ${d.courseName} dashboard`, {
    line: `${d.pageReady ? 'Your booking page is ready for a look' : 'Your dashboard is ready'}, ${firstName}.`,
    paragraphs: [`Set your password to get into the GreenReserve dashboard for ${d.courseName}.`],
    button: { label: 'Set your password', url: d.setupUrl },
    sections: [{ title: 'Then your dashboard walks you through', notes: steps.map((t, i) => ({ label: String(i + 1), text: t })) }],
    after: [`The link works once and expires in ${plural(d.linkDays, 'day')}. If it has expired, use “Forgot password” on the sign-in page with ${d.operatorEmail}.`, 'Questions? Reply to this email.'],
  });
}

/**
 * The course went live. One email (merged with the old short "You're live"): an owner who already
 * had dashboard access gets the short version; one who didn't also gets the map of the dashboard.
 */
export function goLiveEmail(d: { courseName: string; courseSlug: string; tour: boolean }): BuiltEmail {
  const bookingUrl = `${site()}/courses/${d.courseSlug}`;
  const shown = bookingUrl.replace(/^https?:\/\//, '');
  const sections = d.tour ? [
    { title: 'Where everything lives', notes: [
      { label: 'Settings', text: 'Course info, pricing, policies (walking, cancellation, dress code) and your facilities.' },
      { label: 'Payments', text: 'Your Stripe connection and payout details, inside Settings.' },
      { label: 'Schedule', text: 'Your tee time templates: hours, interval, green fees, cart fee, member and resident rates. Changes regenerate future tee times.' },
      { label: 'Bookings', text: 'Every reservation on your tee sheet, with golfer contact details and payment status.' },
      { label: 'Members', text: 'Member accounts and tiers, if you offer member pricing.' },
      { label: 'Staff', text: 'Logins for your pro shop team, without your owner password.' },
    ] },
    { title: 'Worth knowing', notes: [
      { text: FEE_SENTENCES },
      { text: 'Need to close for a day (weather, maintenance, an outing)? Block it from Schedule.' },
      { text: 'Payouts come from Stripe on its normal schedule for your account; Settings → Payments shows their status.' },
    ] },
  ] : [];
  return gr(d.tour ? `You're live! Here's how to run ${d.courseName} on GreenReserve` : `You're live! ${d.courseName} is now bookable on GreenReserve`, {
    line: `${d.courseName} is live on GreenReserve.`,
    paragraphs: [`Golfers can find and book your tee sheet at ${shown}. New bookings show in your dashboard as they come in.`],
    sections,
    button: { label: 'Open your dashboard', url: `${site()}/dashboard` },
    after: ['Questions, or something looks wrong? Reply to this email: a real person reads it.'],
  });
}

/**
 * After a call (merged with the old "recap plus setup sheet" email): what we wrote down, and, when the
 * call ended with one, their setup sheet link, what happens next and the fee in LQ-2's words. Plain, from Cam.
 */
export function callRecapEmail(d: { contactName: string; courseName: string; scheduledAt?: Date | null; items?: [string, string][]; recap?: string[]; detailsLink?: string | null; liveTarget?: string | null }): BuiltEmail {
  const when = d.scheduledAt ? d.scheduledAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' }) : '';
  const lines = [...(d.items ?? []).map(([k, v]) => `- ${k}: ${v}`), ...(d.recap ?? []).map(l => `- ${l}`)];
  const paragraphs = [`Hi ${first(d.contactName)},`,
    `Thanks for the call about ${d.courseName}${when ? ` on ${when}` : ''}.${lines.length ? ' Here’s what we wrote down:' : ''}`];
  if (lines.length) paragraphs.push(lines.join('\n'));
  if (d.detailsLink) {
    paragraphs.push(`Your setup sheet, built from our call (the first four steps take about 5 minutes; the rest is optional): ${d.detailsLink}`);
    paragraphs.push(`What happens next${d.liveTarget ? `, aiming for ${d.liveTarget}` : ''}:\n1. Your setup sheet: tee times, prices and cancellation, in your own words.\n2. We build your page and send a private preview for you to approve.\n3. Sign the operator agreement and connect Stripe in your course’s name (about 10 minutes).\n4. Go live: add the link to your website.`);
    paragraphs.push(FEE_SENTENCES);
  } else if (lines.length) {
    paragraphs.push('It will show up filled in on your setup sheet, where you can change any of it.');
  }
  paragraphs.push('Anything off? Just reply to this email.');
  return {
    subject: subjectLine(d.detailsLink ? `${d.courseName}: recap of our call and your setup sheet` : `What we captured on our call – ${d.courseName}`),
    ...plainEmail({ paragraphs, signature: signature('Cam Sanchez') }),
  };
}
