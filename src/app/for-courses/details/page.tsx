'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

const STATES = ['CT','DE','MA','MD','ME','NH','NJ','NY','PA','RI','VA','VT'];
const DRESSCODE_OPTIONS = ['Collared shirt required','No denim','No metal spikes','Soft spikes only','No tank tops'];

type Details = {
  walkingAllowed: string; cartRequired: boolean;
  dresscode: string[];
  cancellationHours: number; rainCheckPolicy: string;
  publicAdvanceDays: number; memberAdvanceDays: number;
  hasMemberPricing: boolean; hasResidentPricing: boolean; residentCounty: string; residentState: string;
  hasCaddies: boolean; caddieType: string;
  hasDrivingRange: boolean; hasPuttingGreen: boolean; hasShortGameArea: boolean; hasProShop: boolean;
  restaurantType: string; hasLessons: boolean; hasClubRental: boolean; hasBagStorage: boolean;
  hasGpsCarts: boolean; hasTournaments: boolean;
  teeTimesPerDay: string; greenFeeRange: string; pricingNotes: string;
};

const init: Details = {
  walkingAllowed: 'always', cartRequired: false,
  dresscode: [],
  cancellationHours: 24, rainCheckPolicy: '',
  publicAdvanceDays: 7, memberAdvanceDays: 14,
  hasMemberPricing: false, hasResidentPricing: false, residentCounty: '', residentState: 'NJ',
  hasCaddies: false, caddieType: '',
  hasDrivingRange: false, hasPuttingGreen: false, hasShortGameArea: false, hasProShop: false,
  restaurantType: 'none', hasLessons: false, hasClubRental: false, hasBagStorage: false,
  hasGpsCarts: false, hasTournaments: false,
  teeTimesPerDay: '', greenFeeRange: '', pricingNotes: '',
};

function Section({ title, open, toggle, children }: { title: string; open: boolean; toggle: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50">
        <span className="font-semibold text-gray-900">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-6 pb-6 border-t border-gray-100 pt-4 space-y-4">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inp = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors";
const sel = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 bg-gray-50";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`text-sm px-4 py-2 rounded-xl border transition-colors text-left ${checked ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600 hover:border-green-400'}`}
    >
      {checked ? '✓ ' : ''}{label}
    </button>
  );
}

function DetailsForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [courseName, setCourseName] = useState('');
  const [form, setForm] = useState<Details>(init);
  const [sections, setSections] = useState({ booking: true, pricing: true, policies: true, facilities: true });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) { setLoadError('Missing setup link token.'); setLoading(false); return; }
    fetch(`/api/inquiries/details?token=${encodeURIComponent(token)}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Could not load this setup sheet.');
        return d;
      })
      .then(d => {
        setCourseName(d.courseName);
        setForm(f => ({ ...f, ...d.details }));
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const set = <K extends keyof Details>(k: K, v: Details[K]) => setForm(f => ({ ...f, [k]: v }));
  const toggleSection = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));
  const toggleDress = (d: string) => set('dresscode', form.dresscode.includes(d) ? form.dresscode.filter(x => x !== d) : [...form.dresscode, d]);

  const submit = async () => {
    setSubmitting(true); setSubmitError('');
    const res = await fetch('/api/inquiries/details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...form, cancellationHours: Number(form.cancellationHours), publicAdvanceDays: Number(form.publicAdvanceDays), memberAdvanceDays: Number(form.memberAdvanceDays) }),
    });
    setSubmitting(false);
    if (res.ok) setSubmitted(true);
    else {
      const d = await res.json();
      setSubmitError(d.error || 'Something went wrong');
    }
  };

  if (loading) return <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center text-white/60 text-sm">Loading...</div>;

  if (loadError) return (
    <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">Can&apos;t load this link</h1>
        <p className="text-gray-500 text-sm">{loadError}</p>
        <p className="text-gray-400 text-xs mt-4">If you think this is a mistake, reply to the email we sent you.</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-10 max-w-lg w-full text-center">
        <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-5" />
        <h1 className="text-2xl font-black text-gray-900 mb-2">Thanks — we&apos;ve got it.</h1>
        <p className="text-gray-500 text-sm">
          We&apos;ll build {courseName}&apos;s booking page with these details and email your login shortly.
          From there you&apos;ll be able to set up your own tee sheet before going live.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a1f0f]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <span className="text-white font-black text-3xl">Green<span className="text-green-400">Reserve</span></span>
          <h1 className="text-white text-2xl font-black mt-4 mb-1">Setup sheet for {courseName}</h1>
          <p className="text-green-200/60 text-sm">A few more details so we build your page right the first time.</p>
        </div>

        <div className="space-y-3">
          <Section title="1. Booking volume & pricing" open={sections.booking} toggle={() => toggleSection('booking')}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Approx. tee times per day"><input className={inp} value={form.teeTimesPerDay} onChange={e => set('teeTimesPerDay', e.target.value)} placeholder="e.g. 80" /></Field>
              <Field label="Green fee range"><input className={inp} value={form.greenFeeRange} onChange={e => set('greenFeeRange', e.target.value)} placeholder="$35–$75" /></Field>
            </div>
          </Section>

          <Section title="2. Member & resident pricing" open={sections.pricing} toggle={() => toggleSection('pricing')}>
            <div className="flex flex-wrap gap-2">
              <Toggle label="We offer member pricing" checked={form.hasMemberPricing} onChange={v => set('hasMemberPricing', v)} />
              <Toggle label="We offer resident pricing" checked={form.hasResidentPricing} onChange={v => set('hasResidentPricing', v)} />
              <Toggle label="We have caddies" checked={form.hasCaddies} onChange={v => set('hasCaddies', v)} />
            </div>
            {form.hasResidentPricing && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Resident county"><input className={inp} value={form.residentCounty} onChange={e => set('residentCounty', e.target.value)} /></Field>
                <Field label="Resident state"><select className={sel} value={form.residentState} onChange={e => set('residentState', e.target.value)}>{STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
              </div>
            )}
            {form.hasCaddies && (
              <Field label="Caddie type"><input className={inp} value={form.caddieType} onChange={e => set('caddieType', e.target.value)} placeholder="e.g. Looper, Forecaddie" /></Field>
            )}
            <Field label="Anything else about pricing?"><textarea rows={2} className={inp} value={form.pricingNotes} onChange={e => set('pricingNotes', e.target.value)} /></Field>
          </Section>

          <Section title="3. Policies" open={sections.policies} toggle={() => toggleSection('policies')}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Walking allowed">
                <select className={sel} value={form.walkingAllowed} onChange={e => set('walkingAllowed', e.target.value)}>
                  <option value="always">Always</option>
                  <option value="offpeak">Off-peak only</option>
                  <option value="never">Never</option>
                </select>
              </Field>
              <Field label="Carts required?">
                <select className={sel} value={form.cartRequired ? 'yes' : 'no'} onChange={e => set('cartRequired', e.target.value === 'yes')}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Field>
              <Field label="Cancellation window (hours)"><input type="number" className={inp} value={form.cancellationHours} onChange={e => set('cancellationHours', Number(e.target.value))} /></Field>
              <Field label="Public advance booking (days)"><input type="number" className={inp} value={form.publicAdvanceDays} onChange={e => set('publicAdvanceDays', Number(e.target.value))} /></Field>
              <Field label="Member advance booking (days)"><input type="number" className={inp} value={form.memberAdvanceDays} onChange={e => set('memberAdvanceDays', Number(e.target.value))} /></Field>
            </div>
            <Field label="Rain check policy"><textarea rows={2} className={inp} value={form.rainCheckPolicy} onChange={e => set('rainCheckPolicy', e.target.value)} /></Field>
            <Field label="Dress code">
              <div className="flex flex-wrap gap-2">
                {DRESSCODE_OPTIONS.map(d => <Toggle key={d} label={d} checked={form.dresscode.includes(d)} onChange={() => toggleDress(d)} />)}
              </div>
            </Field>
          </Section>

          <Section title="4. Facilities" open={sections.facilities} toggle={() => toggleSection('facilities')}>
            <div className="flex flex-wrap gap-2">
              <Toggle label="Driving range" checked={form.hasDrivingRange} onChange={v => set('hasDrivingRange', v)} />
              <Toggle label="Putting green" checked={form.hasPuttingGreen} onChange={v => set('hasPuttingGreen', v)} />
              <Toggle label="Short game area" checked={form.hasShortGameArea} onChange={v => set('hasShortGameArea', v)} />
              <Toggle label="Pro shop" checked={form.hasProShop} onChange={v => set('hasProShop', v)} />
              <Toggle label="Lessons available" checked={form.hasLessons} onChange={v => set('hasLessons', v)} />
              <Toggle label="Club rental" checked={form.hasClubRental} onChange={v => set('hasClubRental', v)} />
              <Toggle label="Bag storage" checked={form.hasBagStorage} onChange={v => set('hasBagStorage', v)} />
              <Toggle label="GPS carts" checked={form.hasGpsCarts} onChange={v => set('hasGpsCarts', v)} />
              <Toggle label="Hosts tournaments" checked={form.hasTournaments} onChange={v => set('hasTournaments', v)} />
            </div>
            <Field label="Restaurant / food service">
              <select className={sel} value={form.restaurantType} onChange={e => set('restaurantType', e.target.value)}>
                <option value="none">None</option>
                <option value="snack-bar">Snack bar</option>
                <option value="grill">Grill</option>
                <option value="full-restaurant">Full restaurant</option>
              </select>
            </Field>
          </Section>

          {submitError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{submitError}</div>}

          <button onClick={submit} disabled={submitting} className="w-full bg-green-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-green-700 disabled:opacity-50 transition-colors shadow-lg">
            {submitting ? 'Submitting...' : 'Submit Setup Sheet →'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DetailsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a1f0f]" />}>
      <DetailsForm />
    </Suspense>
  );
}
