'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Mail, CheckCircle } from 'lucide-react';

export default function GolferForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email) return;
    setLoading(true);
    setError('');
    const res = await fetch('/api/golfer/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || 'Something went wrong. Try again.');
      return;
    }
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg border border-line shadow-sm p-8">
          {sent ? (
            <div className="text-center py-2">
              <CheckCircle className="w-12 h-12 text-ok mx-auto mb-4" />
              <h2 className="text-lg font-semibold tracking-tight text-ink mb-2">Check your email</h2>
              <p className="text-ink-soft text-sm">
                If an account exists for <span className="font-semibold text-ink">{email}</span>, a reset link is on its way. It expires in 1 hour.
              </p>
              <Link href="/account/login" className="inline-block mt-6 text-pine font-medium text-sm hover:underline">Back to login</Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-5 h-5 text-pine" />
                <h2 className="text-xl font-semibold tracking-tight text-ink">Forgot your password?</h2>
              </div>
              <p className="text-ink-soft text-sm mb-6">Enter the email on your account and we&apos;ll send you a reset link.</p>

              {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">{error}</div>}

              <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors"
              />

              <button onClick={submit} disabled={loading || !email}
                className="mt-6 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm disabled:opacity-50 transition-colors">
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <p className="mt-6 text-center text-xs text-ink-faint">
                <Link href="/account/login" className="text-pine font-medium hover:underline">Back to login</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
