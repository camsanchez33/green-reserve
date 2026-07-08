'use client';
import { useState } from 'react';
import { CheckCircle, Calendar } from 'lucide-react';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];
const TITLE_OPTIONS = ['Owner / Operator', 'General Manager', 'Director of Golf', 'Head Golf Professional', 'Course Superintendent', 'Assistant Pro / Manager', 'Other'];
const COURSE_TYPES = [
  { value: 'public',       label: 'Public' },
  { value: 'municipal',    label: 'Municipal' },
  { value: 'semi-private', label: 'Semi-private' },
  { value: 'resort',       label: 'Resort' },
];

const CALENDLY_URL = 'https://calendly.com/greenreserve';

type FormData = {
  firstName: string; lastName: string;
  contactTitle: string; contactTitleOther: string;
  email: string; phone: string;
  courseName: string; city: string; state: string; courseType: string;
  notes: string;
};

const init: FormData = {
  firstName: '', lastName: '',
  contactTitle: '', contactTitleOther: '',
  email: '', phone: '',
  courseName: '', city: '', state: '', courseType: 'public',
  notes: '',
};

const inp = "w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors";
const sel = "w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors";

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">
      {text}{required && <span className="text-bad ml-0.5">*</span>}
    </label>
  );
}

export default function ForCoursesContent() {
  const [form, setForm] = useState<FormData>(init);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedName, setSubmittedName] = useState('');
  const [error, setError] = useState('');

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  const validate = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return 'Please enter your first and last name.';
    if (!form.contactTitle) return 'Please select your title or role.';
    if (form.contactTitle === 'Other' && !form.contactTitleOther.trim()) return 'Please tell us your title or role.';
    if (!form.email.trim()) return 'Please enter your email.';
    if (!form.phone.trim()) return 'Please enter your phone number.';
    if (!form.courseName.trim()) return 'Please enter your course name.';
    if (!form.city.trim() || !form.state) return 'Please enter your course city and state.';
    return '';
  };

  const submit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSubmitting(true); setError('');
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
        additionalNotes: form.notes,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setSubmittedName(form.courseName);
      setSubmitted(true);
    } else {
      const d = await res.json();
      setError(d.error || 'Something went wrong. Please try again.');
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
            ['We review your submission', 'We\'ll reply within 1 business day. If it\'s a good fit, we\'ll send you a short details sheet.'],
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

      <div className="max-w-xl mx-auto px-4 py-8 space-y-8">

        {/* Section 1: You */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-4">About you</p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label text="First name" required />
                <input className={inp} value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="John" />
              </div>
              <div>
                <Label text="Last name" required />
                <input className={inp} value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Smith" />
              </div>
            </div>
            <div>
              <Label text="Title / role" required />
              <select className={sel} value={form.contactTitle} onChange={e => set('contactTitle', e.target.value)}>
                <option value="">Select...</option>
                {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {form.contactTitle === 'Other' && (
                <input className={`${inp} mt-2`} value={form.contactTitleOther} onChange={e => set('contactTitleOther', e.target.value)} placeholder="Your title or role" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label text="Email" required />
                <input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@course.com" />
              </div>
              <div>
                <Label text="Phone" required />
                <input className={inp} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(201) 555-0100" />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Your course */}
        <div>
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-4">Your course</p>
          <div className="space-y-4">
            <div>
              <Label text="Course name" required />
              <input className={inp} value={form.courseName} onChange={e => set('courseName', e.target.value)} placeholder="Pebble Beach Golf Links" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label text="City" required />
                <input className={inp} value={form.city} onChange={e => set('city', e.target.value)} placeholder="Pebble Beach" />
              </div>
              <div>
                <Label text="State" required />
                <select className={sel} value={form.state} onChange={e => set('state', e.target.value)}>
                  <option value="">Select...</option>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label text="Course type" required />
              <select className={sel} value={form.courseType} onChange={e => set('courseType', e.target.value)}>
                {COURSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Optional */}
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

        {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm">{error}</div>}

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full bg-pine hover:bg-pine-hover text-white py-3.5 rounded-md font-medium text-sm disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
        <p className="text-center text-ink-muted text-xs pb-4">
          We review every submission and reply within 1 business day.
        </p>
      </div>
    </div>
  );
}
