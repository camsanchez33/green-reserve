'use client';
import { useState } from 'react';
import { Mail, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email) return;
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/forgot-password', {
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
    <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-white font-black text-3xl tracking-tight">
            Green<span className="text-green-400">Reserve</span>
          </span>
          <p className="text-green-200/60 text-sm mt-2">Course Operator Portal</p>
        </div>

        <div className="bg-white rounded-lg shadow-2xl p-8">
          {sent ? (
            <div className="text-center py-2">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-lg font-black text-gray-900 mb-2">Check your email</h2>
              <p className="text-gray-500 text-sm">
                If an account exists for <span className="font-semibold text-gray-700">{email}</span>, a reset link is on its way. It expires in 1 hour.
              </p>
              <a href="/dashboard/login" className="inline-block mt-6 text-green-700 font-medium text-sm hover:underline">Back to login</a>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-5 h-5 text-green-700" />
                <h2 className="text-xl font-black text-gray-900">Forgot your password?</h2>
              </div>
              <p className="text-gray-500 text-sm mb-6">Enter the email on your account and we&apos;ll send you a reset link.</p>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              />

              <button onClick={submit} disabled={loading || !email}
                className="mt-6 w-full bg-[#1b4332] text-white py-3 rounded-lg font-bold text-sm hover:bg-[#2d6a4f] disabled:opacity-50 transition-colors">
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <p className="mt-6 text-center text-xs text-gray-400">
                <a href="/dashboard/login" className="text-green-700 font-medium hover:underline">Back to login</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
