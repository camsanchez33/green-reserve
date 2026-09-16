'use client';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { CheckCircle, Calendar, Globe, Lock, Users, ArrowLeft } from 'lucide-react';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];
// INQUIRY_FORM_SPEC IF-1: the form asks only what the discovery call can't.
const TITLE_OPTIONS = ['General Manager', 'Head Professional', 'Owner', 'Superintendent', 'Other'];
const BOOKING_TODAY_OPTIONS = ['Phone and a paper sheet', 'Phone and a spreadsheet', 'GolfNow or a similar site', 'Our own website', 'Something else'];
const CALL_TIMES = ['Mornings', 'Afternoons', 'Evenings'];
const CALL_DAYS = ['Weekdays', 'Weekends'];
type CourseType = 'public' | 'semi-private' | 'private';
const COURSE_TYPES: CourseType[] = ['public', 'semi-private', 'private'];

const CALENDLY_URL = 'https://calendly.com/greenreserve';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type FormData = {
  firstName: string; lastName: string;
  contactTitle: string; contactTitleOther: string;
  email: string; phone: string;
  courseName: string; city: string; state: string;
  courseType: CourseType;
  bookingToday: string;
  callTimes: string[]; callDays: string[];
  notes: string;
};

const init: FormData = {
  firstName: '', lastName: '',
  contactTitle: '', contactTitleOther: '',
  email: '', phone: '',
  courseName: '', city: '', state: '',
  courseType: 'public',
  bookingToday: '',
  callTimes: [], callDays: [],
  notes: '',
};

// Base input/select classes (no error state)
const inp = "w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors";
const inpErr = "w-full bg-paper border border-bad rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-bad/60 focus:ring-2 focus:ring-bad/10 transition-colors";
const sel = "w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors";
const selErr = "w-full bg-paper border border-bad rounded-md px-3 py-2.5 text-sm text-ink outline-none focus:border-bad/60 focus:ring-2 focus:ring-bad/10 transition-colors";

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">
      {text}{required && <span className="text-bad ml-0.5">*</span>}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-bad">{msg}</p>;
}

// Multi-select chip row (the call-time preference). Toggles, never required.
function ChipRow({ options, value, onChange, ariaLabel }: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {options.map(opt => {
        const on = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter(v => v !== opt) : [...value, opt])}
            className={
              'px-3 py-2 rounded-md border text-sm transition-colors ' +
              (on ? 'border-pine bg-pine/5 text-pine font-medium' : 'border-line bg-paper text-ink hover:border-pine/40')
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export default function ForCoursesContent() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormData>(init);
  // SD review: the honeypot input existed but its value was never sent — the
  // payload hardcoded ''. Bots that fill every field now get the silent 200.
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedName, setSubmittedName] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = searchParams.get('type');
    if (t && (COURSE_TYPES as string[]).includes(t)) setType(t as CourseType);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setType = (t: CourseType) => setForm(f => ({ ...f, courseType: t }));
  const setList = (k: 'callTimes' | 'callDays', v: string[]) => setForm(f => ({ ...f, [k]: v }));

  const validateAll = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.lastName.trim()) errs.lastName = 'Last name is required';
    if (!form.contactTitle) errs.contactTitle = 'Please select your title or role';
    if (form.contactTitle === 'Other' && !form.contactTitleOther.trim()) errs.contactTitleOther = 'Please enter your title';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!EMAIL_RE.test(form.email.trim())) errs.email = 'Enter a valid email address (e.g. you@course.com)';
    if (!form.phone.trim()) errs.phone = 'Phone number is required';
    if (!form.courseName.trim()) errs.courseName = 'Course name is required';
    if (!form.city.trim()) errs.city = 'City is required';
    if (!form.state) errs.state = 'State is required';
    if (!form.bookingToday) errs.bookingToday = 'Tell us how you take tee times today';
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
    const contactTitle = form.contactTitle === 'Other' ? form.contactTitleOther.trim() : form.contactTitle;

    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: form.firstName, lastName: form.lastName,
        contactTitle,
        email: form.email, phone: form.phone,
        courseName: form.courseName, city: form.city, state: form.state,
        courseType: form.courseType,
        currentBookingMethod: form.bookingToday,
        // Optional. Sent only when something was picked; lands in needsJson.callPreference.
        callPreference: form.callTimes.length || form.callDays.length ? { times: form.callTimes, days: form.callDays } : null,
        additionalNotes: form.notes,
        // honeypot (always empty for real users; bots fill it)
        _website: honeypotRef.current?.value ?? '',
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setSubmittedName(form.courseName);
      setSubmittedEmail(form.email.trim());
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

  if (submitted) return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="bg-white rounded-lg p-10 max-w-lg w-full border border-line">
        <CheckCircle className="w-12 h-12 text-ok mx-auto mb-5" />
        {/* IF-1 §3: the next step is a call, not a wait. The booking link in
            the email arrives with CALL_SCHEDULING_SPEC SC-2; until then the
            button below is the way to pick a time. */}
        <h1 className="text-2xl sm:text-3xl font-serif font-medium tracking-tight text-ink mb-2 text-center">Thanks — check your email.</h1>
        <p className="text-ink-soft text-center mb-3 text-sm">
          We&apos;ve sent <span className="font-medium text-ink">{submittedEmail}</span> a confirmation for <span className="font-medium text-ink">{submittedName}</span>.
          Next is a 20-minute call — pick a time below. On it we&apos;ll go through your green fees, your tee sheet, and what going live looks like.
        </p>
        <p className="text-ink-muted text-center mb-8 text-sm">Most courses are live within a week of that call.</p>

        <a
          href={CALENDLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm transition-colors mb-3"
        >
          <Calendar className="w-4 h-4" />
          Pick a call time
        </a>
        <p className="text-center text-xs text-ink-muted">20 minutes, at a time that works for you.</p>
        {/* Cam 2026-09-16: a course that already has a page can't be created
            again — its details change in the dashboard. This line is shown to
            EVERY submitter, not only to the ones whose course is already
            built: the API answers identically either way on purpose, because a
            success screen that only appeared for existing courses would turn a
            public form into a "is this course on GreenReserve yet" lookup. The
            operator who needs it reads it; nobody else learns anything. */}
        <p className="text-center text-xs text-ink-muted mt-5 pt-5 border-t border-line">
          Already have a GreenReserve page? Your course details change in one place —{' '}
          <Link href="/dashboard/login" className="text-ink-soft underline hover:text-ink">sign in to your dashboard</Link>.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper">
      <div className="relative bg-pine px-6 py-10 text-center">
        <Link href="/" className="absolute left-6 top-6 inline-flex items-center gap-1.5 text-white/60 hover:text-white transition-colors text-sm">
          <ArrowLeft size={14} /> Back
        </Link>
        <Link href="/" className="inline-block">
          <Image src="/brand/logo-lockup-cream-900.png" alt="GreenReserve" width={88} height={44} priority className="h-11 w-auto mx-auto" />
        </Link>
        <h1 className="text-white text-3xl sm:text-4xl font-serif font-medium mt-4 mb-2 tracking-tight">Get your course listed</h1>
        <p className="text-white/50 text-sm">Free to list. $0 / month. Golfers pay our $1.50 per player — added to their total, not taken from your green fee.</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
        <div className="lg:grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-14 lg:items-start">

          {/* The form */}
          <div ref={formRef} className="space-y-8 lg:order-last">

          {/* Private-club reassurance */}
          {form.courseType === 'private' && (
            <div className="bg-white border border-line rounded-lg px-5 py-4 flex gap-3">
              <Lock className="w-4 h-4 text-pine shrink-0 mt-0.5" />
              <div className="text-sm text-ink-soft space-y-1.5">
                <p><span className="font-medium text-ink">Member-only booking.</span> Your tee sheet can be fully private — no public tee times unless you choose to enable outside play.</p>
                <p><span className="font-medium text-ink">Your member data stays yours.</span> Member information is scoped to your club and is never shared, aggregated, or marketed to by GreenReserve.</p>
                <p><span className="font-medium text-ink">Private sign-in portal.</span> Member login is specific to your club — members can&apos;t browse or access any other course.</p>
              </div>
            </div>
          )}

          {/* Honeypot — hidden from humans, read by bots */}
          <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
            <label htmlFor="hp-website">Website</label>
            <input ref={honeypotRef} id="hp-website" name="_website" type="text" tabIndex={-1} autoComplete="off" defaultValue=""/>
          </div>

          {/* Section 1: You */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-4">About you</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div id="fld-firstName">
                  <Label text="First name" required />
                  <input
                    className={fieldErrors.firstName ? inpErr : inp}
                    value={form.firstName}
                    onChange={e => set('firstName', e.target.value)}
                    onBlur={() => blurField('firstName')}
                    placeholder="John"
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
                    placeholder="Smith"
                    autoComplete="family-name"
                  />
                  <FieldError msg={fieldErrors.lastName}/>
                </div>
              </div>
              <div id="fld-contactTitle">
                <Label text="Title / role" required />
                <select
                  className={fieldErrors.contactTitle ? selErr : sel}
                  value={form.contactTitle}
                  onChange={e => set('contactTitle', e.target.value)}
                  onBlur={() => blurField('contactTitle')}
                >
                  <option value="">Select...</option>
                  {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <FieldError msg={fieldErrors.contactTitle}/>
                {form.contactTitle === 'Other' && (
                  <div id="fld-contactTitleOther" className="mt-2">
                    <input
                      className={fieldErrors.contactTitleOther ? inpErr : inp}
                      value={form.contactTitleOther}
                      onChange={e => set('contactTitleOther', e.target.value)}
                      onBlur={() => blurField('contactTitleOther')}
                      placeholder="Your title or role"
                    />
                    <FieldError msg={fieldErrors.contactTitleOther}/>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div id="fld-email">
                  <Label text="Email" required />
                  <input
                    type="email"
                    className={fieldErrors.email ? inpErr : inp}
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    onBlur={() => blurField('email')}
                    placeholder="you@course.com"
                    autoComplete="email"
                  />
                  <FieldError msg={fieldErrors.email}/>
                </div>
                <div id="fld-phone">
                  <Label text="Phone" required />
                  <input
                    type="tel"
                    className={fieldErrors.phone ? inpErr : inp}
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    onBlur={() => blurField('phone')}
                    placeholder="(201) 555-0100"
                    autoComplete="tel"
                  />
                  <FieldError msg={fieldErrors.phone}/>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Your course */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-4">Your course</p>
            <div className="space-y-4">
              <div id="fld-courseName">
                <Label text="Course name" required />
                <input
                  className={fieldErrors.courseName ? inpErr : inp}
                  value={form.courseName}
                  onChange={e => set('courseName', e.target.value)}
                  onBlur={() => blurField('courseName')}
                  placeholder="Pebble Beach Golf Links"
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
                    placeholder="Pebble Beach"
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

              {/* Course type — three cards */}
              <div id="fld-courseType">
                <Label text="Course type" required />
                <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                  {([
                    { value: 'public' as const, label: 'Public', Icon: Globe, desc: 'Open to all golfers.' },
                    { value: 'semi-private' as const, label: 'Semi-private', Icon: Users, desc: 'Members plus public tee times.' },
                    { value: 'private' as const, label: 'Private', Icon: Lock, desc: 'Member-controlled access.' },
                  ] as const).map(({ value, label, Icon, desc }) => {
                    const active = form.courseType === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setType(value)}
                        className={
                          'text-left p-4 rounded-lg border-2 transition-colors ' +
                          (active ? 'border-pine bg-pine/5' : 'border-line hover:border-pine/30 bg-white')
                        }
                      >
                        <div className={'flex items-center gap-2 mb-1.5 ' + (active ? 'text-pine' : 'text-ink-soft')}>
                          <Icon className="w-4 h-4" />
                          <span className="text-[13px] font-medium text-ink">{label}</span>
                        </div>
                        <p className="text-xs text-ink-soft leading-relaxed">{desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* The one fact that changes how the call opens. Lands in CourseInquiry.currentBookingMethod. */}
              <div id="fld-bookingToday">
                <Label text="How do you take tee times today?" required />
                <select
                  className={fieldErrors.bookingToday ? selErr : sel}
                  value={form.bookingToday}
                  onChange={e => set('bookingToday', e.target.value)}
                  onBlur={() => blurField('bookingToday')}
                >
                  <option value="">Select...</option>
                  {BOOKING_TODAY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <FieldError msg={fieldErrors.bookingToday}/>
              </div>
            </div>
          </div>

          {/* Section 3: the call */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">When&apos;s good for a 20-minute call? <span className="normal-case tracking-normal font-normal text-ink-faint">(optional)</span></p>
            <p className="text-xs text-ink-muted mb-4">We&apos;ll go through your green fees, your tee sheet, and what going live looks like.</p>
            <div className="space-y-3">
              <ChipRow options={CALL_TIMES} value={form.callTimes} onChange={v => setList('callTimes', v)} ariaLabel="Time of day" />
              <ChipRow options={CALL_DAYS} value={form.callDays} onChange={v => setList('callDays', v)} ariaLabel="Days" />
            </div>
          </div>

          {/* Section 4: Optional notes */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-4">Anything we should know? <span className="normal-case tracking-normal font-normal text-ink-faint">(optional)</span></p>
            <textarea
              rows={3}
              className={inp}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Special setup, software you're replacing, timeline — whatever's useful."
            />
          </div>

          {serverError && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm">{serverError}</div>}

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full bg-pine hover:bg-pine-hover text-white py-3.5 rounded-md font-medium text-sm disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
          <p className="text-center text-ink-muted text-xs">
            We review every submission and reply within 1 business day.
          </p>
          <p className="text-center text-ink-faint text-xs">
            No account is created — this just sends us an inquiry.
          </p>
          </div>

          {/* The pitch — sticky beside the form on desktop */}
          <aside className="mt-12 lg:mt-0 lg:order-first">
            <div className="lg:sticky lg:top-10 space-y-6">
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">Why list with us</p>
              <div className="bg-white border border-line rounded-lg divide-y divide-line-soft">
                {[
                  { stat: '$1.50', label: "Per player, added to the golfer's total" },
                  { stat: '0%', label: 'Commission on green fees' },
                  { stat: '1–2 days', label: 'Typical setup time' },
                ].map(({ stat, label }) => (
                  <div key={stat} className="px-5 py-4">
                    <div className="text-2xl font-serif font-medium text-ink leading-none mb-1.5">{stat}</div>
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{label}</div>
                  </div>
                ))}
              </div>
              <p className="text-ink-muted text-xs leading-relaxed">
                You set your green fee; the golfer pays it plus our $1.50 per player in one card payment to your own Stripe account. Stripe&apos;s standard processing fee (currently 2.9% + 30¢ per payment) comes out of that payment, as with any card you take — GreenReserve charges you nothing on top of it. Our $1.50 per player is then passed to GreenReserve. That, plus 50¢ on each membership-dues payment collected through GreenReserve, is our only revenue: no setup fee, no monthly fee, no commission on your green fees.
              </p>
            </div>
          </aside>

        </div>
      </div>
      {/* Short FAQ */}
      <div className="border-t border-line">
        <div className="max-w-xl mx-auto px-4 py-10 pb-16">
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-5">Quick answers</p>
          <div className="space-y-5">
            {[
              { q: 'What does it cost to list my course?', a: 'Nothing. $0 to set up, $0/month, no long-term contract. Golfers pay $1.50 per player at checkout, on top of your price.' },
              { q: 'Who pays the $1.50?', a: "The golfer, as a line on their checkout above your green fee. It's collected in the same card payment as your green fee and passed to GreenReserve, so your listed price isn't reduced. Stripe's normal processing fee applies to the payment as a whole, like any card you take today." },
              { q: 'How long does it take to go live?', a: 'Usually 1–2 business days after you submit the details sheet. We handle setup and run a test before flipping you live.' },
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
