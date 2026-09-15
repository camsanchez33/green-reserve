'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

export default function OwnerLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | 'verify'>('credentials');
  // OWNER TOTP 2FA: which second factor the server asked for.
  const [method, setMethod] = useState<'email' | 'totp'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/owner-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      if (data.mustChangePassword && data.setPasswordToken) {
        router.push(`/admin/set-password?token=${encodeURIComponent(data.setPasswordToken)}`);
        return;
      }
      if (data.requires2FA) {
        setMethod(data.method === 'totp' ? 'totp' : 'email');
        setStep('verify');
        return;
      }
      window.location.assign('/admin'); // MP-11a: hard nav — the layout must re-read the new cookie
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/owner-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'verify', email, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Verification failed'); return; }
      window.location.assign('/admin'); // MP-11a: hard nav — the layout must re-read the new cookie
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={190} height={36} priority className="w-[190px] max-w-full h-auto mx-auto" />
        </div>

        <div className="bg-white border border-line rounded-lg p-8">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-pine" />
            <h1 className="text-[22px] font-serif font-medium text-ink">Owner sign in</h1>
          </div>
          <p className="text-sm text-ink-soft mb-6">
            {step === 'credentials' ? 'Secure access with a second factor' : method === 'totp' ? 'Enter the 6-digit code from your authenticator app — or a recovery code' : `Check ${email} for a 6-digit code`}
          </p>

          {error && (
            <div className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-bad text-sm mb-5">
              {error}
            </div>
          )}

          {step === 'credentials' ? (
            <form onSubmit={handleCredentials} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-1.5">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus className={iCls} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className={iCls} />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[12.5px] font-medium py-2.5 rounded-md transition-colors mt-2">
                {loading ? 'Verifying…' : 'Continue'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-1.5">{method === 'totp' ? 'Authenticator or recovery code' : 'Verification code'}</label>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(method === 'totp' ? e.target.value.replace(/[^0-9a-zA-Z-]/g, '').slice(0, 9) : e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoFocus
                  maxLength={method === 'totp' ? 9 : 6}
                  placeholder={method === 'totp' ? '000000' : '000000'}
                  autoComplete="one-time-code"
                  className={iCls + ' text-center text-xl font-mono tracking-[0.25em]'}
                />
                {method === 'totp' && <p className="text-[11px] text-ink-faint mt-1.5">Lost the phone? A recovery code (xxxx-xxxx) works once.</p>}
              </div>
              <button type="submit" disabled={loading || code.length < 6}
                className="w-full bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[12.5px] font-medium py-2.5 rounded-md transition-colors">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
              <button type="button" onClick={() => { setStep('credentials'); setCode(''); setError(''); }}
                className="w-full text-sm text-ink-soft hover:text-ink text-center transition-colors">
                Start over
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[12px] text-ink-faint mt-4">
          Not an owner?{' '}
          <Link href="/admin/login" className="text-pine hover:underline">Standard login</Link>
        </p>
      </div>
    </div>
  );
}
