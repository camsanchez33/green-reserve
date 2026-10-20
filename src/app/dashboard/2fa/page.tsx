'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthPhotoShell } from '@/components/AuthPhotoShell';


const iCls = 'w-full bg-paper border border-line rounded-md px-4 py-3 text-center text-2xl font-mono tracking-[0.4em] text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

export default function TwoFactorVerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [method, setMethod] = useState<'email' | 'sms'>('email');
  const [phoneLast4, setPhoneLast4] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState('');
  const [resending, setResending] = useState<'' | 'email' | 'sms'>('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetch('/api/auth/2fa/status').then(r => r.json()).then(data => {
      if (data?.method) setMethod(data.method);
      if (data?.phoneLast4) setPhoneLast4(data.phoneLast4);
      if (data?.emailHint) setEmailHint(data.emailHint);
    }).catch(() => { /* the page still works; it just names the channel generically */ });
  }, []);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/2fa/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'That code didn’t work. Check it, or send a new one below.'); setLoading(false); return; }
      router.push(data.redirect || '/dashboard');
    } catch {
      setError('Couldn’t reach GreenReserve. Check your connection and try again.');
      setLoading(false);
    }
  };

  // Cam 2026-10-19: the code is sent automatically at sign-in — these only send a NEW one.
  const resendVia = async (target: 'email' | 'sms') => {
    setResending(target); setError(''); setNotice('');
    try {
      const res = await fetch(`/api/auth/2fa/resend?method=${target}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Couldn’t send a new code. Try again in a minute.'); return; }
      setMethod(data.method); if (data.phoneLast4) setPhoneLast4(data.phoneLast4); setCode('');
      // A text that fails falls back to email on the server — say so, don't pretend it was texted.
      setNotice(target === 'sms' && data.method !== 'sms'
        ? 'We couldn’t text you, so we emailed a new code instead.'
        : data.method === 'sms' ? `New code texted to the phone ending in ${data.phoneLast4}.` : 'New code emailed. Your earlier code no longer works.');
    } catch {
      setError('Couldn’t reach GreenReserve. Check your connection and try again.');
    } finally {
      setResending('');
    }
  };

  const where = method === 'sms'
    ? `We texted a 6-digit code to the phone ending in ${phoneLast4 ?? '••••'}.`
    : `We emailed a 6-digit code to ${emailHint || 'the email on your account'}.`;

  return (
    <AuthPhotoShell>
        <form onSubmit={submit} className="bg-white rounded-lg shadow-card p-6 sm:p-7">
          <div className="mb-5">
            <h1 className="text-[28px] font-serif font-semibold leading-none tracking-tight text-ink">{method === 'sms' ? 'Check your phone' : 'Check your email'}</h1>
            <p className="text-[14px] text-ink-soft mt-3 leading-relaxed">{where} It works for 10 minutes.</p>
          </div>
          {error && <div className="bg-white border border-line border-l-[3px] border-l-bad text-bad rounded-md px-3 py-2.5 text-[13.5px] mb-4" role="alert">{error}</div>}
          {notice && !error && <div className="bg-white border border-line border-l-[3px] border-l-ok text-ink rounded-md px-3 py-2.5 text-[13.5px] mb-4" role="status">{notice}</div>}

          <label htmlFor="tfa-code" className="block text-[13px] font-semibold text-ink mb-1.5">Code</label>
          <input id="tfa-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={iCls} placeholder="——————" autoFocus/>

          <button type="submit" disabled={loading || code.length !== 6}
            className="mt-4 w-full bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md font-medium text-[13.5px] disabled:opacity-50 transition-colors">
            {loading ? 'Checking…' : 'Sign in'}
          </button>

          <div className="mt-6 pt-5 border-t border-line-soft">
            <p className="text-[13px] text-ink-soft mb-2.5">Didn&apos;t get it? Check spam, or get a new code:</p>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => resendVia('email')} disabled={!!resending}
                className="w-full py-2.5 rounded-md text-[13.5px] border border-line text-ink hover:border-line-strong transition-colors disabled:opacity-50">
                {resending === 'email' ? 'Sending…' : 'Email me a new code'}
              </button>
              {phoneLast4 ? (
                <button type="button" onClick={() => resendVia('sms')} disabled={!!resending}
                  className="w-full py-2.5 rounded-md text-[13.5px] border border-line text-ink hover:border-line-strong transition-colors disabled:opacity-50">
                  {resending === 'sms' ? 'Sending…' : `Text a code to the phone ending in ${phoneLast4}`}
                </button>
              ) : (
                <p className="text-[12.5px] text-ink-muted leading-relaxed">To get codes by text, add your phone in Settings → Two-factor authentication once you&apos;re signed in.</p>
              )}
            </div>
          </div>
          <p className="mt-5 text-center text-[13px]">
            <a href="/dashboard/login" className="text-pine font-medium hover:underline">Back to sign in</a>
          </p>
        </form>
    </AuthPhotoShell>
  );
}
