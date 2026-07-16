'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const lCls = 'block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5';

export default function GolferLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true); setError('');
    const res = await fetch('/api/golfer/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Invalid email or password'); return; }
    router.push('/account');
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={300} height={150} priority className="w-[300px] max-w-full h-auto" />
          </Link>
          <p className="text-xs text-ink-muted mt-1">Golfer Account</p>
        </div>
        <div className="bg-white rounded-lg border border-line p-8">
          <h2 className="text-xl font-semibold text-ink mb-6">Sign In</h2>
          {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">{error}</div>}
          <div className="space-y-4">
            <div>
              <label className={lCls}>Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                autoComplete="email"
                className={iCls} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={lCls.replace(' mb-1.5', '')}>Password</label>
                <Link href="/account/forgot-password" className="text-xs text-pine font-medium hover:underline">Forgot password?</Link>
              </div>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                autoComplete="current-password"
                className={iCls} />
            </div>
          </div>
          <button onClick={submit} disabled={loading}
            className="mt-6 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm disabled:opacity-50 transition-colors">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <p className="mt-5 text-center text-xs text-ink-faint">
            No account? <Link href="/account/register" className="text-pine font-medium hover:underline">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
