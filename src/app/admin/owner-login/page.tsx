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
        setStep('verify');
        return;
      }
      router.push('/admin');
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
      router.push('/admin');
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
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={300} height={150} priority className="w-[300px] max-w-full h-auto mx-auto" />
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mt-2">Admin</p>
        </div>

        <div className="bg-white border border-line rounded-lg p-8">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-pine" />
            <h1 className="text-[22px] font-serif font-medium text-ink">Owner sign in</h1>
          </div>
          <p className="text-sm text-ink-soft mb-6">
            {step === 'credentials' ? 'Secure access with email verification' : `Check ${email} for a 6-digit code`}
          </p>

          {error && (
            <div className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-bad text-sm mb-5">
              {error}
            </div>
          )}

          {step === 'credentials' ? (
            <form onSubmit={handleCredentials} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus className={iCls} />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Password</label>
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
                <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Verification code</label>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoFocus
                  maxLength={6}
                  placeholder="000000"
                  className={iCls + ' text-center text-xl font-mono tracking-[0.25em]'}
                />
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
