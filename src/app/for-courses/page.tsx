'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ChevronDown, ChevronUp, Calendar } from 'lucide-react';

const STATES = ['CT','DE','MA','MD','ME','NH','NJ','NY','PA','RI','VA','VT'];
const BOOKING_METHODS = ['Phone only','Our own website','GolfNow','EZLinks','foreUp','Chronogolf','TeeItUp','Other'];

// Calendly link — swap this out once you have one
const CALENDLY_URL = 'https://calendly.com/greenreserve';

type FormData = {
  contactName: string; contactTitle: string; email: string; phone: string;
  courseName: string; address: string; city: string; state: string; zipCode: string; website: string;
  courseType: string; currentBookingMethod: string;
  lookingFor: string[]; additionalNotes: string;
};

const init: FormData = {
  contactName:'',contactTitle:'',email:'',phone:'',
  courseName:'',address:'',city:'',state:'NJ',zipCode:'',website:'',
  courseType:'public',currentBookingMethod:'',
  lookingFor:[],additionalNotes:'',
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

const GOALS = [
  'More online bookings',
  'Replace current software',
  'Tee sheet management',
  'Accept online payments',
  'Reduce phone calls',
];

export default function ForCoursesPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(init);
  const [sections, setSections] = useState({ contact: true, course: true, goals: true });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<{ courseName: string; phone: string } | null>(null);
  const [error, setError] = useState('');

  const set = (k: keyof FormData, v: string | string[]) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));
  const toggleGoal = (g: string) => set('lookingFor', form.lookingFor.includes(g) ? form.lookingFor.filter(x => x !== g) : [...form.lookingFor, g]);

  const submit = async () => {
    setSubmitting(true); setError('');
    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
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
          <p className="text-white/30 text-xs">3 quick sections · under 2 minutes</p>
        </div>

        <div className="space-y-3">

          {/* 1. Contact */}
          <Section title="1. Your contact info" open={sections.contact} toggle={() => toggle('contact')}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Your name" required><input className={inp} value={form.contactName} onChange={e => set('contactName', e.target.value)} placeholder="John Smith" /></Field>
              <Field label="Title / role" required><input className={inp} value={form.contactTitle} onChange={e => set('contactTitle', e.target.value)} placeholder="General Manager" /></Field>
              <Field label="Email" required><input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
              <Field label="Phone" required><input className={inp} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(201) 555-0100" /></Field>
            </div>
          </Section>

          {/* 2. Course info */}
          <Section title="2. Course info" open={sections.course} toggle={() => toggle('course')}>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><Field label="Course name" required><input className={inp} value={form.courseName} onChange={e => set('courseName', e.target.value)} /></Field></div>
              <div className="col-span-2"><Field label="Street address" required><input className={inp} value={form.address} onChange={e => set('address', e.target.value)} /></Field></div>
              <Field label="City" required><input className={inp} value={form.city} onChange={e => set('city', e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="State"><select className={sel} value={form.state} onChange={e => set('state', e.target.value)}>{STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
                <Field label="ZIP" required><input className={inp} value={form.zipCode} onChange={e => set('zipCode', e.target.value)} /></Field>
              </div>
              <Field label="Website"><input className={inp} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://" /></Field>
              <Field label="Course type" required>
                <select className={sel} value={form.courseType} onChange={e => set('courseType', e.target.value)}>
                  <option value="public">Public</option>
                  <option value="semi-private">Semi-private</option>
                  <option value="municipal">Municipal</option>
                  <option value="resort">Resort</option>
                </select>
              </Field>
              <Field label="How do you currently take bookings?" required>
                <select className={sel} value={form.currentBookingMethod} onChange={e => set('currentBookingMethod', e.target.value)}>
                  <option value="">Select...</option>
                  {BOOKING_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* 3. Goals */}
          <Section title="3. What are you looking for?" open={sections.goals} toggle={() => toggle('goals')}>
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Select all that apply.</p>
              <div className="flex flex-wrap gap-2">
                {GOALS.map(g => (
                  <button key={g} onClick={() => toggleGoal(g)} className={`text-sm px-4 py-2 rounded-xl border transition-colors ${form.lookingFor.includes(g) ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600 hover:border-green-400'}`}>{g}</button>
                ))}
              </div>
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
