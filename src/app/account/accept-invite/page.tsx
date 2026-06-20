'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle } from 'lucide-react';

type InviteInfo = { email: string; name: string; courseName: string; tierName: string };

function AcceptInviteInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setLoadError('This invite link is missing its token.'); setLoading(false); return; }
    fetch(`/api/golfer/auth/accept-invite?token=${encodeURIComponent(token)}`)
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setLoadError(data.error || 'This invite link is invalid.'); setLoading(false); return; }
        setInfo(data);
        const parts = (data.name || '').split(' ');
        setFirstName(parts[0] || '');
        setLastName(parts.slice(1).join(' ') || '');
        setLoading(false);
      })
      .catch(() => { setLoadError('Something went wrong loading this invite.'); setLoading(false); });
  }, [token]);

  async function submit() {
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/golfer/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, firstName, lastName, phone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); setSubmitting(false); return; }
      router.push('/account');
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>;
  }

  if (loadError || !info) {
    return (
      <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h1 className="font-bold text-gray-900 mb-2">Can&apos;t open this invite</h1>
          <p className="text-gray-500 text-sm mb-6">{loadError}</p>
          <Link href="/account/login" className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1b4332]">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-white font-black text-3xl tracking-tight">
            Green<span className="text-green-400">Reserve</span>
          </Link>
          <p className="text-green-200/60 text-sm mt-2">Set Up Your Member Account</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="bg-[#f0fdf4] border border-emerald-100 rounded-xl px-4 py-3 mb-6">
            <p className="text-emerald-800 text-sm font-semibold">{info.tierName} member at {info.courseName}</p>
            <p className="text-emerald-700 text-xs mt-0.5">{info.email}</p>
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-2">Create Your Password</h2>
          <p className="text-sm text-gray-500 mb-6">Set a password to start booking your member rate online.</p>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">First Name</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Last Name</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Phone (optional)</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-green-500 outline-none" />
            </div>
          </div>
          <button onClick={submit} disabled={submitting}
            className="mt-6 w-full bg-[#1b4332] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#2d6a4f] disabled:opacity-50">
            {submitting ? 'Setting up...' : 'Set Up My Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a1f0f]" />}>
      <AcceptInviteInner />
    </Suspense>
  );
}
