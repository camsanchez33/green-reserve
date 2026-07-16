'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from '@/lib/password';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';

  const [checking, setChecking] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(async res => {
        if (!res.ok) { setValidToken(false); return; }
        const data = await res.json();
        setValidToken(true); setEmail(data.email);
      })
      .finally(() => setChecking(false));
  }, [token]);

  const submit = async () => {
    setError('');
    const strengthError = validatePasswordStrength(password);
    if (strengthError) { setError(strengthError); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (!res.ok) { const d = await res.json(); setError(d.error || 'Something went wrong.'); return; }
    setDone(true);
    setTimeout(() => router.push('/dashboard/login'), 1800);
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={88} height={44} priority className="h-11 w-auto mx-auto" />
          <p className="text-xs text-ink-muted mt-1">Course Operator Portal</p>
        </div>

        <div className="bg-white border border-line rounded-lg p-8">
          {checking && (
            <div className="text-center py-6">
              <Loader2 className="w-10 h-10 text-pine animate-spin mx-auto mb-4"/>
              <p className="text-ink-soft text-sm">Checking your link...</p>
            </div>
          )}

          {!checking && !validToken && (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-bad/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-6 h-6 text-bad"/>
              </div>
              <h2 className="text-[18px] font-serif font-medium text-ink mb-2">Link invalid or expired</h2>
              <p className="text-ink-soft text-sm mb-6">Reset links expire after 1 hour. Request a new one below.</p>
              <a href="/dashboard/forgot-password" className="inline-block w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] transition-colors">
                Request New Link
              </a>
            </div>
          )}

          {!checking && validToken && !done && (
            <>
              <h2 className="text-[20px] font-serif font-medium text-ink mb-1">Set a new password</h2>
              <p className="text-sm text-ink-soft mb-6">For <span className="font-medium text-ink">{email}</span></p>

              {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">{error}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">New Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} className={iCls}/>
                  <p className="text-xs text-ink-faint mt-1.5">{PASSWORD_REQUIREMENTS_HINT}</p>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} className={iCls}/>
                </div>
              </div>

              <button onClick={submit} disabled={loading}
                className="mt-6 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 transition-colors">
                {loading ? 'Saving...' : 'Set New Password'}
              </button>
            </>
          )}

          {done && (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-ok/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-ok"/>
              </div>
              <h2 className="text-[18px] font-serif font-medium text-ink mb-2">Password updated</h2>
              <p className="text-ink-soft text-sm">Redirecting you to login...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordContent/></Suspense>;
}
