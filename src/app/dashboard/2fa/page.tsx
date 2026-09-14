'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
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
        {/* U-O (§1b, canvas "Sign in + 2FA"): same header shape as the sign-in
            board — eyebrow, serif title, one sentence saying where the code went. */}
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.1em] text-ink-muted flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-pine"/>Course operator portal
          </div>
          <h1 className="text-[30px] font-serif font-medium leading-none tracking-tight text-ink mt-2">Two-factor verification</h1>
          <p className="text-[13.5px] text-ink-soft mt-2 flex items-center gap-1.5">
            {method === 'sms'
              ? <><Smartphone className="w-3.5 h-3.5 shrink-0"/>We sent a code to your phone{phoneLast4 ? ` ending in ${phoneLast4}` : ''}.</>
              : <><Mail className="w-3.5 h-3.5 shrink-0"/>We sent a code to your email.</>}
          </p>
        </div>

        <div className="bg-white border border-line rounded-lg p-6">
          {error && <div className="bg-white border border-line border-l-[3px] border-l-bad text-bad rounded-md px-3 py-2.5 text-[13.5px] mb-4" role="alert">{error}</div>}
          {resent && !error && <div className="bg-white border border-line border-l-[3px] border-l-ok text-ok rounded-md px-3 py-2.5 text-[13.5px] mb-4" role="status">New code sent.</div>}

          <label className="block text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-1.5">6-Digit Code</label>
          <input type="text" inputMode="numeric" maxLength={6} value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && submit()}
            className={iCls} placeholder="——————" autoFocus/>

          <button onClick={submit} disabled={loading || code.length !== 6}
            className="mt-4 w-full bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md font-medium text-[12.5px] disabled:opacity-50 transition-colors">
            {loading ? 'Verifying...' : 'Verify & Sign In'}
          </button>

          <div className="mt-5 space-y-2">
            <p className="text-[12.5px] text-ink-muted text-center">Didn&apos;t get the code?</p>
            <button onClick={() => resendVia('email')} disabled={resending}
              className={'flex items-center justify-center gap-2 w-full py-2.5 rounded-md text-[13.5px] border transition-colors disabled:opacity-50 ' + (method === 'email' ? 'border-pine/30 text-pine bg-pine/5' : 'border-line text-ink-soft hover:border-line-strong hover:text-ink')}>
              <Mail className="w-3.5 h-3.5"/>{resending ? 'Sending...' : 'Send to my email'}
            </button>
            {phoneLast4 && (
              <button onClick={() => resendVia('sms')} disabled={resending}
                className={'flex items-center justify-center gap-2 w-full py-2.5 rounded-md text-[13.5px] border transition-colors disabled:opacity-50 ' + (method === 'sms' ? 'border-pine/30 text-pine bg-pine/5' : 'border-line text-ink-soft hover:border-line-strong hover:text-ink')}>
                <Smartphone className="w-3.5 h-3.5"/>{resending ? 'Sending...' : `Send to phone ending in ${phoneLast4}`}
              </button>
            )}
          </div>
          <p className="mt-5 text-center text-[12.5px] text-ink-muted">
            <a href="/dashboard/login" className="text-pine font-medium hover:underline">Back to login</a>
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={190} height={36} priority className="w-[130px] max-w-full h-auto opacity-60" />
        </div>
      </div>
    </div>
  );
}
