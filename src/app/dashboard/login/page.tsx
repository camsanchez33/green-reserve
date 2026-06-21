'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle } from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const justVerified = params.get('verified') === '1';

  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Invalid email or password'); return; }
    router.push(data.redirect || '/dashboard');
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

        {justVerified && (
          <div className="flex items-center gap-3 bg-green-900/50 border border-green-700 rounded-xl px-4 py-3 mb-4 text-green-300 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            Email verified! Sign in to continue setup.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-black text-gray-900 mb-6">Sign In</h2>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Password</label>
                <a href="/dashboard/forgot-password" className="text-xs text-green-700 font-medium hover:underline">Forgot password?</a>
              </div>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
            </div>
          </div>

          <button onClick={submit} disabled={loading}
            className="mt-6 w-full bg-[#1b4332] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#2d6a4f] disabled:opacity-50 transition-colors">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="mt-6 text-center text-xs text-gray-400">
            Don&apos;t have an account? <a href="/for-courses" className="text-green-700 font-medium hover:underline">Submit an inquiry →</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginContent /></Suspense>;
}
