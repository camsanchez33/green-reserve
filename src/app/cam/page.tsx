'use client';
// AW-1 (Cam 2026-10-20): the owner's sign-in — the only one. Password, then an
// approved device (a new one is approved from an emailed link), then a second
// factor. Nothing here says "owner": /cam is linked from nowhere.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card } from '@/components/ui/Card';
import { INPUT } from '@/components/ui/field';

const iCls = `${INPUT} w-full`;
const lCls = 'block text-[13px] font-semibold text-ink mb-1.5';

export default function CamSignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | 'device' | 'verify'>('credentials');
  const [method, setMethod] = useState<'email' | 'totp'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function post(body: Record<string, unknown>) {
    const res = await fetch('/api/cam/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { res, data: await res.json().catch(() => ({})) as Record<string, unknown> };
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { res, data } = await post({ email, password });
      if (!res.ok) { setError(String(data.error || `Sign-in failed (${res.status}) — try again.`)); return; }
      if (data.needsDeviceApproval) { setStep('device'); return; }
      if (data.mustChangePassword && data.setPasswordToken) { router.push(`/admin/set-password?token=${encodeURIComponent(String(data.setPasswordToken))}`); return; }
      if (data.requires2FA) { setMethod(data.method === 'totp' ? 'totp' : 'email'); setStep('verify'); return; }
      setError('Something unexpected came back — try again.');
    } catch {
      setError('Network error — check your connection and try again.');
    } finally { setLoading(false); }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { res, data } = await post({ step: 'verify', email, code });
      if (!res.ok) { setError(String(data.error || `Verification failed (${res.status}) — try again.`)); return; }
      window.location.assign('/admin'); // hard nav: the admin layout reads the new cookie
    } catch {
      setError('Network error — check your connection and try again.');
    } finally { setLoading(false); }
  }

  const startOver = () => { setStep('credentials'); setCode(''); setError(''); };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={190} height={36} priority className="w-[190px] max-w-full h-auto mx-auto" />
        </div>
        <Card className="p-8">
          <h1 className="text-[22px] font-serif font-semibold text-ink mb-1">Sign in</h1>
          <p className="text-sm text-ink-soft mb-6">
            {step === 'credentials' ? 'Your password, then a second factor.'
              : step === 'device' ? 'This device hasn’t been used to sign in before.'
              : method === 'totp' ? 'Enter the 6-digit code from your authenticator app — or a recovery code.'
              : `Check ${email} for a 6-digit code.`}
          </p>

          {error && <div className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-ink text-sm mb-5" role="alert">{error}</div>}

          {step === 'credentials' && (
            <form onSubmit={handleCredentials} className="space-y-4">
              <div><label className={lCls} htmlFor="cam-email">Email</label>
                <input id="cam-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus autoComplete="username" className={iCls} /></div>
              <div><label className={lCls} htmlFor="cam-password">Password</label>
                <input id="cam-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" className={iCls} /></div>
              <button type="submit" disabled={loading} className="w-full bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[13px] font-medium py-2.5 rounded-md transition-colors mt-2">
                {loading ? 'Checking…' : 'Continue'}
              </button>
            </form>
          )}

          {step === 'device' && (
            <div className="space-y-4">
              <p className="text-[14px] text-ink">We emailed {email} a link to approve it. Open the email, review the device and approve it, then come back here and sign in again.</p>
              <p className="text-[13px] text-ink-muted">The link works for 15 minutes. If you didn’t get it, sign in again for a new one.</p>
              <button type="button" onClick={startOver} className="w-full bg-pine hover:bg-pine-hover text-white text-[13px] font-medium py-2.5 rounded-md transition-colors">I’ve approved it — sign in again</button>
            </div>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className={lCls} htmlFor="cam-code">{method === 'totp' ? 'Authenticator or recovery code' : 'Code from the email'}</label>
                <input id="cam-code" type="text" value={code}
                  onChange={e => setCode(method === 'totp' ? e.target.value.replace(/[^0-9a-zA-Z-]/g, '').slice(0, 9) : e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required autoFocus maxLength={method === 'totp' ? 9 : 6} placeholder="000000" autoComplete="one-time-code"
                  className={iCls + ' text-center text-xl font-mono tracking-[0.25em]'} />
                {method === 'totp' && <p className="text-[12.5px] text-ink-muted mt-1.5">Lost the phone? A recovery code (xxxx-xxxx) works once.</p>}
              </div>
              <button type="submit" disabled={loading || code.length < 6} className="w-full bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[13px] font-medium py-2.5 rounded-md transition-colors">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
              <button type="button" onClick={startOver} className="w-full text-sm text-ink-soft hover:text-ink text-center transition-colors">Start over</button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
