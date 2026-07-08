'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from '@/lib/password';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const lCls = 'block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5';

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
    fetch(`/api/golfer/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(async res => {
        if (!res.ok) { setValidToken(false); return; }
        const data = await res.json();
        setValidToken(true);
        setEmail(data.email);
      })
      .finally(() => setChecking(false));
  }, [token]);

  const submit = async () => {
    setError('');
    const strengthError = validatePasswordStrength(password);
    if (strengthError) { setError(strengthError); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    const res = await fetch('/api/golfer/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || 'Something went wrong.');
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/account/login'), 1800);
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg border border-line shadow-sm p-8">
          {checking && (
            <div className="text-center py-6">
              <Loader2 className="w-10 h-10 text-pine animate-spin mx-auto mb-4" />
              <p className="text-ink-soft text-sm">Checking your link...</p>
            </div>
          )}

          {!checking && !validToken && (
            <div className="text-center py-4">
              <XCircle className="w-12 h-12 text-bad mx-auto mb-4" />
              <h2 className="text-lg font-semibold tracking-tight text-ink mb-2">Link invalid or expired</h2>
              <p className="text-ink-soft text-sm mb-6">Reset links expire after 1 hour. Request a new one below.</p>
              <Link href="/account/forgot-password" className="inline-block w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm transition-colors text-center">
                Request New Link
              </Link>
            </div>
          )}

          {!checking && validToken && !done && (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-ink mb-1">Set a new password</h2>
              <p className="text-ink-soft text-sm mb-6">For <span className="font-semibold text-ink">{email}</span></p>

              {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">{error}</div>}

              <div className="space-y-4">
                <div>
                  <label className={lCls}>New Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    className={iCls} />
                  <p className="text-xs text-ink-faint mt-1.5">{PASSWORD_REQUIREMENTS_HINT}</p>
                </div>
                <div>
                  <label className={lCls}>Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    className={iCls} />
                </div>
              </div>

              <button onClick={submit} disabled={loading}
                className="mt-6 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm disabled:opacity-50 transition-colors">
                {loading ? 'Saving...' : 'Set New Password'}
              </button>
            </>
          )}

          {done && (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-ok mx-auto mb-4" />
              <h2 className="text-lg font-semibold tracking-tight text-ink mb-2">Password updated</h2>
              <p className="text-ink-soft text-sm">Redirecting you to login...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordContent /></Suspense>;
}
