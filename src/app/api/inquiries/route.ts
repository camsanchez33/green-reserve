import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendInquiryNotification, sendInquiryConfirmation, sendInquiryAlreadyBuilt } from '@/lib/email';
import { ALIVE_STATUSES, encodeResubmit } from '@/lib/inquiry-status';
import { rateLimit, evidentiaryIp } from '@/lib/rate-limit';
import { issueCallInvite, deliverCallInvite, inviteUrl } from '@/lib/call-invite';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// INQUIRY_FORM_SPEC IF-1: the form asks ten things; the eight branch questions
// moved to the discovery call. What still lands in needsJson is only the
// optional call-time preference, whitelisted here — this endpoint is public.
const COURSE_TYPES = new Set(['public', 'semi-private', 'private']);
const CALL_TIMES = new Set(['Mornings', 'Afternoons', 'Evenings']);
const CALL_DAYS = new Set(['Weekdays', 'Weekends']);
function callPreferenceFrom(raw: unknown): { times: string[]; days: string[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { times?: unknown; days?: unknown };
  // De-duped and capped at the whitelist's size — membership alone would let a
  // public POST store an unbounded array.
  const times = Array.isArray(r.times) ? [...new Set(r.times.filter((x): x is string => typeof x === 'string' && CALL_TIMES.has(x)))].slice(0, CALL_TIMES.size) : [];
  const days = Array.isArray(r.days) ? [...new Set(r.days.filter((x): x is string => typeof x === 'string' && CALL_DAYS.has(x)))].slice(0, CALL_DAYS.size) : [];
  return times.length || days.length ? { times, days } : null;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Honeypot: bots fill hidden fields, humans leave them blank. Silently accept but discard.
  if (body._website) return NextResponse.json({ success: true });

  // SD-1: the intake sends two emails per submission and creates a row; it had
  // no limit at all. Five an hour per connection is generous for a human.
  // Keyed on the platform-set hop, not the client-writable leftmost x-forwarded-for.
  if (!(await rateLimit(`inquiry:${evidentiaryIp(req)}`, 5, 3600))) {
    return NextResponse.json({ error: 'Too many submissions from this connection — try again in an hour, or email hello@greenreserve.app.' }, { status: 429 });
  }

  const required = ['firstName', 'lastName', 'contactTitle', 'email', 'phone', 'courseName', 'city', 'state', 'courseType', 'currentBookingMethod'];
  for (const field of required) {
    if (typeof body[field] !== 'string' || !(body[field] as string).trim()) return NextResponse.json({ error: `Missing: ${field}` }, { status: 400 });
  }
  const optStr = (v: unknown, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');
  if (!COURSE_TYPES.has(String(body.courseType))) return NextResponse.json({ error: 'Invalid: courseType' }, { status: 400 });
  const currentBookingMethod = String(body.currentBookingMethod).trim().slice(0, 80);
  const callPreference = callPreferenceFrom(body.callPreference);
  const needsJson = callPreference ? JSON.stringify({ callPreference }) : '';

  const email = String(body.email).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const contactName = `${body.firstName} ${body.lastName}`.trim();

  // Duplicate-intake guard (MP-4a). This form is public and unauthenticated, so
  // the same course arrives twice for entirely ordinary reasons: an impatient
  // double-submit, or a follow-up a week later because nobody replied. Each one
  // used to create a second CourseInquiry — two rows in the pipeline for one
  // course, duplicated outreach, and a live risk of building the same course
  // twice.
  //
  // Only ALIVE inquiries dedupe. A course rejected or archived months ago that
  // applies again is a genuine new lead, not a duplicate.
  // SECURITY REVIEW: courseName lands in two mail subject headers (the admin
  // new-lead subject and the already-built one) where escHtml does not apply.
  // Every neighbouring field is capped; this one never was. Strip newlines and
  // cap at intake so neither subject can carry a header break.
  const courseName = String(body.courseName).trim().replace(/[\r\n]+/g, ' ').slice(0, 200);
  const city = String(body.city).trim();
  const state = String(body.state).trim();

  // A duplicate is the same COURSE, not the same person. The first version of
  // this guard also matched on email alone, which is wrong twice over: a
  // management company, or a GM who looks after two courses, submits both from
  // one address — and every one of those legitimate second courses was
  // silently absorbed into the first inquiry and never appeared in the
  // pipeline. Identity here is the course: name + city + state.
  const existing = await prisma.courseInquiry.findFirst({
    where: {
      status: { in: ALIVE_STATUSES },
      courseName: { equals: courseName, mode: 'insensitive' },
      city: { equals: city, mode: 'insensitive' },
      state: { equals: state, mode: 'insensitive' },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, email: true, builtCourseId: true, callInviteToken: true, callInviteExpiresAt: true },
  });

  if (existing) {
    // Cam 2026-09-16: "if a course is already created it can't be created
    // again — they'd have to log in to change information." Once the course
    // EXISTS, the intake form is the wrong door entirely: contact details for
    // a built course change in exactly one place, the operator dashboard.
    // So no resubmit event is recorded at all here — an admin diff against a
    // course that is already built is a decision nobody should be asked to
    // make, and 21c8d25's verified/unverified split only governs which details
    // reach that diff. The response shape below is unchanged, so the endpoint
    // still answers identically whether or not the course exists.
    //
    // Deliberately NOT extended to not-yet-built inquiries: there the 21c8d25
    // rule (the email must match the one on file) is the right level, because
    // refusing outright would also refuse a GM fixing their own typo'd phone.
    // Security (IF-1 review): the match is on public facts (name + town), so
    // anyone can land here. Only a submitter using the email on file may put
    // new contact details in front of the admin; everyone else's email/phone
    // is dropped and the diff is labelled unverified. Hoisted above the
    // built-course branch because that branch needs the same distinction.
    const verified = existing.email.trim().toLowerCase() === email;
    // SC-2 review: the confirmation's button reuses the live invite when there
    // is one; no new token is minted from this unauthenticated path.
    const liveInvite = existing.callInviteToken && existing.callInviteExpiresAt && existing.callInviteExpiresAt.getTime() > Date.now()
      ? inviteUrl(existing.callInviteToken) : null;

    if (existing.builtCourseId) {
      // SECURITY REVIEW (951433d): the first cut sent the "already has a
      // GreenReserve page" email to whoever submitted. A `building` course is
      // NOT public — admin/create-course writes it `active: false` — so that
      // told an unverified stranger, who needs only a course name and a town,
      // which courses have signed up and not yet launched: competitor-usable
      // pipeline intelligence, and a ready-made phishing pretext sent from our
      // own domain with our own SPF/DKIM. 21c8d25's rule already settles this:
      // an unverified submitter gets nothing privileged. So only the address on
      // file is told the course exists; everyone else gets the ordinary
      // confirmation, byte for byte what they got before this branch existed.
      if (verified) {
        sendInquiryAlreadyBuilt({ firstName: body.firstName as string, email, courseName })
          .catch(err => console.error('Already-built inquiry email failed:', err));
      } else {
        sendInquiryConfirmation({ firstName: body.firstName as string, contactName, email, courseName, callUrl: liveInvite })
          .catch(err => console.error('Inquiry confirmation email failed:', err));
      }
      // No InquiryStatusEvent, per the item: an admin diff against a course
      // that is already built is a decision nobody should be asked to make.
      // But "no diff" is not "no trace" — without this line a built course's
      // resubmit, including someone probing the pipeline, left no application
      // record anywhere except an opaque rate-limit counter.
      console.warn(`[inquiries] resubmit for built course, no event recorded: inquiry=${existing.id} verified=${verified}`);
      // `alreadyBuilt` only ever reaches someone who already proved they know
      // the address on file, so it tells them nothing they did not have. The
      // unverified response stays identical to every other path.
      return NextResponse.json({ success: true, ...(verified ? { alreadyBuilt: true } : {}) });
    }
    // A self-loop event: it shows up on the timeline without changing status or
    // restarting the stage clock (see inquiry-status.stageEnteredAt, which
    // ignores fromStatus === toStatus for exactly this reason).
    await prisma.inquiryStatusEvent.create({
      data: {
        inquiryId: existing.id,
        fromStatus: existing.status,
        toStatus: existing.status,
        trigger: 'course',
        // Carry WHAT they submitted, not just that they did. A course
        // re-submitting is usually correcting something — a new phone number,
        // a fixed course name — and discarding it made the guard lossy. The
        // admin gets a diff against what is on file and decides; nothing is
        // overwritten behind their back.
        actorName: encodeResubmit({
          verified,
          contactName, contactTitle: optStr(body.contactTitle),
          ...(verified ? { email, phone: optStr(body.phone) } : {}),
          courseName, address: optStr(body.address),
          city, state, zipCode: optStr(body.zipCode), website: optStr(body.website),
          courseType: optStr(body.courseType), currentBookingMethod,
          teeTimesPerDay: typeof body.teeTimesPerDay === 'number' ? body.teeTimesPerDay : null,
          greenFeeRange: optStr(body.greenFeeRange), pricingNotes: optStr(body.pricingNotes),
          additionalNotes: optStr(body.additionalNotes),
          lookingFor: Array.isArray(body.lookingFor) ? body.lookingFor.filter((x): x is string => typeof x === 'string') : [],
        }),
      },
    }).catch(err => console.error('Duplicate-intake event failed:', err));

    // The course still gets its confirmation — from their side nothing unusual
    // happened. The response shape is deliberately identical to a fresh submit:
    // a "duplicate" flag would turn this public endpoint into an oracle for
    // which courses are already in the pipeline. No admin new-lead notification
    // fires, because this is not a new lead.
    sendInquiryConfirmation({ firstName: body.firstName as string, contactName, email, courseName, callUrl: liveInvite })
      .catch(err => console.error('Inquiry confirmation email failed:', err));

    return NextResponse.json({ success: true });
  }
  const firstName = (body.firstName as string).trim();
  const contactTitle = (body.contactTitle as string).trim().slice(0, 120);
  const phone = (body.phone as string).trim().slice(0, 40);
  const courseType = body.courseType as string;
  const additionalNotes = optStr(body.additionalNotes);
  const inquiry = await prisma.courseInquiry.create({
    data: {
      firstName,
      lastName: (body.lastName as string).trim(),
      contactName,
      contactTitle,
      email,
      phone,
      courseName,
      address: optStr(body.address, 200),
      city,
      state,
      zipCode: optStr(body.zipCode, 20),
      website: optStr(body.website, 200),
      courseType,
      currentBookingMethod,
      teeTimesPerDay: typeof body.teeTimesPerDay === 'number' ? body.teeTimesPerDay : null,
      greenFeeRange: optStr(body.greenFeeRange, 120),
      hasResidentPricing: body.hasResidentPricing === true,
      hasMemberPricing: body.hasMemberPricing === true,
      hasCaddies: body.hasCaddies === true,
      pricingNotes: optStr(body.pricingNotes),
      facilitiesNotes: optStr(body.facilitiesNotes),
      lookingFor: Array.isArray(body.lookingFor) ? body.lookingFor.filter((x): x is string => typeof x === 'string') : [],
      additionalNotes,
      needsJson,
    },
  });

  // SC-2 §1: the invite goes out right away. The token is minted here (one
  // fast DB write, so the confirmation's button has the link); the email itself
  // is delivered in the background like every other send on this endpoint, so
  // a slow or failing Resend never delays or fails the submission. The admin
  // alert follows the delivery and says when the invite did not go.
  let inviteUrlForEmails: string | null = null;
  try { inviteUrlForEmails = (await issueCallInvite(inquiry.id)).url; }
  catch (err) { console.error('Call invite token failed:', err); }
  const inviteFor = { id: inquiry.id, firstName, contactName, email, courseName };
  const inviteDelivery: Promise<{ sent: boolean; error?: string }> = inviteUrlForEmails
    ? deliverCallInvite(inviteFor, inviteUrlForEmails).catch(err => ({ sent: false, error: err instanceof Error ? err.message : String(err) }))
    : Promise.resolve({ sent: false, error: 'token not issued' });

  const emailData = { firstName, contactName, email, courseName, callUrl: inviteUrlForEmails };
  inviteDelivery.then(invite => sendInquiryNotification({
    contactName,
    contactTitle,
    email,
    phone,
    courseName,
    city,
    state,
    courseType,
    currentBookingMethod,
    greenFeeRange: optStr(body.greenFeeRange, 120),
    additionalNotes,
    inviteNote: invite.sent ? null : (invite.error || 'unknown'),
  })).catch(err => console.error('Inquiry notification email failed:', err));

  sendInquiryConfirmation(emailData)
    .catch(err => console.error('Inquiry confirmation email failed:', err));

  return NextResponse.json({ success: true });
}

// GET deliberately removed (MP-1b). It was PUBLIC — no session check behind a
// comment that claimed "Admin only" — and returned every CourseInquiry with no
// select: contact names, emails, phones, adminNotes, detailsJson, and every
// detailsToken. Those tokens are the sole credential for the setup-sheet routes,
// so this handed out exactly what MP-1 #7 was built to protect. It had no
// caller: the public lead form only POSTs here (for-courses/ForCoursesContent
// .tsx:170) and the admin console reads /api/admin/inquiries, which is session-
// and role-gated. Deleted rather than gated — an endpoint nobody calls should
// not exist.
