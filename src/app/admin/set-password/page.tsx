'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Leaf, CheckCircle } from 'lucide-react';

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!token) setError('Missing or invalid token.'); }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to set password'); return; }
      setDone(true);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-white font-black text-xl mb-2">Password set</h2>
        <p className="text-gray-400 text-sm mb-6">Your account is ready.</p>
        <button
          onClick={() => router.push('/admin/login')}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-6 py-2.5 rounded-md transition-colors"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-white font-black text-xl mb-1">Set your password</h1>
      <p className="text-gray-500 text-sm mb-6">Choose a password for your GreenReserve admin account.</p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 text-red-400 text-sm mb-5">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoFocus
            minLength={8}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-600"
            placeholder="Min. 8 characters"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-600"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !token}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-md transition-colors mt-2"
        >
          {loading ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </>
  );
}

export default function SetPasswordPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <Leaf className="w-5 h-5 text-emerald-500" />
          <span className="text-white font-black tracking-tight text-lg">GreenReserve Admin</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8">
          <Suspense fallback={<div className="text-gray-500 text-sm">Loading…</div>}>
            <SetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
