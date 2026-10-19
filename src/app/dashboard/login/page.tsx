'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { StatusDot } from '@/components/ui/StatusDot';

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

  // Cam 2026-10-19 (HOMEPAGE_SPEC §0a): keep it minimal — the homepage's photo
  // and logo beside the form on a laptop (the form alone on a phone), and a
  // line for staff who can't get in.
  return (
    <div className="min-h-screen bg-paper md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative hidden md:flex flex-col items-center justify-center overflow-hidden bg-[#2B3A2E]">
        <Image src="/home/hero-coast.jpg" alt="" fill priority sizes="50vw" quality={50} className="object-cover" />
        <div aria-hidden="true" className="absolute inset-0 bg-[#0A0E0B]/35" />
        <div className="relative z-10 px-10 text-center">
          <Image src="/brand/logo-cream.svg" unoptimized alt="GreenReserve" width={1530} height={286} priority className="w-[min(380px,70%)] h-auto mx-auto" />
          <p className="font-serif text-[22px] text-[#F6F4EC] mt-5 [text-shadow:0_1px_2px_rgba(0,0,0,.4)]">The tee sheet your course deserves.</p>
        </div>
      </div>

      <div className="min-h-screen md:min-h-0 flex items-center justify-center p-4 md:p-10">
        <div className="w-full max-w-sm">
          <div className="md:hidden flex justify-center mb-8">
            <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={190} height={36} priority className="w-[150px] h-auto" />
          </div>
          <div className="mb-6">
            <h1 className="text-[30px] font-serif font-semibold leading-none tracking-tight text-ink">Sign in</h1>
            <p className="text-[13.5px] text-ink-soft mt-2">Your tee sheet, your bookings and your settings.</p>
          </div>

          {justVerified && (
            <div className="flex items-center gap-2 bg-white border border-line border-l-[3px] border-l-ok rounded-md px-4 py-3 mb-4 text-ok text-[13.5px]">
              <StatusDot status="ok" />Email verified! Sign in to continue setup.
            </div>
          )}

          <form onSubmit={e => { e.preventDefault(); submit(); }} className="bg-white rounded-lg shadow-card p-6 space-y-4">
            {error && <div className="bg-white border border-line border-l-[3px] border-l-bad text-bad rounded-md px-3 py-2.5 text-[13.5px]" role="alert">{error}</div>}
            <div className="space-y-3">
              <div>
                <label htmlFor="login-email" className="block text-[13px] font-semibold text-ink mb-1.5">Email</label>
                <input id="login-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} autoFocus autoComplete="email" className={iCls}/>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-[13px] font-semibold text-ink">Password</label>
                  <a href="/dashboard/forgot-password" className="text-[12.5px] text-pine hover:underline">Forgot password?</a>
                </div>
                <input id="login-password" type="password" value={form.password} onChange={e => set('password', e.target.value)} autoComplete="current-password" className={iCls}/>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md font-medium text-[13.5px] disabled:opacity-50 transition-colors">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-5 space-y-1.5 text-center text-[12.5px] text-ink-soft">
            <p>Need help signing in? <a href="mailto:thegreenreserve@outlook.com?subject=Help%20signing%20in" className="text-pine font-medium hover:underline">Email GreenReserve support</a></p>
            <p>Don&apos;t have an account? <a href="/for-courses" className="text-pine font-medium hover:underline">Ask a question →</a></p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginContent /></Suspense>;
}
