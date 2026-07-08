'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const lCls = 'block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5';

export default function GolferRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true); setError('');
    const res = await fetch('/api/golfer/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, password: form.password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Something went wrong'); return; }
    router.push('/account');
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-[17px] font-serif font-medium tracking-tight text-ink">
            Green<span className="text-pine">Reserve</span>
          </Link>
          <p className="text-xs text-ink-muted mt-1">Create Your Golfer Account</p>
        </div>
        <div className="bg-white rounded-lg border border-line p-8">
          <h2 className="text-xl font-semibold text-ink mb-2">Create Account</h2>
          <p className="text-sm text-ink-soft mb-6">Book tee times, track rounds, manage memberships.</p>
          {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">{error}</div>}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lCls}>First Name</label>
                <input value={form.firstName} onChange={e => set('firstName', e.target.value)}
                  className={iCls} />
              </div>
              <div>
                <label className={lCls}>Last Name</label>
                <input value={form.lastName} onChange={e => set('lastName', e.target.value)}
                  className={iCls} />
              </div>
            </div>
            <div>
              <label className={lCls}>Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className={iCls} />
            </div>
            <div>
              <label className={lCls}>Phone</label>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                className={iCls} />
            </div>
            <div>
              <label className={lCls}>Password</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                className={iCls} />
            </div>
            <div>
              <label className={lCls}>Confirm Password</label>
              <input type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className={iCls} />
            </div>
          </div>
          <button onClick={submit} disabled={loading}
            className="mt-6 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm disabled:opacity-50 transition-colors">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
          <p className="mt-5 text-center text-xs text-ink-faint">
            Already have an account? <Link href="/account/login" className="text-pine font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
