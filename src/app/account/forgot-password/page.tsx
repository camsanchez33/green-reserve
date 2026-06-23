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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
          {sent ? (
            <div className="text-center py-2">
              <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
              <h2 className="text-lg font-black tracking-tight text-gray-900 mb-2">Check your email</h2>
              <p className="text-gray-500 text-sm">
                If an account exists for <span className="font-semibold text-gray-700">{email}</span>, a reset link is on its way. It expires in 1 hour.
              </p>
              <Link href="/account/login" className="inline-block mt-6 text-emerald-600 font-medium text-sm hover:underline">Back to login</Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-5 h-5 text-emerald-600" />
                <h2 className="text-xl font-black tracking-tight text-gray-900">Forgot your password?</h2>
              </div>
              <p className="text-gray-500 text-sm mb-6">Enter the email on your account and we&apos;ll send you a reset link.</p>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm mb-4">{error}</div>}

              <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="w-full border border-gray-200 rounded-md px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              />

              <button onClick={submit} disabled={loading || !email}
                className="mt-6 w-full bg-emerald-600 text-white py-3 rounded-md font-bold text-sm hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <p className="mt-6 text-center text-xs text-gray-400">
                <Link href="/account/login" className="text-emerald-600 font-medium hover:underline">Back to login</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
