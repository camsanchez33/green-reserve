'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

const STATES = ['CT','DE','MA','MD','ME','NH','NJ','NY','PA','RI','VA','VT'];
const DRESSCODE_OPTIONS = ['Collared shirt required','No denim','No metal spikes','Soft spikes only','No tank tops'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

type ScheduleData = {
  daysOfWeek: number[];
  startTime: string; endTime: string; intervalMinutes: number;
  greenFeeWeekday: string; greenFeeWeekend: string; cartFee: string;
  memberRateWeekday: string; memberRateWeekend: string;
  residentRateWeekday: string; residentRateWeekend: string;
  walkingAllowed: boolean;
};

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
  pricingNotes: string;
  schedule: ScheduleData;
  // Type-specific follow-up — label/relevance depends on courseType
  guestFee: string; reciprocalPolicy: string; memberPriorityNote: string;
  hotelGuestRate: string; stayAndPlayNote: string;
  typeSpecificNotes: string;
};

const initSchedule: ScheduleData = {
  daysOfWeek: [],
  startTime: '06:00', endTime: '18:00', intervalMinutes: 8,
  greenFeeWeekday: '', greenFeeWeekend: '', cartFee: '',
  memberRateWeekday: '', memberRateWeekend: '',
  residentRateWeekday: '', residentRateWeekend: '',
  walkingAllowed: true,
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
  pricingNotes: '',
  schedule: initSchedule,
  guestFee: '', reciprocalPolicy: '', memberPriorityNote: '',
  hotelGuestRate: '', stayAndPlayNote: '',
  typeSpecificNotes: '',
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
  const [courseType, setCourseType] = useState('public');
  const [needs, setNeeds] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Details>(init);
  const [sections, setSections] = useState({ pricing: true, schedule: true, typeSpecific: true, policies: false, facilities: false });
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
        setCourseType(d.courseType || 'public');
        setNeeds(d.needs || {});
        setForm(f => ({
          ...f,
          // Sensible defaults from the inquiry, before any saved-draft details override them
          hasMemberPricing: d.courseType === 'private' ? true : !!d.hasMemberPricing,
          hasResidentPricing: !!d.hasResidentPricing,
          hasCaddies: !!d.hasCaddies,
          ...(d.details || {}),
          schedule: { ...initSchedule, ...((d.details || {}).schedule || {}) },
        }));
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const set = <K extends keyof Details>(k: K, v: Details[K]) => setForm(f => ({ ...f, [k]: v }));
  const setSchedule = <K extends keyof ScheduleData>(k: K, v: ScheduleData[K]) => setForm(f => ({ ...f, schedule: { ...f.schedule, [k]: v } }));
  const toggleScheduleDay = (d: number) => setSchedule('daysOfWeek', form.schedule.daysOfWeek.includes(d) ? form.schedule.daysOfWeek.filter(x => x !== d) : [...form.schedule.daysOfWeek, d]);
  const toggleSection = (s: keyof typeof sections) => setSections(p => ({ ...p, [s]: !p[s] }));
  const toggleDress = (d: string) => set('dresscode', form.dresscode.includes(d) ? form.dresscode.filter(x => x !== d) : [...form.dresscode, d]);

  const validate = () => {
    const s = form.schedule;
    if (s.greenFeeWeekday === '' || s.greenFeeWeekend === '') return 'Please fill in your weekday and weekend green fees in section 2 (Your tee sheet schedule).';
    if (!s.startTime || !s.endTime) return 'Please set your first and last tee time in section 2 (Your tee sheet schedule).';
    if (form.hasMemberPricing && (s.memberRateWeekday === '' || s.memberRateWeekend === '')) return 'You said you offer member pricing — please fill in your member rates in section 2.';
    if (form.hasResidentPricing && (s.residentRateWeekday === '' || s.residentRateWeekend === '')) return 'You said you offer resident pricing — please fill in your resident rates in section 2.';
    return '';
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      setSubmitError(validationError);
      setSections(p => ({ ...p, schedule: true }));
      return;
    }
    setSubmitting(true); setSubmitError('');
    const res = await fetch('/api/inquiries/details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token, ...form,
        cancellationHours: Number(form.cancellationHours),
        publicAdvanceDays: Number(form.publicAdvanceDays),
        memberAdvanceDays: Number(form.memberAdvanceDays),
      }),
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
          We&apos;ll build {courseName}&apos;s booking page with these details — including your tee sheet schedule — and email your login shortly.
          From there you&apos;ll be able to fine-tune everything before going live.
        </p>
      </div>
    </div>
  );

  const needsEntries = Object.entries(needs).filter(([, v]) => v);

  return (
    <div className="min-h-screen bg-[#0a1f0f]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-6">
          <span className="text-white font-black text-3xl">Green<span className="text-green-400">Reserve</span></span>
          <h1 className="text-white text-2xl font-black mt-4 mb-1">Setup sheet for {courseName}</h1>
          <p className="text-green-200/60 text-sm">A few more details so we build your tee sheet right the first time.</p>
        </div>

        {needsEntries.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 mb-6">
            <div className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">From your inquiry</div>
            <div className="space-y-1">
              {needsEntries.map(([k, v]) => (
                <div key={k} className="text-sm text-white/70"><span className="text-white/40">{k}:</span> {v}</div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">

          {/* Pricing structure — comes first since the schedule section below depends on these toggles */}
          <Section title="1. Pricing structure" open={sections.pricing} toggle={() => toggleSection('pricing')}>
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

          {/* Your Tee Sheet — the structured schedule data that actually builds your bookable tee times */}
          <Section title="2. Your tee sheet schedule" open={sections.schedule} toggle={() => toggleSection('schedule')}>
            <p className="text-xs text-gray-400 -mt-2">This is what we use to generate your first batch of bookable tee times. You can adjust it anytime once you&apos;re live.</p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Days open <span className="text-gray-400 font-normal">(leave blank for every day)</span></label>
              <div className="flex gap-1.5">
                {DAYS.map((day, i) => (
                  <button key={day} onClick={() => toggleScheduleDay(i)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${form.schedule.daysOfWeek.includes(i) ? 'bg-green-600 text-white border-green-600' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-green-400'}`}>{day}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="First tee time"><input type="time" className={inp} value={form.schedule.startTime} onChange={e => setSchedule('startTime', e.target.value)} /></Field>
              <Field label="Last tee time"><input type="time" className={inp} value={form.schedule.endTime} onChange={e => setSchedule('endTime', e.target.value)} /></Field>
              <Field label="Interval">
                <select className={sel} value={form.schedule.intervalMinutes} onChange={e => setSchedule('intervalMinutes', Number(e.target.value))}>
                  {[7,8,9,10,12,15].map(v => <option key={v} value={v}>{v} min</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Green fee — weekday ($)"><input type="number" className={inp} value={form.schedule.greenFeeWeekday} onChange={e => setSchedule('greenFeeWeekday', e.target.value)} placeholder="65" /></Field>
              <Field label="Green fee — weekend ($)"><input type="number" className={inp} value={form.schedule.greenFeeWeekend} onChange={e => setSchedule('greenFeeWeekend', e.target.value)} placeholder="85" /></Field>
              <Field label="Cart fee ($)"><input type="number" className={inp} value={form.schedule.cartFee} onChange={e => setSchedule('cartFee', e.target.value)} placeholder="18" /></Field>
            </div>
            {form.hasMemberPricing && (
              <div className="grid grid-cols-2 gap-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
                <Field label="Member rate — weekday ($)"><input type="number" className={inp} value={form.schedule.memberRateWeekday} onChange={e => setSchedule('memberRateWeekday', e.target.value)} /></Field>
                <Field label="Member rate — weekend ($)"><input type="number" className={inp} value={form.schedule.memberRateWeekend} onChange={e => setSchedule('memberRateWeekend', e.target.value)} /></Field>
              </div>
            )}
            {form.hasResidentPricing && (
              <div className="grid grid-cols-2 gap-4 bg-purple-50 border border-purple-100 rounded-xl p-4">
                <Field label="Resident rate — weekday ($)"><input type="number" className={inp} value={form.schedule.residentRateWeekday} onChange={e => setSchedule('residentRateWeekday', e.target.value)} /></Field>
                <Field label="Resident rate — weekend ($)"><input type="number" className={inp} value={form.schedule.residentRateWeekend} onChange={e => setSchedule('residentRateWeekend', e.target.value)} /></Field>
              </div>
            )}
            <Toggle label="Walking allowed on this schedule" checked={form.schedule.walkingAllowed} onChange={v => setSchedule('walkingAllowed', v)} />
          </Section>

          {/* Type-specific follow-up */}
          {courseType === 'private' && (
            <Section title="3. Membership details" open={sections.typeSpecific} toggle={() => toggleSection('typeSpecific')}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Guest fee ($, if applicable)"><input type="number" className={inp} value={form.guestFee} onChange={e => set('guestFee', e.target.value)} /></Field>
                <Field label="Reciprocal club fee ($, if applicable)"><input type="number" className={inp} value={form.reciprocalPolicy} onChange={e => set('reciprocalPolicy', e.target.value)} /></Field>
              </div>
              <Field label="Member-only tee time windows (e.g. weekday mornings before 11am)"><textarea rows={2} className={inp} value={form.memberPriorityNote} onChange={e => set('memberPriorityNote', e.target.value)} /></Field>
            </Section>
          )}
          {courseType === 'resort' && (
            <Section title="3. Stay & play details" open={sections.typeSpecific} toggle={() => toggleSection('typeSpecific')}>
              <Field label="Hotel/resort guest rate ($, if different from public rate)"><input type="number" className={inp} value={form.hotelGuestRate} onChange={e => set('hotelGuestRate', e.target.value)} /></Field>
              <Field label="Do hotel guests get priority booking windows?"><textarea rows={2} className={inp} value={form.stayAndPlayNote} onChange={e => set('stayAndPlayNote', e.target.value)} /></Field>
            </Section>
          )}
          {(courseType === 'other') && (
            <Section title="3. Anything else unique about your course?" open={sections.typeSpecific} toggle={() => toggleSection('typeSpecific')}>
              <Field label="Tell us more"><textarea rows={3} className={inp} value={form.typeSpecificNotes} onChange={e => set('typeSpecificNotes', e.target.value)} /></Field>
            </Section>
          )}

          <Section title="4. Policies" open={sections.policies} toggle={() => toggleSection('policies')}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Walking allowed">
                <select className={sel} value={form.walkingAllowed} onChange={e => set('walkingAllowed', e.target.value)}>
                  <option value="always">Always</option>
                  <option value="weekdays">Weekdays only</option>
                  <option value="after12">After 12pm only</option>
                  <option value="never">Cart required</option>
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

          <Section title="5. Facilities" open={sections.facilities} toggle={() => toggleSection('facilities')}>
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
