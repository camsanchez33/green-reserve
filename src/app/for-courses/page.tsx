'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ChevronDown, ChevronUp, Calendar } from 'lucide-react';

const STATES = ['CT','DE','MA','MD','ME','NH','NJ','NY','PA','RI','VA','VT'];
const TITLE_OPTIONS = ['Owner / Operator', 'General Manager', 'Director of Golf', 'Head Golf Professional', 'Course Superintendent', 'Assistant Pro / Manager', 'Other'];
const COURSE_TYPES = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
  { value: 'resort', label: 'Resort' },
  { value: 'other', label: 'Other' },
];
const GUEST_POLICY_OPTIONS = ['Yes, regularly', 'Occasionally', 'No, members only'];
const ROUNDS_PER_DAY_OPTIONS = ['Under 50', '50–100', '100–150', '150+'];
const PUBLIC_CHALLENGE_OPTIONS = ['Reducing phone call volume', 'Reducing no-shows', 'Tracking real-time availability', 'Increasing online bookings', 'Other'];
const MULTI_COURSE_OPTIONS = ['Single course', 'Part of a multi-course property'];
const BUNDLED_OPTIONS = ['Always bundled with a room/stay', 'Sometimes bundled', 'Always booked separately'];

// Calendly link — swap this out once you have one
const CALENDLY_URL = 'https://calendly.com/greenreserve';

type FormData = {
  firstName: string; lastName: string;
  contactTitle: string; contactTitleOther: string;
  email: string; phone: string;
  courseName: string; address: string; city: string; state: string; zipCode: string; website: string;
  courseType: string; courseTypeOther: string;
  privateMemberCount: string; privateGuestPolicy: string;
  publicRoundsPerDay: string; publicChallenge: string;
  privateMemberOnlyWindows: string; privateOutsideEvents: string;
  resortMultiCourse: string; resortBundled: string; resortSeasonalPricing: string;
  otherNeeds: string;
  additionalNotes: string;
};

const init: FormData = {
  firstName: '', lastName: '',
  contactTitle: '', contactTitleOther: '',
  email: '', phone: '',
  courseName: '', address: '', city: '', state: 'NJ', zipCode: '', website: '',
  courseType: 'public', courseTypeOther: '',
  privateMemberCount: '', privateGuestPolicy: '',
  publicRoundsPerDay: '', publicChallenge: '',
  privateMemberOnlyWindows: '', privateOutsideEvents: '',
  resortMultiCourse: '', resortBundled: '', resortSeasonalPricing: '',
  otherNeeds: '',
  additionalNotes: '',
};

function Section({ title, open, toggle, children }: { title: string; open: boolean; toggle: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50">
        <span className="font-semibold text-gray-900">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-6 pb-6 border-t border-gray-100 pt-4">{children}</div>}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inp = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors";
const sel = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 bg-gray-50";

export default function ForCoursesPage() {
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
    if (form.courseType === 'public') {
      if (form.publicRoundsPerDay) needs['Rounds per day'] = form.publicRoundsPerDay;
      if (form.publicChallenge) needs['Biggest challenge'] = form.publicChallenge;
    } else if (form.courseType === 'private') {
      if (form.privateMemberCount) needs['Approx. members'] = form.privateMemberCount;
      if (form.privateGuestPolicy) needs['Guest / reciprocal play'] = form.privateGuestPolicy;
      if (form.privateMemberOnlyWindows) needs['Needs member-only booking windows'] = form.privateMemberOnlyWindows;
      if (form.privateOutsideEvents) needs['Hosts outings that block the tee sheet'] = form.privateOutsideEvents;
    } else if (form.courseType === 'resort') {
      if (form.resortMultiCourse) needs['Property type'] = form.resortMultiCourse;
      if (form.resortBundled) needs['Booking bundled with stay'] = form.resortBundled;
      if (form.resortSeasonalPricing) needs['Needs seasonal/demand pricing'] = form.resortSeasonalPricing;
    } else if (form.otherNeeds) {
      needs['What they need'] = form.otherNeeds;
    }

    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: form.firstName, lastName: form.lastName,
        contactTitle, email: form.email, phone: form.phone,
        courseName: form.courseName, address: form.address, city: form.city, state: form.state, zipCode: form.zipCode, website: form.website,
        courseType,
        needs,
        additionalNotes: form.additionalNotes,
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
    <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-10 max-w-lg w-full">
        <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-5" />
        <h1 className="text-2xl font-black text-gray-900 mb-1 text-center">Got it — we&apos;ll be in touch!</h1>
        <p className="text-gray-500 text-center mb-6 text-sm">
          We received the inquiry for <span className="font-semibold text-gray-800">{submittedData.courseName}</span>.
        </p>

        <div className="bg-gray-50 rounded-xl p-5 mb-6 space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">What happens next</div>
          <div className="flex gap-3 text-sm text-gray-700">
            <span className="text-green-500 font-bold shrink-0">1.</span>
            <span>We&apos;ll review your submission and call you at <span className="font-semibold">{submittedData.phone}</span> within 1 business day.</span>
          </div>
          <div className="flex gap-3 text-sm text-gray-700">
            <span className="text-green-500 font-bold shrink-0">2.</span>
            <span>If it&apos;s a good fit, we&apos;ll email you a short setup sheet to confirm your pricing, policies, and facilities.</span>
          </div>
          <div className="flex gap-3 text-sm text-gray-700">
            <span className="text-green-500 font-bold shrink-0">3.</span>
            <span>We build your booking page and send you login credentials — usually same day.</span>
          </div>
        </div>

        <a
          href={CALENDLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-[#1b4332] text-white py-3.5 rounded-xl font-bold hover:bg-[#2d6a4f] transition-colors mb-3"
        >
          <Calendar className="w-4 h-4" />
          Don&apos;t want to wait? Pick a time →
        </a>
        <p className="text-center text-xs text-gray-400 mb-4">Book a 15-min call at a time that works for you.</p>

        <button onClick={() => router.push('/')} className="w-full border border-gray-200 text-gray-500 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
          Back to GreenReserve
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a1f0f]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <span className="text-white font-black text-3xl">Green<span className="text-green-400">Reserve</span></span>
          <h1 className="text-white text-2xl font-black mt-4 mb-1">Get your course listed</h1>
          <p className="text-green-200/60 text-sm mb-1">Free to list. $0 per month. We charge golfers $1.50/player — not you.</p>
          <p className="text-white/30 text-xs">3 quick sections · under 3 minutes</p>
        </div>

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
                <Field label="State"><select className={sel} value={form.state} onChange={e => set('state', e.target.value)}>{STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
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

              {/* Private-specific follow-up */}
              {form.courseType === 'private' && (
                <div className="col-span-2 space-y-4 bg-violet-50 border border-violet-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">A few questions about your club</p>
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
              {form.courseType === 'public' && (
                <>
                  <Field label="About how many rounds do you host per day?">
                    <select className={sel} value={form.publicRoundsPerDay} onChange={e => set('publicRoundsPerDay', e.target.value)}>
                      <option value="">Select...</option>
                      {ROUNDS_PER_DAY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="What's the biggest reason you're looking for online booking?">
                    <select className={sel} value={form.publicChallenge} onChange={e => set('publicChallenge', e.target.value)}>
                      <option value="">Select...</option>
                      {PUBLIC_CHALLENGE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                </>
              )}

              {form.courseType === 'private' && (
                <>
                  <Field label="Do you need member-only booking windows before opening to guests?">
                    <select className={sel} value={form.privateMemberOnlyWindows} onChange={e => set('privateMemberOnlyWindows', e.target.value)}>
                      <option value="">Select...</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </Field>
                  <Field label="Do you regularly host outings or events that need to block off the tee sheet?">
                    <select className={sel} value={form.privateOutsideEvents} onChange={e => set('privateOutsideEvents', e.target.value)}>
                      <option value="">Select...</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </Field>
                </>
              )}

              {form.courseType === 'resort' && (
                <>
                  <Field label="Is this a single course or part of a multi-course property?">
                    <select className={sel} value={form.resortMultiCourse} onChange={e => set('resortMultiCourse', e.target.value)}>
                      <option value="">Select...</option>
                      {MULTI_COURSE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Do golfers typically book bundled with a room/stay, or separately?">
                    <select className={sel} value={form.resortBundled} onChange={e => set('resortBundled', e.target.value)}>
                      <option value="">Select...</option>
                      {BUNDLED_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Do you need seasonal or demand-based pricing?">
                    <select className={sel} value={form.resortSeasonalPricing} onChange={e => set('resortSeasonalPricing', e.target.value)}>
                      <option value="">Select...</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </Field>
                </>
              )}

              {form.courseType === 'other' && (
                <Field label="Tell us what your course needs from a tee sheet system">
                  <textarea rows={3} className={inp} value={form.otherNeeds} onChange={e => set('otherNeeds', e.target.value)} placeholder="What are you looking for?" />
                </Field>
              )}

              <Field label="Anything else we should know?">
                <textarea rows={3} className={inp} value={form.additionalNotes} onChange={e => set('additionalNotes', e.target.value)} placeholder="Special circumstances, questions, timeline..." />
              </Field>
            </div>
          </Section>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

          <button onClick={submit} disabled={submitting} className="w-full bg-green-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-green-700 disabled:opacity-50 transition-colors shadow-lg">
            {submitting ? 'Submitting...' : 'Submit Interest Form →'}
          </button>
          <p className="text-center text-green-200/40 text-xs pb-4">We review every submission and reach out within 1 business day. If it&apos;s a fit, we&apos;ll send a short follow-up sheet to confirm pricing, policies, and facilities before building your page.</p>
        </div>
      </div>
    </div>
  );
}
