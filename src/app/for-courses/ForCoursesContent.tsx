'use client';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, Calendar, Globe, Lock } from 'lucide-react';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];
const TITLE_OPTIONS = ['Owner / Operator', 'General Manager', 'Director of Golf', 'Head Golf Professional', 'Course Superintendent', 'Assistant Pro / Manager', 'Other'];

const CALENDLY_URL = 'https://calendly.com/greenreserve';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type FormData = {
  firstName: string; lastName: string;
  contactTitle: string; contactTitleOther: string;
  email: string; phone: string;
  courseName: string; city: string; state: string;
  courseType: 'public' | 'private';
  notes: string;
  residentRates: string;
  hasMemberships: string;
  roundsPerMonth: string;
  publicTeeTimes: string;
  memberCount: string;
  outsideOutings: string;
  memberBookingToday: string;
  chargesMembersPerRound: string;
};

const init: FormData = {
  firstName: '', lastName: '',
  contactTitle: '', contactTitleOther: '',
  email: '', phone: '',
  courseName: '', city: '', state: '',
  courseType: 'public',
  notes: '',
  residentRates: '', hasMemberships: '', roundsPerMonth: '',
  publicTeeTimes: '', memberCount: '', outsideOutings: '', memberBookingToday: '', chargesMembersPerRound: '',
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

function RadioGroup({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label text={label} />
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              'px-3 py-2 rounded-md border text-sm transition-colors ' +
              (value === opt.value
                ? 'border-pine bg-pine/5 text-pine font-medium'
                : 'border-line bg-paper text-ink hover:border-pine/40')
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ForCoursesContent() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormData>(init);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedName, setSubmittedName] = useState('');
  const [serverError, setServerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = searchParams.get('type');
    if (t === 'public' || t === 'private') setType(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setType = (t: 'public' | 'private') => setForm(f => ({
    ...f, courseType: t,
    residentRates: '', hasMemberships: '', roundsPerMonth: '',
    publicTeeTimes: '', memberCount: '', outsideOutings: '', memberBookingToday: '', chargesMembersPerRound: '',
  }));

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

    const needs: Record<string, string> = {};
    if (form.courseType === 'public') {
      if (form.residentRates) needs.residentRates = form.residentRates;
      if (form.hasMemberships) needs.hasMemberships = form.hasMemberships;
      if (form.roundsPerMonth) needs.roundsPerMonth = form.roundsPerMonth;
    } else {
      if (form.publicTeeTimes) needs.publicTeeTimes = form.publicTeeTimes;
      if (form.memberCount) needs.memberCount = form.memberCount;
      if (form.outsideOutings) needs.outsideOutings = form.outsideOutings;
      if (form.memberBookingToday) needs.memberBookingToday = form.memberBookingToday;
      if (form.chargesMembersPerRound) needs.chargesMembersPerRound = form.chargesMembersPerRound;
    }

    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: form.firstName, lastName: form.lastName,
        contactTitle,
        email: form.email, phone: form.phone,
        courseName: form.courseName, city: form.city, state: form.state,
        courseType: form.courseType,
        additionalNotes: form.notes,
        needs,
        // honeypot (always empty for real users)
        _website: '',
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setSubmittedName(form.courseName);
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
        <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-1 text-center">Got it — we&apos;ll be in touch.</h1>
        <p className="text-ink-soft text-center mb-8 text-sm">
          We received your inquiry for <span className="font-medium text-ink">{submittedName}</span>.
          Check your email for a confirmation.
        </p>

        <div className="space-y-0 mb-8 border border-line rounded-md overflow-hidden">
          {[
            ['We review your submission', "We'll reply within 1 business day. If it's a good fit, we'll send you a short details sheet."],
            ['You fill out a details sheet', 'Pricing, policies, facilities — about 5 minutes. Saves as you go.'],
            ['We build your page', 'You review, approve, and go live. Golfers can book the same day.'],
          ].map(([title, desc], i) => (
            <div key={i} className={`px-5 py-4 ${i < 2 ? 'border-b border-line' : ''}`}>
              <div className="flex gap-3">
                <span className="text-pine font-medium text-sm shrink-0">{i + 1}.</span>
                <div>
                  <p className="text-sm font-medium text-ink mb-0.5">{title}</p>
                  <p className="text-sm text-ink-muted">{desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <a
          href={CALENDLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm transition-colors mb-3"
        >
          <Calendar className="w-4 h-4" />
          Don&apos;t want to wait? Pick a time
        </a>
        <p className="text-center text-xs text-ink-muted">Book a 15-min call at a time that works for you.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper">
      <div className="bg-pine px-6 py-10 text-center">
        <span className="text-[17px] font-serif font-medium tracking-tight text-white">Green<span className="text-paper/70">Reserve</span></span>
        <h1 className="text-white text-[22px] font-serif font-medium mt-4 mb-1 tracking-tight">Get your course listed</h1>
        <p className="text-white/50 text-sm">Free to list. $0 / month. We charge golfers $1.50 — not you.</p>
      </div>

      <div ref={formRef} className="max-w-xl mx-auto px-4 py-8 space-y-8">

        {/* Honeypot — hidden from humans, read by bots */}
        <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
          <label htmlFor="hp-website">Website</label>
          <input id="hp-website" name="_website" type="text" tabIndex={-1} autoComplete="off"/>
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

            {/* Course type — two radio cards */}
            <div>
              <Label text="Course type" required />
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'public' as const, label: 'Public', Icon: Globe, desc: 'Open to all golfers. Standard weekday/weekend pricing.' },
                  { value: 'private' as const, label: 'Private', Icon: Lock, desc: 'Member-controlled access. Restricted or limited public tee times.' },
                ] as const).map(({ value, label, Icon, desc }) => {
                  const active = form.courseType === value;
                  return (
                    <button
                      key={value}
                      type="button"
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

            {/* Public branch */}
            {form.courseType === 'public' && (
              <div className="space-y-4 border-l-2 border-pine/20 pl-4">
                <RadioGroup
                  label="Discounted rates for town/county residents?"
                  value={form.residentRates}
                  onChange={v => set('residentRates', v)}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                />
                <RadioGroup
                  label="Memberships or season passes?"
                  value={form.hasMemberships}
                  onChange={v => set('hasMemberships', v)}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                />
                <RadioGroup
                  label="Average rounds per month"
                  value={form.roundsPerMonth}
                  onChange={v => set('roundsPerMonth', v)}
                  options={[
                    { value: 'under_500', label: 'Under 500' },
                    { value: '500_1500', label: '500–1,500' },
                    { value: '1500_3000', label: '1,500–3,000' },
                    { value: '3000_plus', label: '3,000+' },
                  ]}
                />
              </div>
            )}

            {/* Private branch */}
            {form.courseType === 'private' && (
              <div className="space-y-4 border-l-2 border-pine/20 pl-4">
                <RadioGroup
                  label="Do you allow non-member tee times?"
                  value={form.publicTeeTimes}
                  onChange={v => set('publicTeeTimes', v)}
                  options={[
                    { value: 'yes_regularly', label: 'Yes, regularly' },
                    { value: 'limited', label: 'Limited windows' },
                    { value: 'no', label: 'No, members only' },
                  ]}
                />
                <RadioGroup
                  label="Roughly how many members?"
                  value={form.memberCount}
                  onChange={v => set('memberCount', v)}
                  options={[
                    { value: 'under_100', label: 'Under 100' },
                    { value: '100_300', label: '100–300' },
                    { value: '300_plus', label: '300+' },
                  ]}
                />
                <RadioGroup
                  label="Outside outings or tournaments?"
                  value={form.outsideOutings}
                  onChange={v => set('outsideOutings', v)}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                />
                <RadioGroup
                  label="How do members book today?"
                  value={form.memberBookingToday}
                  onChange={v => set('memberBookingToday', v)}
                  options={[
                    { value: 'pro_shop_phone', label: 'Pro shop / phone' },
                    { value: 'signup_sheet', label: 'Sign-up sheet' },
                    { value: 'booking_software', label: 'Booking software' },
                    { value: 'other', label: 'Other' },
                  ]}
                />
                <RadioGroup
                  label="Do you charge members per round?"
                  value={form.chargesMembersPerRound}
                  onChange={v => set('chargesMembersPerRound', v)}
                  options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                />
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Optional notes */}
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
      </div>

      {/* Proof section */}
      <div className="border-t border-line mt-8">
        <div className="max-w-xl mx-auto px-4 py-10">
          <div className="grid grid-cols-3 gap-4 mb-8 text-center">
            {[
              { stat: '$1.50', label: 'Per golfer, charged to them' },
              { stat: '0%', label: 'Commission on green fees' },
              { stat: '1–2 days', label: 'Typical setup time' },
            ].map(({ stat, label }) => (
              <div key={stat}>
                <div className="text-xl font-serif font-medium text-ink mb-0.5">{stat}</div>
                <div className="text-[10px] uppercase tracking-[0.05em] text-ink-muted">{label}</div>
              </div>
            ))}
          </div>
          <div className="bg-white border border-line rounded-md p-5">
            <p className="text-ink-muted text-xs leading-relaxed">
              Your course keeps 100% of green fees and cart fees. GreenReserve&apos;s only revenue is the $1.50 per-player service fee charged directly to golfers at checkout — it never touches your Stripe account.
            </p>
          </div>
        </div>
      </div>

      {/* Short FAQ */}
      <div className="border-t border-line">
        <div className="max-w-xl mx-auto px-4 py-10 pb-16">
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-5">Quick answers</p>
          <div className="space-y-5">
            {[
              { q: 'What does it cost to list my course?', a: 'Nothing. $0 to set up, $0/month, no contracts. We charge golfers $1.50 per player at checkout.' },
              { q: 'Who pays the $1.50?', a: 'The golfer pays it, not you. It shows as a service fee on their checkout. Your green fee is never reduced.' },
              { q: 'How long does it take to go live?', a: 'Usually 1–2 business days after you submit the details sheet. We handle setup and run a test before flipping you live.' },
              { q: 'Can I leave anytime?', a: 'Yes. No contract, no cancellation fee. If you decide to leave, we deactivate your page and your data is yours to keep.' },
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
