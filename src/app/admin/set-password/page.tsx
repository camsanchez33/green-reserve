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
  // MP-2 fix-now #10: hold the token in memory and strip it from the address
  // bar. It grants a password set for 24h, and in the URL it persists in browser
  // history, in the Referer on any outbound click, and in anything syncing tabs.
  // The emailed link necessarily carries it; it does not have to stay there.
  const [token] = useState(() => searchParams.get('token') || '');
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('token=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [signInUrl, setSignInUrl] = useState('/admin/login');
  const [loading, setLoading] = useState(false);

  const [needsNewLink, setNeedsNewLink] = useState(false);
  useEffect(() => {
    if (!token) { setError('This page no longer has your link’s token — that happens if you refresh. Re-open the link from your email, or request a new one.'); setNeedsNewLink(true); }
  }, [token]);

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
      if (!res.ok) {
        setError(data.error || 'Failed to set password');
        // Expired or already-used token: a dead end with no way forward is the
        // bug. Offer the reset flow instead of leaving them stuck on a form
        // that can never succeed.
        if (res.status === 400 || res.status === 401 || res.status === 410) setNeedsNewLink(true);
        return;
      }
      // Owners are rejected by /admin/login — send a freshly activated owner
      // to the door with the second factor instead of bouncing them straight
      // back out.
      if (data.role === 'owner') setSignInUrl('/admin/owner-login');
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
          onClick={() => router.push(signInUrl)}
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

      {needsNewLink && (
        <div className="mb-4 rounded-md bg-paper border border-line px-4 py-3">
          <p className="text-sm text-ink-soft mb-2">Password links expire after 24 hours and can only be used once.</p>
          <a href="/admin/forgot-password" className="text-sm font-medium text-pine hover:underline">Request a new link &rarr;</a>
        </div>
      )}
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
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={190} height={36} priority className="w-[190px] max-w-full h-auto mx-auto" />
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
