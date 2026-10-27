'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthPhotoShell } from '@/components/AuthPhotoShell';
import { Loader2 } from 'lucide-react';
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from '@/lib/password';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  // Cam 2026-10-27: the "set your password" link from the dashboard-ready email (lib/operator-setup).
  const setup = params.get('setup') === '1';

  const [checking, setChecking] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

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
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, setup }),
      });
      const d = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) { setError(String(d.error || 'Something went wrong — try again.')); return; }
      setDone(true); setSignedIn(!!d.signedIn);
      // Signed straight in (setup link): on to the dashboard. Otherwise, the sign-in page.
      const next = d.signedIn && typeof d.redirect === 'string' ? d.redirect : '/dashboard/login';
      setTimeout(() => router.push(next), d.signedIn ? 600 : 1800);
    } catch {
      setError('Couldn’t reach the server — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPhotoShell width="md">

        <div className="bg-white rounded-lg shadow-card p-8">
          {checking && (
            <div className="text-center py-6">
              <Loader2 className="w-10 h-10 text-pine animate-spin mx-auto mb-4"/>
              <p className="text-ink-soft text-sm">Checking your link...</p>
            </div>
          )}

          {!checking && !validToken && (
            <div className="text-center py-4">
              <h2 className="text-[24px] font-serif font-semibold leading-none text-ink mb-2">Link invalid or expired</h2>
              <p className="text-ink-soft text-sm mb-6">{setup ? 'This link was already used or has expired. Request a new one below, or ask us to resend it.' : 'Reset links expire after 1 hour. Request a new one below.'}</p>
              <a href="/dashboard/forgot-password" className="inline-block w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] transition-colors">
                Request New Link
              </a>
            </div>
          )}

          {!checking && validToken && !done && (
            <>
              <h2 className="text-[24px] font-serif font-semibold leading-none text-ink mb-1">{setup ? 'Choose your password' : 'Set a new password'}</h2>
              <p className="text-sm text-ink-soft mb-6">{setup ? 'You\u2019ll sign in to your GreenReserve dashboard with ' : 'For '}<span className="font-medium text-ink">{email}</span>{setup ? '.' : ''}</p>

              {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">{error}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-semibold text-ink mb-1.5">New password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} className={iCls}/>
                  <p className="text-xs text-ink-soft mt-1.5">{PASSWORD_REQUIREMENTS_HINT}</p>
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-ink mb-1.5">Confirm password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} className={iCls}/>
                </div>
              </div>

              <button onClick={submit} disabled={loading}
                className="mt-6 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 transition-colors">
                {loading ? 'Saving...' : setup ? 'Save and open my dashboard' : 'Set new password'}
              </button>
            </>
          )}

          {done && (
            <div className="text-center py-4">
              <h2 className="text-[24px] font-serif font-semibold leading-none text-ink mb-2">{setup ? 'Password saved' : 'Password updated'}</h2>
              <p className="text-ink-soft text-sm">{signedIn ? 'Opening your dashboard…' : 'Redirecting you to sign in...'}</p>
            </div>
          )}
        </div>
    </AuthPhotoShell>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordContent/></Suspense>;
}
