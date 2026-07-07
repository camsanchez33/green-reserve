'use client';
import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Mail, Loader2, XCircle } from 'lucide-react';

function VerifyContent() {
  const router = useRouter();
  const params = useSearchParams();
  const urlToken = params.get('token');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (urlToken) verify(urlToken);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken]);

  async function verify(token?: string) {
    setStatus('verifying');
    try {
      let tok = token;
      if (!tok) {
        const tokenRes = await fetch('/api/auth/get-token');
        if (!tokenRes.ok) { setStatus('error'); return; }
        const data = await tokenRes.json();
        tok = data.token;
      }
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok }),
      });
      if (res.ok) {
        setStatus('done');
        const me = await fetch('/api/auth/me');
        if (me.ok) { setTimeout(() => router.push('/dashboard/onboarding'), 1500); }
        else { setTimeout(() => router.push('/dashboard/login?verified=1'), 1500); }
      } else { setStatus('error'); }
    } catch { setStatus('error'); }
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="bg-white border border-line rounded-lg p-10 max-w-md w-full text-center">
        {status === 'idle' && !urlToken && (
          <>
            <div className="w-16 h-16 bg-pine/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <Mail className="w-8 h-8 text-pine"/>
            </div>
            <h1 className="text-[22px] font-serif font-medium text-ink mb-2">Confirm your email</h1>
            <p className="text-sm text-ink-soft mb-2">Your email must be verified before your course can go live on GreenReserve.</p>
            <p className="text-xs text-ink-muted mb-8 bg-paper border border-line rounded-md p-3">In production, a link gets sent to your inbox. Click below to verify instantly.</p>
            <button onClick={() => verify()} className="w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] transition-colors">
              Verify My Email
            </button>
          </>
        )}
        {status === 'verifying' && (
          <div className="py-4">
            <Loader2 className="w-12 h-12 text-pine animate-spin mx-auto mb-4"/>
            <p className="text-ink-soft text-sm">Verifying your email...</p>
          </div>
        )}
        {status === 'done' && (
          <div className="py-4">
            <div className="w-16 h-16 bg-ok/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-ok"/>
            </div>
            <h2 className="text-[18px] font-serif font-medium text-ink">Email verified</h2>
            <p className="text-ink-muted text-sm mt-2">Redirecting to setup...</p>
          </div>
        )}
        {status === 'error' && (
          <div className="py-4">
            <div className="w-16 h-16 bg-bad/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-bad"/>
            </div>
            <p className="text-bad font-medium mb-2">Verification failed.</p>
            <p className="text-ink-muted text-sm mb-4">The link may have expired or already been used.</p>
            <button onClick={() => router.push('/dashboard/login')} className="text-pine underline text-sm">Go to login</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return <Suspense><VerifyContent/></Suspense>;
}
