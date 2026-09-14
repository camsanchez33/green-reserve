'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle } from 'lucide-react';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const justVerified = params.get('verified') === '1';
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true); setError('');
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Invalid email or password'); return; }
    router.push(data.redirect || '/dashboard');
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* U-O (UI_REVISE_SPEC §1b, canvas "Sign in + 2FA"): eyebrow, serif
            title, one plain sentence — the mark drops to the footer line. */}
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">Course operator portal</div>
          <h1 className="text-[30px] font-serif font-medium leading-none tracking-tight text-ink mt-2">Sign in</h1>
          <p className="text-[13.5px] text-ink-soft mt-2">Your tee sheet, your bookings and your settings.</p>
        </div>

        {justVerified && (
          <div className="flex items-center gap-2 bg-white border border-line border-l-[3px] border-l-ok rounded-md px-4 py-3 mb-4 text-ok text-[13.5px]">
            <CheckCircle className="w-4 h-4 shrink-0"/>Email verified! Sign in to continue setup.
          </div>
        )}

        <div className="bg-white border border-line rounded-lg p-6 space-y-4">
          {error && <div className="bg-white border border-line border-l-[3px] border-l-bad text-bad rounded-md px-3 py-2.5 text-[13.5px]" role="alert">{error}</div>}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} autoFocus autoComplete="email" className={iCls}/>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] uppercase tracking-[0.1em] text-ink-muted">Password</label>
                <a href="/dashboard/forgot-password" className="text-[12.5px] text-pine hover:underline">Forgot password?</a>
              </div>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} autoComplete="current-password" className={iCls}/>
            </div>
          </div>
          <button onClick={submit} disabled={loading}
            className="w-full bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md font-medium text-[12.5px] disabled:opacity-50 transition-colors">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <p className="text-center text-[12.5px] text-ink-muted">
            Don&apos;t have an account? <a href="/for-courses" className="text-pine font-medium hover:underline">Submit an inquiry →</a>
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={190} height={36} priority className="w-[130px] max-w-full h-auto opacity-60" />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginContent /></Suspense>;
}
