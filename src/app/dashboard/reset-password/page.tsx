'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

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
        setValidToken(true);
        setEmail(data.email);
      })
      .finally(() => setChecking(false));
  }, [token]);

  const submit = async () => {
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
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
    setTimeout(() => router.push('/dashboard/login'), 1800);
  };

  return (
    <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-white font-black text-3xl tracking-tight">
            Green<span className="text-green-400">Reserve</span>
          </span>
          <p className="text-green-200/60 text-sm mt-2">Course Operator Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {checking && (
            <div className="text-center py-6">
              <Loader2 className="w-10 h-10 text-green-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-500 text-sm">Checking your link...</p>
            </div>
          )}

          {!checking && !validToken && (
            <div className="text-center py-4">
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-lg font-black text-gray-900 mb-2">Link invalid or expired</h2>
              <p className="text-gray-500 text-sm mb-6">Reset links expire after 1 hour. Request a new one below.</p>
              <a href="/dashboard/forgot-password" className="inline-block w-full bg-[#1b4332] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#2d6a4f] transition-colors">
                Request New Link
              </a>
            </div>
          )}

          {!checking && validToken && !done && (
            <>
              <h2 className="text-xl font-black text-gray-900 mb-1">Set a new password</h2>
              <p className="text-gray-500 text-sm mb-6">For <span className="font-semibold text-gray-700">{email}</span></p>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">New Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none" />
                </div>
              </div>

              <button onClick={submit} disabled={loading}
                className="mt-6 w-full bg-[#1b4332] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#2d6a4f] disabled:opacity-50 transition-colors">
                {loading ? 'Saving...' : 'Set New Password'}
              </button>
            </>
          )}

          {done && (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-lg font-black text-gray-900 mb-2">Password updated</h2>
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
