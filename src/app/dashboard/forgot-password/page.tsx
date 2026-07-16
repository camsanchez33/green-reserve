'use client';
import { useState } from 'react';
import Image from 'next/image';
import { Mail, CheckCircle } from 'lucide-react';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email) return;
    setLoading(true); setError('');
    const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    setLoading(false);
    if (!res.ok) { const d = await res.json(); setError(d.error || 'Something went wrong. Try again.'); return; }
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={190} height={36} priority className="w-[190px] max-w-full h-auto mx-auto" />
          <p className="text-sm text-ink-muted mt-1">Course Operator Portal</p>
        </div>

        <div className="bg-white border border-line rounded-lg p-6">
          {sent ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-ok/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-ok"/>
              </div>
              <h2 className="text-[17px] font-serif font-medium text-ink mb-2">Check your email</h2>
              <p className="text-sm text-ink-soft">
                If an account exists for <span className="font-medium text-ink">{email}</span>, a reset link is on its way. It expires in 1 hour.
              </p>
              <a href="/dashboard/login" className="inline-block mt-6 text-pine font-medium text-sm hover:underline">Back to login</a>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-5 h-5 text-pine"/>
                <h2 className="text-[17px] font-serif font-medium text-ink">Forgot your password?</h2>
              </div>
              <p className="text-sm text-ink-soft mb-5">Enter the email on your account and we&apos;ll send you a reset link.</p>
              {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-3 py-2.5 text-sm mb-4">{error}</div>}
              <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()} className={iCls} autoFocus/>
              <button onClick={submit} disabled={loading || !email}
                className="mt-4 w-full bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md font-medium text-[12.5px] disabled:opacity-50 transition-colors">
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <p className="mt-5 text-center text-xs text-ink-muted">
                <a href="/dashboard/login" className="text-pine font-medium hover:underline">Back to login</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
