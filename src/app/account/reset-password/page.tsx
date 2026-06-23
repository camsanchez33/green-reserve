'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from '@/lib/password';

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          {checking && (
            <div className="text-center py-6">
              <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-500 text-sm">Checking your link...</p>
            </div>
          )}

          {!checking && !validToken && (
            <div className="text-center py-4">
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-lg font-black tracking-tight text-gray-900 mb-2">Link invalid or expired</h2>
              <p className="text-gray-500 text-sm mb-6">Reset links expire after 1 hour. Request a new one below.</p>
              <Link href="/account/forgot-password" className="inline-block w-full bg-emerald-600 text-white py-3 rounded-md font-bold text-sm hover:bg-emerald-500 transition-colors">
                Request New Link
              </Link>
            </div>
          )}

          {!checking && validToken && !done && (
            <>
              <h2 className="text-xl font-black tracking-tight text-gray-900 mb-1">Set a new password</h2>
              <p className="text-gray-500 text-sm mb-6">For <span className="font-semibold text-gray-700">{email}</span></p>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm mb-4">{error}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">New Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    className="w-full border border-gray-200 rounded-md px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none" />
                  <p className="text-xs text-gray-400 mt-1.5">{PASSWORD_REQUIREMENTS_HINT}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    className="w-full border border-gray-200 rounded-md px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none" />
                </div>
              </div>

              <button onClick={submit} disabled={loading}
                className="mt-6 w-full bg-emerald-600 text-white py-3 rounded-md font-bold text-sm hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                {loading ? 'Saving...' : 'Set New Password'}
              </button>
            </>
          )}

          {done && (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
              <h2 className="text-lg font-black tracking-tight text-gray-900 mb-2">Password updated</h2>
              <p className="text-gray-500 text-sm">Redirecting you to login...</p>
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
