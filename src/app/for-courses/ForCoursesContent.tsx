'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ChevronDown, ChevronUp, Calendar } from 'lucide-react';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];
const TITLE_OPTIONS = ['Owner / Operator', 'General Manager', 'Director of Golf', 'Head Golf Professional', 'Course Superintendent', 'Assistant Pro / Manager', 'Other'];
const COURSE_TYPES = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
  { value: 'resort', label: 'Resort' },
  { value: 'other', label: 'Other' },
];
const GUEST_POLICY_OPTIONS = ['Yes, regularly', 'Occasionally', 'No, members only'];

const CALENDLY_URL = 'https://calendly.com/greenreserve';

type FormData = {
  firstName: string; lastName: string;
  contactTitle: string; contactTitleOther: string;
  email: string; phone: string;
  courseName: string; address: string; city: string; state: string; zipCode: string; website: string;
  courseType: string; courseTypeOther: string;
  privateMemberCount: string; privateGuestPolicy: string;
  teeSheetNeeds: string;
  specialRequests: string;
};

const init: FormData = {
  firstName: '', lastName: '',
  contactTitle: '', contactTitleOther: '',
  email: '', phone: '',
  courseName: '', address: '', city: '', state: '', zipCode: '', website: '',
  courseType: 'public', courseTypeOther: '',
  privateMemberCount: '', privateGuestPolicy: '',
  teeSheetNeeds: '',
  specialRequests: '',
};

function Section({ title, open, toggle, children }: { title: string; open: boolean; toggle: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-line overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-paper/50 transition-colors">
        <span className="font-medium text-ink">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
      </button>
      {open && <div className="px-6 pb-6 border-t border-line pt-4">{children}</div>}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">
        {label}{required && <span className="text-bad ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inp = "w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors";
const sel = "w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors";

export default function ForCoursesContent() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(init);
  const [sections, setSections] = useState({ contact: true, course: true, needs: true });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<{ courseName: string; phone: string } | null>(null);
  const [error, setError] = useState('');

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));

  const validate = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return 'Please enter your first and last name.';
    if (!form.contactTitle) return 'Please select your title or role.';
    if (form.contactTitle === 'Other' && !form.contactTitleOther.trim()) return 'Please tell us your title or role.';
    if (!form.email.trim() || !form.phone.trim()) return 'Please enter your email and phone.';
    if (!form.courseName.trim() || !form.address.trim() || !form.city.trim() || !form.zipCode.trim()) return 'Please fill in all required course info.';
    if (form.courseType === 'other' && !form.courseTypeOther.trim()) return 'Please tell us your course type.';
    return '';
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setSubmitting(true); setError('');

    const courseType = form.courseType === 'other' ? form.courseTypeOther.trim() : form.courseType;
    const contactTitle = form.contactTitle === 'Other' ? form.contactTitleOther.trim() : form.contactTitle;

    const needs: Record<string, string> = {};
    if (form.privateMemberCount) needs['Approx. members'] = form.privateMemberCount;
    if (form.privateGuestPolicy) needs['Guest / reciprocal play'] = form.privateGuestPolicy;
    if (form.teeSheetNeeds) needs['What they need in their tee sheet'] = form.teeSheetNeeds;

    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: form.firstName, lastName: form.lastName,
        contactTitle, email: form.email, phone: form.phone,
        courseName: form.courseName, address: form.address, city: form.city, state: form.state, zipCode: form.zipCode, website: form.website,
        courseType,
        needs,
        additionalNotes: form.specialRequests,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setSubmittedData({ courseName: form.courseName, phone: form.phone });
      setSubmitted(true);
    } else {
      const d = await res.json();
      setError(d.error || 'Something went wrong');
    }
  };

  if (submitted && submittedData) return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="bg-white rounded-lg p-10 max-w-lg w-full border border-line">
        <CheckCircle className="w-14 h-14 text-ok mx-auto mb-5" />
        <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-1 text-center">Got it — we&apos;ll be in touch!</h1>
        <p className="text-ink-soft text-center mb-6 text-sm">
          We received the inquiry for <span className="font-medium text-ink">{submittedData.courseName}</span>.
        </p>

        <div className="bg-paper rounded-md p-5 mb-6 space-y-3 border border-line">
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1">What happens next</div>
          <div className="flex gap-3 text-sm text-ink-soft">
            <span className="text-pine font-medium shrink-0">1.</span>
            <span>We&apos;ll review your submission and call you at <span className="font-medium text-ink">{submittedData.phone}</span> within 1 business day.</span>
          </div>
          <div className="flex gap-3 text-sm text-ink-soft">
            <span className="text-pine font-medium shrink-0">2.</span>
            <span>If it&apos;s a good fit, we&apos;ll email you a short setup sheet to confirm your pricing, policies, and facilities.</span>
          </div>
          <div className="flex gap-3 text-sm text-ink-soft">
            <span className="text-pine font-medium shrink-0">3.</span>
            <span>We build your booking page and send you login credentials — usually same day.</span>
          </div>
        </div>

        <a
          href={CALENDLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-pine hover:bg-pine-hover text-white py-3.5 rounded-md font-medium transition-colors mb-3"
        >
          <Calendar className="w-4 h-4" />
          Don&apos;t want to wait? Pick a time →
        </a>
        <p className="text-center text-xs text-ink-muted mb-4">Book a 15-min call at a time that works for you.</p>

        <button onClick={() => router.push('/')} className="w-full border border-line text-ink-soft py-2.5 rounded-md text-sm hover:bg-paper transition-colors">
          Back to GreenReserve
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <div className="bg-pine px-6 py-10 text-center">
        <span className="text-[17px] font-serif font-medium tracking-tight text-white">Green<span className="text-paper/70">Reserve</span></span>
        <h1 className="text-white text-[22px] font-serif font-medium mt-4 mb-1 tracking-tight">Get your course listed</h1>
        <p className="text-white/50 text-sm mb-1">Free to list. $0 per month. We charge golfers $1.50/player — not you.</p>
        <p className="text-white/30 text-xs">3 quick sections · under 3 minutes</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="space-y-3">

          {/* 1. Contact Information */}
          <Section title="1. Contact Information" open={sections.contact} toggle={() => toggle('contact')}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name" required><input className={inp} value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="John" /></Field>
              <Field label="Last Name" required><input className={inp} value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Smith" /></Field>
              <div className="col-span-2">
                <Field label="Title / Role" required>
                  <select className={sel} value={form.contactTitle} onChange={e => set('contactTitle', e.target.value)}>
                    <option value="">Select...</option>
                    {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                {form.contactTitle === 'Other' && (
                  <input className={`${inp} mt-2`} value={form.contactTitleOther} onChange={e => set('contactTitleOther', e.target.value)} placeholder="Tell us your title or role" />
                )}
              </div>
              <Field label="Email" required><input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
              <Field label="Phone" required><input className={inp} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(201) 555-0100" /></Field>
            </div>
          </Section>

          {/* 2. Course Information */}
          <Section title="2. Course Information" open={sections.course} toggle={() => toggle('course')}>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Field label="Course name" required><input className={inp} value={form.courseName} onChange={e => set('courseName', e.target.value)} /></Field></div>
              <div className="col-span-2"><Field label="Street address" required><input className={inp} value={form.address} onChange={e => set('address', e.target.value)} /></Field></div>
              <Field label="City" required><input className={inp} value={form.city} onChange={e => set('city', e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="State">
                  <select className={sel} value={form.state} onChange={e => set('state', e.target.value)}>
                    <option value="">Select...</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="ZIP" required><input className={inp} value={form.zipCode} onChange={e => set('zipCode', e.target.value)} /></Field>
              </div>
              <Field label="Website"><input className={inp} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://" /></Field>
              <div className="col-span-2">
                <Field label="Course type" required>
                  <select className={sel} value={form.courseType} onChange={e => set('courseType', e.target.value)}>
                    {COURSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                {form.courseType === 'other' && (
                  <input className={`${inp} mt-2`} value={form.courseTypeOther} onChange={e => set('courseTypeOther', e.target.value)} placeholder="Tell us your course type" />
                )}
              </div>

              {form.courseType === 'private' && (
                <div className="col-span-2 space-y-4 bg-pine/5 border border-pine/20 rounded-md p-4">
                  <p className="text-[11px] uppercase tracking-[0.06em] text-pine font-medium">A few questions about your club</p>
                  <Field label="Approximate number of members"><input className={inp} value={form.privateMemberCount} onChange={e => set('privateMemberCount', e.target.value)} placeholder="e.g. 250" /></Field>
                  <Field label="Do you currently allow guest or reciprocal play?">
                    <select className={sel} value={form.privateGuestPolicy} onChange={e => set('privateGuestPolicy', e.target.value)}>
                      <option value="">Select...</option>
                      {GUEST_POLICY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                </div>
              )}
            </div>
          </Section>

          {/* 3. What Does Your Course Need */}
          <Section title="3. What Does Your Course Need" open={sections.needs} toggle={() => toggle('needs')}>
            <div className="space-y-4">
              <Field label="What do you need in your tee sheet?">
                <textarea rows={3} className={inp} value={form.teeSheetNeeds} onChange={e => set('teeSheetNeeds', e.target.value)} placeholder="e.g. online payments, member rates, staff logins, blackout dates..." />
              </Field>
              <Field label="Any special requests?">
                <textarea rows={3} className={inp} value={form.specialRequests} onChange={e => set('specialRequests', e.target.value)} placeholder="Anything specific we should know before we build your page..." />
              </Field>
            </div>
          </Section>

          {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm">{error}</div>}

          <button onClick={submit} disabled={submitting} className="w-full bg-pine hover:bg-pine-hover text-white py-4 rounded-md font-medium text-base disabled:opacity-50 transition-colors">
            {submitting ? 'Submitting...' : 'Submit Interest Form'}
          </button>
          <p className="text-center text-ink-muted text-xs pb-4">We review every submission and reach out within 1 business day. If it&apos;s a fit, we&apos;ll send a short follow-up sheet to confirm pricing, policies, and facilities before building your page.</p>
        </div>
      </div>
    </div>
  );
}
