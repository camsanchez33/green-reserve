'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

const STATES = ['CT','DE','MA','MD','ME','NH','NJ','NY','PA','RI','VA','VT'];
const BOOKING_METHODS = ['Phone only','Our own website','GolfNow','EZLinks','foreUp','Chronogolf','TeeItUp','Other'];
const FEE_RANGES = ['Under $40','$40–$70','$70–$100','$100–$150','$150+'];

type FormData = {
  contactName: string; contactTitle: string; email: string; phone: string;
  courseName: string; address: string; city: string; state: string; zipCode: string; website: string;
  courseType: string; currentBookingMethod: string; teeTimesPerDay: string; greenFeeRange: string;
  hasResidentPricing: boolean; residentCounty: string;
  hasMemberPricing: boolean;
  hasCaddies: boolean; caddieType: string;
  walkingPolicy: string; cartPolicy: string;
  dresscode: string[];
  cancellationHours: string; rainCheckPolicy: string;
  publicAdvanceDays: string; memberAdvanceDays: string;
  hasDrivingRange: boolean; hasPuttingGreen: boolean; hasShortGameArea: boolean;
  hasProShop: boolean; restaurantType: string; hasLessons: boolean;
  hasClubRental: boolean; hasBagStorage: boolean; hasGpsCarts: boolean; hasTournaments: boolean;
  pricingNotes: string; lookingFor: string[]; additionalNotes: string;
};

const init: FormData = {
  contactName:'',contactTitle:'',email:'',phone:'',
  courseName:'',address:'',city:'',state:'NJ',zipCode:'',website:'',
  courseType:'public',currentBookingMethod:'',teeTimesPerDay:'',greenFeeRange:'',
  hasResidentPricing:false,residentCounty:'',
  hasMemberPricing:false,
  hasCaddies:false,caddieType:'',
  walkingPolicy:'always',cartPolicy:'optional',
  dresscode:[],
  cancellationHours:'24',rainCheckPolicy:'',
  publicAdvanceDays:'7',memberAdvanceDays:'14',
  hasDrivingRange:false,hasPuttingGreen:false,hasShortGameArea:false,
  hasProShop:false,restaurantType:'none',hasLessons:false,
  hasClubRental:false,hasBagStorage:false,hasGpsCarts:false,hasTournaments:false,
  pricingNotes:'',lookingFor:[],additionalNotes:'',
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
  const [sections, setSections] = useState({ contact: true, course: true, booking: false, pricing: false, policies: false, facilities: false, goals: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof FormData, v: string | boolean | string[]) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));

  const toggleArr = (k: keyof FormData, v: string) => {
    const arr = form[k] as string[];
    set(k, arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  };

  const submit = async () => {
    setSubmitting(true); setError('');
    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, teeTimesPerDay: form.teeTimesPerDay ? Number(form.teeTimesPerDay) : null }),
    });
    setSubmitting(false);
    if (res.ok) setSubmitted(true);
    else { const d = await res.json(); setError(d.error || 'Something went wrong'); }
  };

  if (submitted) return (
    <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-black text-gray-900 mb-2">We've got it!</h1>
        <p className="text-gray-500 mb-6">We'll review your submission and reach out within 1–2 business days to get you set up.</p>
        <button onClick={() => router.push('/')} className="w-full bg-[#1b4332] text-white py-3 rounded-xl font-semibold hover:bg-[#2d6a4f]">Back to Green Reserve</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a1f0f]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <span className="text-white font-black text-3xl">Green<span className="text-green-400">Reserve</span></span>
          <h1 className="text-white text-2xl font-black mt-4 mb-2">Get your course listed</h1>
          <p className="text-green-200/60 text-sm">Free to list. $0 per month. We charge golfers $1.50/player — not you.</p>
        </div>

        <div className="space-y-3">
          <Section title="1. Your contact info" open={sections.contact} toggle={() => toggle('contact')}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Your name" required><input className={inp} value={form.contactName} onChange={e => set('contactName', e.target.value)} placeholder="John Smith" /></Field>
              <Field label="Title / role" required><input className={inp} value={form.contactTitle} onChange={e => set('contactTitle', e.target.value)} placeholder="General Manager" /></Field>
              <Field label="Email" required><input type="email" className={inp} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
              <Field label="Phone" required><input className={inp} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(201) 555-0100" /></Field>
            </div>
          </Section>

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
            </div>
          </Section>

          <Section title="3. Current booking setup" open={sections.booking} toggle={() => toggle('booking')}>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Field label="How do you currently take bookings?" required>
                  <select className={sel} value={form.currentBookingMethod} onChange={e => set('currentBookingMethod', e.target.value)}>
                    <option value="">Select...</option>
                    {BOOKING_METHODS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Approx. tee times per day"><input type="number" className={inp} value={form.teeTimesPerDay} onChange={e => set('teeTimesPerDay', e.target.value)} placeholder="70" /></Field>
              <Field label="Green fee range">
                <select className={sel} value={form.greenFeeRange} onChange={e => set('greenFeeRange', e.target.value)}>
                  <option value="">Select...</option>
                  {FEE_RANGES.map(r => <option key={r}>{r}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="4. Pricing structure" open={sections.pricing} toggle={() => toggle('pricing')}>
            <div className="space-y-5">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div><div className="text-sm font-medium text-gray-800">Resident / county pricing</div><div className="text-xs text-gray-500">Municipal courses with separate resident rates</div></div>
                <button onClick={() => set('hasResidentPricing', !form.hasResidentPricing)} className={`relative w-10 h-6 rounded-full transition-colors ${form.hasResidentPricing ? 'bg-green-600' : 'bg-gray-300'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${form.hasResidentPricing ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>
              {form.hasResidentPricing && <Field label="Resident county / town"><input className={inp} value={form.residentCounty} onChange={e => set('residentCounty', e.target.value)} placeholder="e.g. Bergen County, NJ" /></Field>}

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div><div className="text-sm font-medium text-gray-800">Member pricing</div><div className="text-xs text-gray-500">Members get discounted rates and earlier booking</div></div>
                <button onClick={() => set('hasMemberPricing', !form.hasMemberPricing)} className={`relative w-10 h-6 rounded-full transition-colors ${form.hasMemberPricing ? 'bg-green-600' : 'bg-gray-300'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${form.hasMemberPricing ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>

              <Field label="Pricing notes (rates, special rules, etc.)">
                <textarea rows={3} className={inp} value={form.pricingNotes} onChange={e => set('pricingNotes', e.target.value)} placeholder="e.g. Weekday $65, Weekend $85, Twilight after 3pm $45, Senior Mon–Fri $50..." />
              </Field>
            </div>
          </Section>

          <Section title="5. Policies &amp; access" open={sections.policies} toggle={() => toggle('policies')}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Walking policy">
                <select className={sel} value={form.walkingPolicy} onChange={e => set('walkingPolicy', e.target.value)}>
                  <option value="always">Always allowed</option>
                  <option value="weekday">Weekday only</option>
                  <option value="time-based">Time-based</option>
                  <option value="never">Cart required</option>
                </select>
              </Field>
              <Field label="Cart policy">
                <select className={sel} value={form.cartPolicy} onChange={e => set('cartPolicy', e.target.value)}>
                  <option value="optional">Optional</option>
                  <option value="required">Required always</option>
                  <option value="required-weekends">Required weekends</option>
                  <option value="included">Included in fee</option>
                </select>
              </Field>
              <Field label="Public advance booking (days)"><input type="number" className={inp} value={form.publicAdvanceDays} onChange={e => set('publicAdvanceDays', e.target.value)} /></Field>
              <Field label="Member advance booking (days)"><input type="number" className={inp} value={form.memberAdvanceDays} onChange={e => set('memberAdvanceDays', e.target.value)} /></Field>
              <Field label="Cancellation window (hours)"><input type="number" className={inp} value={form.cancellationHours} onChange={e => set('cancellationHours', e.target.value)} /></Field>
              <Field label="Dress code">
                <div className="flex flex-wrap gap-2 mt-1">
                  {['Collared shirt','No denim','Soft spikes','No shorts'].map(d => (
                    <button key={d} onClick={() => toggleArr('dresscode', d)} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${form.dresscode.includes(d) ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600 hover:border-green-400'}`}>{d}</button>
                  ))}
                </div>
              </Field>
              <div className="col-span-2">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div><div className="text-sm font-medium text-gray-800">Caddies available</div></div>
                  <button onClick={() => set('hasCaddies', !form.hasCaddies)} className={`relative w-10 h-6 rounded-full transition-colors ${form.hasCaddies ? 'bg-green-600' : 'bg-gray-300'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${form.hasCaddies ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
              {form.hasCaddies && (
                <div className="col-span-2">
                  <Field label="Caddie type">
                    <select className={sel} value={form.caddieType} onChange={e => set('caddieType', e.target.value)}>
                      <option value="">Select...</option>
                      <option value="looper">Looper</option>
                      <option value="forecaddie">Forecaddie</option>
                      <option value="both">Both</option>
                    </select>
                  </Field>
                </div>
              )}
            </div>
          </Section>

          <Section title="6. Facilities" open={sections.facilities} toggle={() => toggle('facilities')}>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'hasDrivingRange', label: 'Driving range' },
                { key: 'hasPuttingGreen', label: 'Putting green' },
                { key: 'hasShortGameArea', label: 'Short game area' },
                { key: 'hasProShop', label: 'Pro shop' },
                { key: 'hasLessons', label: 'Lessons (PGA pro)' },
                { key: 'hasClubRental', label: 'Club rental' },
                { key: 'hasBagStorage', label: 'Bag storage' },
                { key: 'hasGpsCarts', label: 'GPS carts' },
                { key: 'hasTournaments', label: 'Tournament hosting' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-700">{label}</span>
                  <button onClick={() => set(key as keyof FormData, !form[key as keyof FormData])} className={`relative w-10 h-6 rounded-full transition-colors ${form[key as keyof FormData] ? 'bg-green-600' : 'bg-gray-300'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${form[key as keyof FormData] ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
              <div className="col-span-2">
                <Field label="Restaurant / food">
                  <select className={sel} value={form.restaurantType} onChange={e => set('restaurantType', e.target.value)}>
                    <option value="none">None</option>
                    <option value="snack-bar">Snack bar</option>
                    <option value="bar">Bar only</option>
                    <option value="full">Full restaurant</option>
                  </select>
                </Field>
              </div>
            </div>
          </Section>

          <Section title="7. What are you looking for?" open={sections.goals} toggle={() => toggle('goals')}>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {['More online bookings','Replace current software','Tee sheet management','Member management','Both tee sheet + bookings'].map(g => (
                  <button key={g} onClick={() => toggleArr('lookingFor', g)} className={`text-sm px-4 py-2 rounded-xl border transition-colors ${form.lookingFor.includes(g) ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600 hover:border-green-400'}`}>{g}</button>
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
          <p className="text-center text-green-200/40 text-xs pb-4">We review every submission and reach out within 1–2 business days.</p>
        </div>
      </div>
    </div>
  );
}
