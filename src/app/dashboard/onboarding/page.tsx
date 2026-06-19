'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ChevronRight, MapPin, Phone, Globe, Clock, Loader2 } from 'lucide-react';

const STEPS = ['Course Details', 'Tee Sheet Setup', 'Go Live'];
const STATES = ['NJ','NY','CT','PA','MA','MD','VA','DE','RI','NH','VT','ME'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Course details form
  const [details, setDetails] = useState({
    name: '', type: 'public', address: '', city: '', state: 'NJ', zipCode: '',
    phone: '', website: '', description: '', holes: 18, par: 72, yardage: 6500,
  });

  // Schedule form
  const [schedule, setSchedule] = useState({
    daysOfWeek: [] as number[],
    startTime: '06:30', endTime: '17:30',
    intervalMinutes: 8,
    greenFeeWeekday: 65, greenFeeWeekend: 85,
    cartFee: 18, walkingAllowed: true,
  });

  useEffect(() => {
    fetch('/api/operator/profile').then(r => {
      if (r.status === 401) { router.push('/dashboard/login'); return null; }
      return r.json();
    }).then(data => {
      if (!data) return;
      if (!data.emailVerified) { router.push('/dashboard/verify'); return; }
      if (data.onboardingStep >= 3) { router.push('/dashboard'); return; }
      setStep(data.onboardingStep >= 2 ? 2 : 1);
      setLoading(false);
    });
    // Pre-fill course name
    fetch('/api/operator/courses').then(r => r.json()).then(c => {
      if (c?.name) setDetails(d => ({ ...d, name: c.name, ...c }));
    });
  }, [router]);

  const set = (k: string, v: string | number | boolean) =>
    setDetails(d => ({ ...d, [k]: v }));

  const toggleDay = (d: number) =>
    setSchedule(s => ({
      ...s,
      daysOfWeek: s.daysOfWeek.includes(d)
        ? s.daysOfWeek.filter(x => x !== d)
        : [...s.daysOfWeek, d],
    }));

  const validateDetails = () => {
    const e: Record<string, string> = {};
    if (!details.name.trim()) e.name = 'Required';
    if (!details.address.trim()) e.address = 'Required';
    if (!details.city.trim()) e.city = 'Required';
    if (!details.zipCode.trim()) e.zipCode = 'Required';
    if (!details.phone.trim()) e.phone = 'Required';
    if (!details.description.trim()) e.description = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveDetails = async () => {
    if (!validateDetails()) return;
    setSaving(true);
    await fetch('/api/operator/courses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(details),
    });
    await fetch('/api/operator/profile', { method: 'PATCH' });
    setSaving(false);
    setStep(2);
  };

  const saveSchedule = async () => {
    setSaving(true);
    await fetch('/api/operator/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schedule),
    });
    // Mark onboarding complete — do NOT auto-activate; admin sets live status
    await fetch('/api/operator/onboarding-complete', { method: 'POST' });
    setSaving(false);
    setStep(3);
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-white animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a1f0f] p-4">
      <div className="max-w-xl mx-auto pt-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-white font-black text-2xl tracking-tight">Green<span className="text-green-400">Reserve</span></span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 ${i + 1 <= step ? 'text-green-400' : 'text-white/30'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
                  i + 1 < step ? 'bg-green-500 border-green-500 text-white' :
                  i + 1 === step ? 'border-green-400 text-green-400' :
                  'border-white/20 text-white/30'
                }`}>
                  {i + 1 < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                <span className="text-sm font-medium hidden sm:block">{label}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-white/20" />}
            </div>
          ))}
        </div>

        {/* Step 1 — Course Details */}
        {step === 1 && (
          <div className="bg-white rounded-2xl p-6 shadow-2xl">
            <h2 className="text-xl font-black text-gray-900 mb-1">Tell us about your course</h2>
            <p className="text-gray-500 text-sm mb-6">This info appears on your public listing. All fields are required.</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Course Name *</label>
                  <input value={details.name} onChange={e => set('name', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Type</label>
                  <select value={details.type} onChange={e => set('type', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500">
                    <option value="public">Public</option>
                    <option value="semi-private">Semi-Private</option>
                    <option value="resort">Resort</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide flex items-center gap-1"><Phone className="w-3 h-3" /> Phone *</label>
                  <input value={details.phone} onChange={e => set('phone', e.target.value)}
                    placeholder="(201) 555-0100"
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 ${errors.phone ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide flex items-center gap-1"><MapPin className="w-3 h-3" /> Street Address *</label>
                  <input value={details.address} onChange={e => set('address', e.target.value)}
                    placeholder="123 Fairway Dr"
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 ${errors.address ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                  {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">City *</label>
                  <input value={details.city} onChange={e => set('city', e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 ${errors.city ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                  {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">State</label>
                    <select value={details.state} onChange={e => set('state', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500">
                      {STATES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">ZIP *</label>
                    <input value={details.zipCode} onChange={e => set('zipCode', e.target.value)}
                      placeholder="07430"
                      className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 ${errors.zipCode ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide flex items-center gap-1"><Globe className="w-3 h-3" /> Website</label>
                  <input value={details.website} onChange={e => set('website', e.target.value)}
                    placeholder="https://yourcourse.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Description *</label>
                  <textarea value={details.description} onChange={e => set('description', e.target.value)}
                    rows={3} placeholder="Tell golfers what makes your course special..."
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 resize-none ${errors.description ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                  {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Holes</label>
                  <select value={details.holes} onChange={e => set('holes', Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500">
                    <option value={9}>9</option>
                    <option value={18}>18</option>
                    <option value={27}>27</option>
                    <option value={36}>36</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Par</label>
                  <input type="number" value={details.par} onChange={e => set('par', Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Yardage (back tees)</label>
                  <input type="number" value={details.yardage} onChange={e => set('yardage', Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
            </div>

            <button onClick={saveDetails} disabled={saving}
              className="w-full mt-6 bg-green-600 text-white py-3.5 rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <>Continue <ChevronRight className="w-4 h-4" /></>}
            </button>
          </div>
        )}

        {/* Step 2 — Schedule */}
        {step === 2 && (
          <div className="bg-white rounded-2xl p-6 shadow-2xl">
            <h2 className="text-xl font-black text-gray-900 mb-1 flex items-center gap-2">
              <Clock className="w-5 h-5 text-green-600" /> Set your tee sheet
            </h2>
            <p className="text-gray-500 text-sm mb-6">Set your schedule once — tee times auto-generate daily.</p>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Open days <span className="font-normal text-gray-400">(leave blank = every day)</span></label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map((day, i) => (
                    <button key={day} onClick={() => toggleDay(i)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        schedule.daysOfWeek.includes(i)
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
                      }`}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">First Tee</label>
                  <input type="time" value={schedule.startTime}
                    onChange={e => setSchedule(s => ({ ...s, startTime: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Last Tee</label>
                  <input type="time" value={schedule.endTime}
                    onChange={e => setSchedule(s => ({ ...s, endTime: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Interval</label>
                  <select value={schedule.intervalMinutes}
                    onChange={e => setSchedule(s => ({ ...s, intervalMinutes: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500">
                    {[7,8,9,10,12,15].map(v => <option key={v} value={v}>{v} min</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Weekday $</label>
                  <input type="number" value={schedule.greenFeeWeekday}
                    onChange={e => setSchedule(s => ({ ...s, greenFeeWeekday: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Weekend $</label>
                  <input type="number" value={schedule.greenFeeWeekend}
                    onChange={e => setSchedule(s => ({ ...s, greenFeeWeekend: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Cart Fee $</label>
                  <input type="number" value={schedule.cartFee}
                    onChange={e => setSchedule(s => ({ ...s, cartFee: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500" />
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <input type="checkbox" id="walking" checked={schedule.walkingAllowed}
                  onChange={e => setSchedule(s => ({ ...s, walkingAllowed: e.target.checked }))}
                  className="w-4 h-4 text-green-600 rounded" />
                <label htmlFor="walking" className="text-sm text-gray-700">Walking allowed</label>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
                Based on your settings, your tee sheet will have approximately{' '}
                <strong>{Math.floor((parseInt(schedule.endTime) - parseInt(schedule.startTime)) * 60 / schedule.intervalMinutes) || '~70'}</strong> tee times per day,
                auto-generated every morning.
              </div>
            </div>

            <button onClick={saveSchedule} disabled={saving}
              className="w-full mt-6 bg-green-600 text-white py-3.5 rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Launching...</> : '🚀 Launch My Course'}
            </button>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && (
          <div className="bg-white rounded-2xl p-10 shadow-2xl text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Setup complete!</h2>
            <p className="text-gray-500 mb-2">Your tee sheet is configured and ready. GreenReserve will review everything and take your course live — usually within 1 business day.</p>
            <p className="text-sm text-gray-400 mb-6">We'll email you at {` `}<span className="font-medium text-gray-600">hello@greenreserve.app</span> once you're live.</p>
            <button onClick={() => router.push('/dashboard')}
              className="w-full bg-green-600 text-white py-3.5 rounded-xl font-bold hover:bg-green-700">
              Go to Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
