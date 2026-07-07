'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Smartphone, ShieldCheck } from 'lucide-react';

const iCls = 'w-full bg-paper border border-line rounded-md px-4 py-3 text-center text-2xl font-mono tracking-[0.4em] text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

export default function TwoFactorVerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [method, setMethod] = useState<'email' | 'sms'>('email');
  const [phoneLast4, setPhoneLast4] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    fetch('/api/auth/2fa/status').then(r => r.json()).then(data => {
      if (data?.method) setMethod(data.method);
      if (data?.phoneLast4) setPhoneLast4(data.phoneLast4);
    });
  }, []);

  const submit = async () => {
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError('');
    const res = await fetch('/api/auth/2fa/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Invalid or expired code.'); return; }
    router.push(data.redirect || '/dashboard');
  };

  const resendVia = async (target: 'email' | 'sms') => {
    setResending(true); setError(''); setResent(false);
    const res = await fetch(`/api/auth/2fa/resend?method=${target}`, { method: 'POST' });
    const data = await res.json();
    setResending(false);
    if (!res.ok) { setError(data.error || 'Could not resend code.'); return; }
    setMethod(data.method); setPhoneLast4(data.phoneLast4); setResent(true);
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="font-serif text-[28px] font-medium text-ink leading-tight">GreenReserve</div>
          <p className="text-sm text-ink-muted mt-1">Course Operator Portal</p>
        </div>

        <div className="bg-white border border-line rounded-lg p-6">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-pine"/>
            <h2 className="text-[17px] font-serif font-medium text-ink">Two-factor verification</h2>
          </div>
          <p className="text-sm text-ink-muted mb-5 flex items-center gap-1.5">
            {method === 'sms'
              ? <><Smartphone className="w-3.5 h-3.5 shrink-0"/>We sent a code to your phone{phoneLast4 ? ` ending in ${phoneLast4}` : ''}.</>
              : <><Mail className="w-3.5 h-3.5 shrink-0"/>We sent a code to your email.</>}
          </p>

          {error && <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-3 py-2.5 text-sm mb-4">{error}</div>}
          {resent && !error && <div className="bg-ok/5 border border-ok/20 text-ok rounded-md px-3 py-2.5 text-sm mb-4">New code sent.</div>}

          <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">6-Digit Code</label>
          <input type="text" inputMode="numeric" maxLength={6} value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && submit()}
            className={iCls} placeholder="——————" autoFocus/>

          <button onClick={submit} disabled={loading || code.length !== 6}
            className="mt-4 w-full bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md font-medium text-[12.5px] disabled:opacity-50 transition-colors">
            {loading ? 'Verifying...' : 'Verify & Sign In'}
          </button>

          <div className="mt-5 space-y-2">
            <p className="text-xs text-ink-muted text-center">Didn&apos;t get the code?</p>
            <button onClick={() => resendVia('email')} disabled={resending}
              className={'flex items-center justify-center gap-2 w-full py-2.5 rounded-md text-sm border transition-colors disabled:opacity-50 ' + (method === 'email' ? 'border-pine/30 text-pine bg-pine/5' : 'border-line text-ink-soft hover:border-line-strong hover:text-ink')}>
              <Mail className="w-3.5 h-3.5"/>{resending ? 'Sending...' : 'Send to my email'}
            </button>
            {phoneLast4 && (
              <button onClick={() => resendVia('sms')} disabled={resending}
                className={'flex items-center justify-center gap-2 w-full py-2.5 rounded-md text-sm border transition-colors disabled:opacity-50 ' + (method === 'sms' ? 'border-pine/30 text-pine bg-pine/5' : 'border-line text-ink-soft hover:border-line-strong hover:text-ink')}>
                <Smartphone className="w-3.5 h-3.5"/>{resending ? 'Sending...' : `Send to phone ending in ${phoneLast4}`}
              </button>
            )}
          </div>
          <p className="mt-5 text-center text-xs text-ink-muted">
            <a href="/dashboard/login" className="text-pine font-medium hover:underline">Back to login</a>
          </p>
        </div>
      </div>
    </div>
  );
}
