'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Eye, EyeOff } from 'lucide-react';

interface CourseData {
  name: string;
  type: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  website: string;
  bookingUrl: string;
  description: string;
  holes: number;
  par: number;
  yardage: number;
  rating: number;
  slope: number;
  active: boolean;
}

const STATES = ['NJ','NY','CT','PA','MA','MD','VA','DE','RI','NH','VT','ME'];

export default function SettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState<CourseData>({
    name: '', type: 'public', city: '', state: 'NJ', address: '',
    phone: '', website: '', bookingUrl: '', description: '',
    holes: 18, par: 72, yardage: 6500, rating: 4.0, slope: 120, active: false,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/operator/courses').then(r => {
      if (r.status === 401) { router.push('/dashboard/login'); return null; }
      return r.json();
    }).then(data => {
      if (data) { setForm(f => ({ ...f, ...data })); setLoaded(true); }
    });
  }, [router]);

  const set = (k: keyof CourseData, v: string | number | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setMsg('');
    const res = await fetch('/api/operator/courses', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) setMsg('✅ Course info saved!');
    else setMsg('❌ Error saving — try again');
  };

  if (!loaded) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-500">Loading...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Course Settings</h1>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {msg && (
          <div className={`rounded-lg px-4 py-3 text-sm ${msg.startsWith('✅') ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            {msg}
          </div>
        )}

        {/* Visibility toggle */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">Course Visibility</div>
              <div className="text-sm text-gray-500 mt-0.5">
                {form.active ? 'Your course is live on Green Reserve' : 'Your course is hidden — fill in your details then go live'}
              </div>
            </div>
            <button
              onClick={() => set('active', !form.active)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                form.active
                  ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
                  : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'
              }`}
            >
              {form.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {form.active ? 'Live' : 'Hidden'}
            </button>
          </div>
        </div>

        {/* Basic Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Basic Info</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Course Name</label>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500">
                <option value="public">Public</option>
                <option value="semi-private">Semi-Private</option>
                <option value="private">Private</option>
                <option value="resort">Resort</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="(201) 555-0100"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input value={form.city} onChange={e => set('city', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <select value={form.state} onChange={e => set('state', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500">
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input value={form.address} onChange={e => set('address', e.target.value)}
                placeholder="123 Golf Rd"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input value={form.website} onChange={e => set('website', e.target.value)}
                placeholder="https://yourcourse.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Booking URL</label>
              <input value={form.bookingUrl} onChange={e => set('bookingUrl', e.target.value)}
                placeholder="https://yourcourse.com/book"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)}
                rows={3} placeholder="Tell golfers about your course..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
        </div>

        {/* Course Stats */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Course Stats</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Holes', key: 'holes' as const, placeholder: '18' },
              { label: 'Par', key: 'par' as const, placeholder: '72' },
              { label: 'Yardage', key: 'yardage' as const, placeholder: '6500' },
              { label: 'Course Rating', key: 'rating' as const, placeholder: '4.2' },
              { label: 'Slope', key: 'slope' as const, placeholder: '120' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type="number" value={form[key] as number} onChange={e => set(key, Number(e.target.value))}
                  placeholder={placeholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
              </div>
            ))}
          </div>
        </div>

        <button onClick={save} disabled={saving}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>
    </div>
  );
}
