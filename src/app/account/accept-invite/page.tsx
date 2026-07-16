'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2, AlertCircle } from 'lucide-react';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';
const lCls = 'block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5';

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
    return <div className="min-h-screen bg-paper flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink-faint" /></div>;
  }

  if (loadError || !info) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-lg border border-line p-8 text-center">
          <AlertCircle className="w-10 h-10 text-bad mx-auto mb-4" />
          <h1 className="font-semibold text-ink mb-2">Can&apos;t open this invite</h1>
          <p className="text-ink-soft text-sm mb-6">{loadError}</p>
          <Link href="/account/login" className="inline-block px-5 py-2.5 rounded-md text-sm font-medium text-white bg-pine hover:bg-pine-hover transition-colors">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={300} height={150} priority className="w-[300px] max-w-full h-auto" />
          </Link>
          <p className="text-xs text-ink-muted mt-1">Set Up Your Member Account</p>
        </div>
        <div className="bg-white rounded-lg border border-line p-8">
          <div className="bg-ok/5 border border-ok/20 rounded-md px-4 py-3 mb-6">
            <p className="text-ok text-sm font-semibold">{info.tierName} member at {info.courseName}</p>
            <p className="text-ok/80 text-xs mt-0.5">{info.email}</p>
          </div>
          <h2 className="text-xl font-semibold text-ink mb-2">Create Your Password</h2>
          <p className="text-sm text-ink-soft mb-6">Set a password to start booking your member rate online.</p>
          {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm mb-4">{error}</div>}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lCls}>First Name</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)}
                  className={iCls} />
              </div>
              <div>
                <label className={lCls}>Last Name</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)}
                  className={iCls} />
              </div>
            </div>
            <div>
              <label className={lCls}>Phone (optional)</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className={iCls} />
            </div>
            <div>
              <label className={lCls}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className={iCls} />
            </div>
            <div>
              <label className={lCls}>Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                className={iCls} />
            </div>
          </div>
          <button onClick={submit} disabled={submitting}
            className="mt-6 w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-sm disabled:opacity-50 transition-colors">
            {submitting ? 'Setting up...' : 'Set Up My Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <AcceptInviteInner />
    </Suspense>
  );
}
