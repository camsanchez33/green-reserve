'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { StatusDot } from '@/components/ui/StatusDot';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function LoginContent() {
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
    // A new sign-in may be another course: drop the top bar's remembered identity (AN-3).
    try { sessionStorage.removeItem('gr:op-identity'); } catch { /* storage unavailable */ }
    // A full load, not router.push: the top bar's in-memory cache must not survive into another course.
    window.location.assign(data.redirect || '/dashboard');
  };

  // Cam 2026-10-20: the homepage photo fills the screen, the cream logo sits on
  // it, and the sign-in card sits under the logo — one picture, phone and laptop
  // alike. The card is solid white so the fields read on any part of the photo.
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#2B3A2E]">
      <Image src="/home/hero-coast.jpg" alt="" fill priority sizes="100vw" quality={55} className="object-cover" />
      {/* A scrim, darker toward the bottom where the card sits, so the logo and the help links read. */}
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,14,11,.25)_0%,rgba(10,14,11,.35)_45%,rgba(10,14,11,.6)_100%)]" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-10">
        <Image src="/brand/logo-cream.svg" unoptimized alt="GreenReserve" width={1530} height={286} priority className="w-[min(300px,72vw)] h-auto [filter:drop-shadow(0_1px_2px_rgba(0,0,0,.35))]" />

        <div className="w-full max-w-sm mt-9">
          {justVerified && (
            <div className="flex items-center gap-2 bg-white border border-line border-l-[3px] border-l-ok rounded-md px-4 py-3 mb-3 text-ok text-[13.5px]">
              <StatusDot status="ok" />Email verified! Sign in to continue setup.
            </div>
          )}

          <form onSubmit={e => { e.preventDefault(); submit(); }} className="bg-white rounded-lg shadow-card p-6 sm:p-7 space-y-4">
            <div>
              <h1 className="text-[28px] font-serif font-semibold leading-none tracking-tight text-ink">Sign in</h1>
              <p className="text-[13.5px] text-ink-soft mt-2">Your tee sheet, your bookings and your settings.</p>
            </div>
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

          <div className="mt-5 space-y-1.5 text-center text-[12.5px] text-[#F6F4EC]/90 [text-shadow:0_1px_2px_rgba(0,0,0,.45)]">
            <p>Need help signing in? <a href="mailto:thegreenreserve@outlook.com?subject=Help%20signing%20in" className="text-[#F6F4EC] font-semibold underline underline-offset-2">Email GreenReserve support</a></p>
            <p>Don&apos;t have an account? <a href="/for-courses" className="text-[#F6F4EC] font-semibold underline underline-offset-2">Ask a question →</a></p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginContent /></Suspense>;
}
