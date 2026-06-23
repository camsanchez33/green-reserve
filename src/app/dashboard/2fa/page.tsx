'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, ShieldCheck } from 'lucide-react';

export default function TwoFactorVerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Invalid or expired code.'); return; }
    router.push(data.redirect || '/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-white font-black text-3xl tracking-tight">
            Green<span className="text-emerald-400">Reserve</span>
          </span>
          <p className="text-white/40 text-sm mt-2">Course Operator Portal</p>
        </div>

        <div className="bg-gray-900 border border-white/10 rounded-lg p-8">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-black tracking-tight text-white">Two-factor verification</h2>
          </div>
          <p className="text-white/40 text-sm mb-6 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> Check your email for a code.
          </p>

          {error && <div className="bg-red-950/50 border border-red-800 text-red-300 rounded-md px-4 py-3 text-sm mb-4">{error}</div>}

          <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-1.5">6-Digit Code</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && submit()}
            className="w-full bg-gray-950 border border-white/10 rounded-md px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
            placeholder="------"
            autoFocus
          />

          <button onClick={submit} disabled={loading || code.length !== 6}
            className="mt-6 w-full bg-emerald-600 text-white py-3 rounded-md font-bold text-sm hover:bg-emerald-500 disabled:opacity-50 transition-colors">
            {loading ? 'Verifying...' : 'Verify & Sign In'}
          </button>

          <p className="mt-6 text-center text-xs text-white/30">
            <a href="/dashboard/login" className="text-emerald-400 font-medium hover:underline">Back to login</a>
          </p>
        </div>
      </div>
    </div>
  );
}
