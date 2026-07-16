'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle } from 'lucide-react';
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from '@/lib/password';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

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
    const strengthError = validatePasswordStrength(password);
    if (strengthError) { setError(strengthError); return; }
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
        <CheckCircle className="w-10 h-10 text-ok mx-auto mb-4" />
        <h2 className="font-serif text-xl font-medium text-ink mb-2">Password set</h2>
        <p className="text-ink-soft text-sm mb-6">Your account is ready.</p>
        <button
          onClick={() => router.push('/admin/login')}
          className="bg-pine hover:bg-pine-hover text-white text-[12.5px] font-medium px-6 py-2.5 rounded-md transition-colors"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-serif text-xl font-medium text-ink mb-1">Set your password</h1>
      <p className="text-ink-soft text-sm mb-6">Choose a password for your GreenReserve admin account.</p>

      {error && (
        <div className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-bad text-sm mb-5">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoFocus
            minLength={10}
            className={iCls}
            placeholder="Min. 10 characters"
          />
          <p className="text-xs text-ink-faint mt-1.5">{PASSWORD_REQUIREMENTS_HINT}</p>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            className={iCls}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !token}
          className="w-full bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[12.5px] font-medium py-2.5 rounded-md transition-colors mt-2"
        >
          {loading ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </>
  );
}

export default function SetPasswordPage() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={300} height={150} priority className="w-[300px] max-w-full h-auto mx-auto" />
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mt-2">Admin</p>
        </div>
        <div className="bg-white border border-line rounded-lg p-8">
          <Suspense fallback={<div className="text-ink-soft text-sm">Loading…</div>}>
            <SetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
