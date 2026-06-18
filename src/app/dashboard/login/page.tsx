'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', courseName: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true);
    setError('');
    const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Something went wrong'); return; }
    if (mode === 'register') {
      router.push('/dashboard/verify');
    } else {
      router.push(data.redirect || '/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-white font-black text-3xl tracking-tight">
            Green<span className="text-green-400">Reserve</span>
          </span>
          <p className="text-green-200/60 text-sm mt-2">Course Operator Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Tab switcher */}
          <div className="flex">
            <button onClick={() => setMode('login')}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${mode === 'login' ? 'bg-white text-gray-900 border-b-2 border-green-600' : 'bg-gray-50 text-gray-500 hover:text-gray-700'}`}>
              Sign In
            </button>
            <button onClick={() => setMode('register')}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${mode === 'register' ? 'bg-white text-gray-900 border-b-2 border-green-600' : 'bg-gray-50 text-gray-500 hover:text-gray-700'}`}>
              Get Listed
            </button>
          </div>

          <div className="p-8 space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Your Name</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="John Smith"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Course Name</label>
                  <input value={form.courseName} onChange={e => set('courseName', e.target.value)}
                    placeholder="Skyview Golf Club"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors" />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="you@course.com"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Password</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors" />
            </div>

            {error && <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <button onClick={submit} disabled={loading}
              className="w-full bg-[#1b4332] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-[#2d6a4f] disabled:opacity-60 transition-colors mt-2">
              {loading ? (mode === 'login' ? 'Signing in...' : 'Creating account...') : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </button>

            <p className="text-center text-xs text-gray-400 pt-1">
              No commission. $0 to list. We charge golfers $1 — not you.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
