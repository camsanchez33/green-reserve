'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import PlainHeader from '@/components/PlainHeader';
import { ArrowLeft } from 'lucide-react';
import { calcomEmbedUrl } from '@/lib/calcom-url';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];
// INQUIRY_FORM_SPEC IF-1: the form asks only what the discovery call can't.
// FB-1 (Cam 2026-09-29): Public / Private only. A semi-private club signs up as
// Public and turns on member passes during setup.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type FormData = {
  firstName: string; lastName: string;
  email: string; phone: string;
  courseName: string; city: string; state: string;
  notes: string;
};

const init: FormData = {
  firstName: '', lastName: '',
  email: '', phone: '',
  courseName: '', city: '', state: '',
  notes: '',
};

// Base input/select classes (no error state)
const inp = "w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors";
const inpErr = "w-full bg-paper border border-bad rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-bad/60 focus:ring-2 focus:ring-bad/10 transition-colors";
const sel = "w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors";
const selErr = "w-full bg-paper border border-bad rounded-md px-3 py-2.5 text-sm text-ink outline-none focus:border-bad/60 focus:ring-2 focus:ring-bad/10 transition-colors";

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="block text-[13px] font-semibold text-ink mb-1.5">
      {text}{required && <span className="text-bad ml-0.5">*</span>}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-bad">{msg}</p>;
}

export default function ForCoursesContent({ calBookingUrl = null }: { calBookingUrl?: string | null }) {
  const [form, setForm] = useState<FormData>(init);
  // SD review: the honeypot input existed but its value was never sent — the
  // payload hardcoded ''. Bots that fill every field now get the silent 200.
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedName, setSubmittedName] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  // Set only when the API says the course already has a page, which it only
  // says to a submitter using the email on file. See the route's comment.
  const [alreadyBuilt, setAlreadyBuilt] = useState(false);
  // SD-11. Cam: "just cause an email got put in doesnt send them stright to
  // sign in ... they should be asked and then if they answer yes they have to
  // enter a verification code". Three steps, in order.
  const [signinStep, setSigninStep] = useState<'ask' | 'code' | 'done'>('ask');
  const [signinCode, setSigninCode] = useState('');
  const [signinBusy, setSigninBusy] = useState(false);
  const [signinError, setSigninError] = useState('');
  // True once the server has retired the challenge — the only way forward is a
  // fresh code, so the Confirm button stops pretending otherwise.
  const [signinLocked, setSigninLocked] = useState(false);
  const [signinResult, setSigninResult] = useState<{ loginEmail: string; hasAccount: boolean; needsSetup: boolean } | null>(null);
  const [submittedCourse, setSubmittedCourse] = useState({ courseName: '', city: '', state: '' });
  const [serverError, setServerError] = useState('');
  const [callUrl, setCallUrl] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLDivElement>(null);

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  const validateAll = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.lastName.trim()) errs.lastName = 'Last name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!EMAIL_RE.test(form.email.trim())) errs.email = 'Enter a valid email address (e.g. you@course.com)';
    if (!form.courseName.trim()) errs.courseName = 'Course name is required';
    if (!form.city.trim()) errs.city = 'City is required';
    if (!form.state) errs.state = 'State is required';
    if (!form.notes.trim()) errs.notes = 'What would you like to ask?';
    return errs;
  };

  const blurField = (k: string) => {
    const errs = validateAll();
    setFieldErrors(prev => {
      const next = { ...prev };
      if (errs[k]) next[k] = errs[k];
      else delete next[k];
      return next;
    });
  };

  const submit = async () => {
    const errs = validateAll();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      const firstKey = Object.keys(errs)[0];
      document.getElementById(`fld-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setFieldErrors({});
    setSubmitting(true); setServerError('');

    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: form.firstName, lastName: form.lastName,
        email: form.email, phone: form.phone,
        courseName: form.courseName, city: form.city, state: form.state,
        additionalNotes: form.notes,
        // honeypot (always empty for real users; bots fill it)
        hp: honeypotRef.current?.value ?? '',
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      const d = await res.json().catch(() => ({}));
      setSubmittedName(form.courseName);
      setSubmittedEmail(form.email.trim());
      setSubmittedCourse({ courseName: form.courseName, city: form.city, state: form.state });
      setAlreadyBuilt(!!d.alreadyBuilt);
      // Built from what they typed, never from the response — every submit
      // path answers identically (FB-1 review). The webhook attaches the
      // booking to this inquiry by email.
      setCallUrl(calBookingUrl ? calcomEmbedUrl(calBookingUrl, {
        name: `${form.firstName} ${form.lastName}`.trim(), email: form.email.trim(), phone: form.phone,
      }) : null);
      setSubmitted(true);
    } else {
      const d = await res.json();
      if (d.error === 'invalid_email') {
        setFieldErrors(prev => ({ ...prev, email: 'Enter a valid email address (e.g. you@course.com)' }));
        document.getElementById('fld-email')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setServerError(d.error || 'Something went wrong. Please try again.');
      }
    }
  };

  // SD-11 step 2: they said yes. The code goes to the address ON FILE.
  const requestSigninCode = async () => {
    setSigninBusy(true); setSigninError(''); setSigninCode(''); setSigninLocked(false);
    try {
      const res = await fetch('/api/inquiries/signin-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...submittedCourse, email: submittedEmail }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSigninError(d.error || 'Could not send a code. Try again in a moment.');
      } else {
        setSigninStep('code');
      }
    } catch {
      setSigninError('Could not reach us. Check your connection and try again.');
    }
    setSigninBusy(false);
  };

  // SD-11 step 3. A correct code does NOT sign anyone in — it unlocks the
  // pointer to the real login. See lib/inquiry-signin.ts for why.
  const verifySigninCode = async () => {
    setSigninBusy(true); setSigninError('');
    try {
      const res = await fetch('/api/inquiries/signin-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: signinCode.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        // The server already works out how many tries are left; it was being
        // thrown away, so the lockout arrived with no warning it was coming.
        const left = typeof d.attemptsLeft === 'number' ? d.attemptsLeft : null;
        const base = d.error || 'That code is not right. Check the email and try again.';
        setSigninError(left !== null && left > 0 ? `${base} ${left} attempt${left === 1 ? '' : 's'} left.` : base);
        setSigninCode('');
        // 429 means the cookie is gone server-side: no code can succeed now, so
        // sending a new one is the only move left, and the step has to offer it.
        if (res.status === 429) setSigninLocked(true);
      } else {
        setSigninResult({ loginEmail: d.loginEmail, hasAccount: !!d.hasAccount, needsSetup: !!d.needsSetup });
        setSigninStep('done');
      }
    } catch {
      setSigninError('Could not reach us. Check your connection and try again.');
    }
    setSigninBusy(false);
  };

  // SPEC REVIEW (951433d): a built course used to land on the ordinary screen —
  // "Next is a 20-minute call — pick a time below", Calendly button and all —
  // while the email it triggered said there is nothing to set up and no call is
  // coming. Two opposite instructions, with the correct one as a footnote under
  // the wrong one's CTA. This screen replaces it rather than annotating it.
  if (submitted && alreadyBuilt) return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="bg-white rounded-lg p-10 max-w-lg w-full border border-line">

        {signinStep === 'ask' && (
          <>
            
            <h1 className="text-2xl sm:text-3xl font-serif font-semibold tracking-tight text-ink mb-2 text-center">
              Are you trying to sign in?
            </h1>
            <p className="text-ink-soft text-center mb-8 text-sm">
              <span className="font-medium text-ink">{submittedName}</span> already has a GreenReserve page,
              so there&apos;s nothing to set up again. If you&apos;re its operator, we can point you at the
              right place &mdash; we&apos;ll send a code to the email address on file first, to check it&apos;s you.
            </p>

            {signinError && (
              <div role="alert" className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">{signinError}</div>
            )}

            <button
              type="button"
              onClick={requestSigninCode}
              disabled={signinBusy}
              className="flex items-center justify-center gap-2 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm transition-colors disabled:opacity-50 mb-3"
            >
              {signinBusy ? 'Sending...' : 'Yes \u2014 send me a code'}
            </button>
            <p className="text-center text-xs text-ink-soft">
              No, something else?{' '}
              <a href="mailto:thegreenreserve@outlook.com" className="text-ink-soft underline hover:text-ink">thegreenreserve@outlook.com</a>.
            </p>
          </>
        )}

        {signinStep === 'code' && (
          <>
            
            <h1 className="text-2xl sm:text-3xl font-serif font-semibold tracking-tight text-ink mb-2 text-center">
              Check your email.
            </h1>
            {/* Deliberately does not print the address. They typed it to get
                here, and repeating it back would make this screen worth
                reaching for someone who had guessed a course name. */}
            <p className="text-ink-soft text-center mb-6 text-sm">
              We&apos;ve sent a six-digit code to the address on file for {submittedName}. It expires in ten minutes.
            </p>

            {signinError && (
              <div role="alert" className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">{signinError}</div>
            )}

            <label htmlFor="signin-code" className="sr-only">Six-digit code</label>
            <input
              id="signin-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={signinCode}
              onChange={e => setSigninCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter' && signinCode.length === 6 && !signinBusy) verifySigninCode(); }}
              placeholder="000000"
              className="w-full bg-paper border border-line rounded-md px-3 py-3 text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10 text-center text-2xl tracking-[0.4em] font-medium mb-3"
            />
            <button
              type="button"
              onClick={verifySigninCode}
              disabled={signinBusy || signinLocked || signinCode.length !== 6}
              className="flex items-center justify-center gap-2 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm transition-colors disabled:opacity-50 mb-3"
            >
              {signinBusy ? 'Checking...' : 'Confirm'}
            </button>
            {/* The way out of every failure on this step. Without it, "start
                again" meant reloading the page and re-filling the whole form. */}
            <button
              type="button"
              onClick={requestSigninCode}
              disabled={signinBusy}
              className="w-full bg-paper border border-line hover:border-line-strong text-ink-soft py-2.5 rounded-md font-medium text-[12.5px] transition-colors disabled:opacity-50 mb-3"
            >
              {signinBusy ? 'Sending...' : 'Send a new code'}
            </button>
            <p className="text-center text-xs text-ink-soft">
              Didn&apos;t arrive? Check spam, or{' '}
              <a href="mailto:thegreenreserve@outlook.com" className="text-ink-soft underline hover:text-ink">email us</a>.
            </p>
          </>
        )}

        {signinStep === 'done' && signinResult && (
          <>
            
            {signinResult.hasAccount && !signinResult.needsSetup ? (
              <>
                <h1 className="text-2xl sm:text-3xl font-serif font-semibold tracking-tight text-ink mb-2 text-center">
                  That&apos;s you. Here&apos;s the door.
                </h1>
                <p className="text-ink-soft text-center mb-8 text-sm">
                  Sign in with <span className="font-medium text-ink">{signinResult.loginEmail}</span> and your
                  usual password. Your contact details, rates and everything else on the page change there.
                </p>
                <Link
                  href="/dashboard/login"
                  className="flex items-center justify-center gap-2 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm transition-colors mb-3"
                >
                  Go to sign in
                </Link>
                <p className="text-center text-xs text-ink-soft">
                  Forgotten it?{' '}
                  <Link href="/dashboard/forgot-password" className="text-ink-soft underline hover:text-ink">Reset your password</Link>.
                </p>
              </>
            ) : (
              /* A course can be BUILT while its operator never finished setting
                 up a login. Sending that person to a sign-in screen is a dead
                 end dressed as an answer, so say the true thing instead. The
                 route has already written it to the activity ledger. */
              <>
                <h1 className="text-2xl sm:text-3xl font-serif font-semibold tracking-tight text-ink mb-2 text-center">
                  That&apos;s you &mdash; but your login isn&apos;t ready yet.
                </h1>
                <p className="text-ink-soft text-center mb-8 text-sm">
                  {submittedName} has a page, but the account for{' '}
                  <span className="font-medium text-ink">{signinResult.loginEmail}</span>{' '}
                  {signinResult.needsSetup ? 'still needs its email confirmed' : 'hasn\u2019t been created yet'}.
                  We&apos;ve flagged this to the team and someone will email you. If it&apos;s urgent, reply to any
                  GreenReserve email or use the address below.
                </p>
                <a
                  href="mailto:thegreenreserve@outlook.com"
                  className="flex items-center justify-center gap-2 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm transition-colors"
                >
                  Email thegreenreserve@outlook.com
                </a>
              </>
            )}
          </>
        )}

      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="bg-white rounded-lg p-10 max-w-lg w-full border border-line">
        
        {/* IF-1 §3: the next step is a call, not a wait. The booking link in
            the email arrives with CALL_SCHEDULING_SPEC SC-2; until then the
            button below is the way to pick a time. */}
        <h1 className="text-2xl sm:text-3xl font-serif font-semibold tracking-tight text-ink mb-2 text-center">Thanks — we&apos;ll reply by email.</h1>
        <p className="text-ink-soft text-center mb-8 text-sm">
          Your question about <span className="font-medium text-ink">{submittedName}</span> is with us, and we&apos;ll answer at <span className="font-medium text-ink">{submittedEmail}</span>.
          If you&apos;d rather see GreenReserve working, book a demo below.
        </p>

        {/* FB-1: this used to link a Calendly page that was never set up. Now
            the Cal.com booker, prefilled with what they typed; the booking is
            matched to the inquiry by email. The confirmation email carries the
            invite link too. */}
        {callUrl ? (
          <a
            href={callUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm transition-colors mb-3"
          >
            
            Book a demo
          </a>
        ) : (
          <p className="text-center text-sm text-ink-soft mb-3">The email has a link to book a demo.</p>
        )}
        {/* Cam 2026-09-16: a course that already has a page can't be created
            again — its details change in the dashboard. This line is shown to
            EVERY submitter, not only to the ones whose course is already
            built: the API answers identically either way on purpose, because a
            success screen that only appeared for existing courses would turn a
            public form into a "is this course on GreenReserve yet" lookup. The
            operator who needs it reads it; nobody else learns anything. */}
        <p className="text-center text-xs text-ink-soft mt-5 pt-5 border-t border-line">
          Already have a GreenReserve page? Your course details change in one place —{' '}
          <Link href="/dashboard/login" className="text-ink-soft underline hover:text-ink">sign in to your dashboard</Link>.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper">
      {/* FLOW-1 (Cam 2026-10-01): the homepage's header and type, not a pine
          band — the page a "Send an inquiry" click lands on should read as the
          same site. Logo top-left as on `/`; the demo stays one click away. */}
      <PlainHeader right={
        <a href="/demo" className="inline-flex items-center h-[42px] px-4 rounded-md bg-pine hover:bg-pine-hover text-white text-[15px] font-semibold transition-colors">
          Book a demo
        </a>
      } />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12">
        <Link href="/" className="inline-flex items-center gap-1.5 text-ink-muted hover:text-ink transition-colors text-sm">
          <ArrowLeft size={14} /> Back
        </Link>
        <h1 className="mt-6 text-ink text-[34px] sm:text-[46px] leading-[1.05] font-serif font-bold tracking-[-0.02em]">Ask a question</h1>
        <p className="mt-3 text-ink-soft text-[17px] max-w-[40em]">Free to list. $0 / month. Golfers pay our $1.50 per player — added to their total, not taken from your green fee.</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
        <div className="lg:grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-14 lg:items-start">

          {/* The form */}
          <div ref={formRef} className="space-y-8 lg:order-last">

          {/* Honeypot — hidden from humans, read by bots. FB-1: it used to be
              labelled "Website" / name="_website", which browser autofill and
              password managers fill in (they ignore autocomplete="off" for
              address-like fields) — and a filled honeypot silently discards the
              whole inquiry. Nothing here looks like a field autofill knows. */}
          <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
            <label htmlFor="gr-hp-q7">Leave this empty</label>
            <input ref={honeypotRef} id="gr-hp-q7" name="gr_hp_q7" type="text" tabIndex={-1} autoComplete="new-password" data-1p-ignore data-lpignore="true" defaultValue=""/>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                <div id="fld-firstName">
                <Label text="First name" required />
                <input
                  className={fieldErrors.firstName ? inpErr : inp}
                  value={form.firstName}
                  onChange={e => set('firstName', e.target.value)}
                  onBlur={() => blurField('firstName')}
                  autoComplete="given-name"
                />
                <FieldError msg={fieldErrors.firstName}/>
              </div>
              <div id="fld-lastName">
                <Label text="Last name" required />
                <input
                  className={fieldErrors.lastName ? inpErr : inp}
                  value={form.lastName}
                  onChange={e => set('lastName', e.target.value)}
                  onBlur={() => blurField('lastName')}
                  autoComplete="family-name"
                />
                <FieldError msg={fieldErrors.lastName}/>
              </div>
            </div>
              <div id="fld-email">
                <Label text="Email" required />
                <input
                  className={fieldErrors.email ? inpErr : inp}
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  onBlur={() => blurField('email')}
                  type="email" autoComplete="email" inputMode="email"
                  placeholder="you@course.com"
                />
                <FieldError msg={fieldErrors.email}/>
              </div>
              <div id="fld-phone">
                <Label text="Phone (optional)" />
                <input
                  className={fieldErrors.phone ? inpErr : inp}
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  onBlur={() => blurField('phone')}
                  type="tel" autoComplete="tel"
                />
                <FieldError msg={fieldErrors.phone}/>
              </div>
              <div id="fld-courseName">
                <Label text="Course name" required />
                <input
                  className={fieldErrors.courseName ? inpErr : inp}
                  value={form.courseName}
                  onChange={e => set('courseName', e.target.value)}
                  onBlur={() => blurField('courseName')}
                  autoComplete="organization"
                />
                <FieldError msg={fieldErrors.courseName}/>
              </div>
            <div className="grid grid-cols-2 gap-3">
              <div id="fld-city">
                <Label text="City" required />
                <input
                  className={fieldErrors.city ? inpErr : inp}
                  value={form.city}
                  onChange={e => set('city', e.target.value)}
                  onBlur={() => blurField('city')}
                  autoComplete="address-level2"
                />
                <FieldError msg={fieldErrors.city}/>
              </div>
              <div id="fld-state">
                <Label text="State" required />
                <select
                  className={fieldErrors.state ? selErr : sel}
                  value={form.state}
                  onChange={e => set('state', e.target.value)}
                  onBlur={() => blurField('state')}
                  autoComplete="address-level1"
                >
                  <option value="">Select...</option>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <FieldError msg={fieldErrors.state}/>
              </div>
            </div>
            <div id="fld-notes">
              <Label text="Your question" required />
              <textarea
                rows={5}
                maxLength={2000}
                className={fieldErrors.notes ? inpErr : inp}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                onBlur={() => blurField('notes')}
                placeholder="Ask us anything — how it works with your tee sheet, pricing, members, getting set up."
              />
              <FieldError msg={fieldErrors.notes}/>
            </div>
          </div>

          {serverError && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm">{serverError}</div>}

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full bg-pine hover:bg-pine-hover text-white py-3.5 rounded-md font-medium text-sm disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Sending…' : 'Send your question'}
          </button>
          <p className="text-center text-ink-soft text-xs">
            We reply by email. Want to see it instead? <a href="/demo" className="text-ink underline underline-offset-2">Book a demo</a>.
          </p>
          </div>

          {/* The pitch — sticky beside the form on desktop */}
          <aside className="mt-12 lg:mt-0 lg:order-first">
            <div className="lg:sticky lg:top-10 space-y-6">
              <p className="text-[13px] font-semibold text-ink">Why list with us</p>
              <div className="bg-white rounded-lg shadow-card divide-y divide-line-soft">
                {[
                  { stat: '$1.50', label: "Per player, added to the golfer's total" },
                  { stat: '0%', label: 'Commission on green fees' },
                  { stat: '$0', label: 'Setup or monthly fee' },
                ].map(({ stat, label }) => (
                  <div key={stat} className="px-5 py-4">
                    <div className="text-2xl font-serif font-semibold text-ink leading-none mb-1.5">{stat}</div>
                    <div className="text-[12.5px] text-ink-muted">{label}</div>
                  </div>
                ))}
              </div>
              <p className="text-ink-soft text-xs leading-relaxed">
                You set your green fee; the golfer pays it plus our $1.50 per player in one card payment to your own Stripe account. Stripe&apos;s standard processing fee (currently 2.9% + 30¢ per payment) comes out of that payment, as with any card you take — GreenReserve charges you nothing on top of it. Our $1.50 per player is then passed to GreenReserve. That, plus 1% of each membership-dues payment collected through GreenReserve (added to what the member pays, so your dues arrive in full), is our only revenue: no setup fee, no monthly fee, no commission on your green fees.
              </p>
            </div>
          </aside>

        </div>
      </div>
      {/* Short FAQ */}
      <div className="border-t border-line">
        <div className="max-w-xl mx-auto px-4 py-10 pb-16">
          <p className="text-[15px] font-semibold text-ink mb-5">Quick answers</p>
          <div className="space-y-5">
            {[
              { q: 'What does it cost to list my course?', a: 'Nothing. $0 to set up, $0/month, no long-term contract. Golfers pay $1.50 per player at checkout, on top of your price.' },
              { q: 'Who pays the $1.50?', a: "The golfer, as a line on their checkout above your green fee. It's collected in the same card payment as your green fee and passed to GreenReserve, so your listed price isn't reduced. Stripe's normal processing fee applies to the payment as a whole, like any card you take today." },
              { q: 'How long does it take to go live?', a: 'About a week from your first call. We handle setup and run a test before flipping you live.' },
              { q: 'Can I leave anytime?', a: 'Yes, with 30 days’ notice — the same either way, and there is no cancellation fee. We deactivate your page and your data is yours to keep.' },
            ].map(({ q, a }) => (
              <div key={q}>
                <p className="text-sm font-medium text-ink mb-1">{q}</p>
                <p className="text-sm text-ink-soft leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
