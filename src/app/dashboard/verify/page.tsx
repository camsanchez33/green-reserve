'use client';
import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Mail, Loader2, XCircle } from 'lucide-react';

function VerifyContent() {
  const router = useRouter();
  const params = useSearchParams();
  const urlToken = params.get('token');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'done' | 'error'>('idle');

  // Auto-verify if token is in URL (admin setup link flow)
  useEffect(() => {
    if (urlToken) verify(urlToken);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken]);

  async function verify(token?: string) {
    setStatus('verifying');
    try {
      let tok = token;
      if (!tok) {
        // Fallback: get token from current session
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
        // If they aren't logged in yet, send to login; otherwise go to onboarding
        const me = await fetch('/api/auth/me');
        if (me.ok) {
          setTimeout(() => router.push('/dashboard/onboarding'), 1500);
        } else {
          setTimeout(() => router.push('/dashboard/login?verified=1'), 1500);
        }
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-10 max-w-md w-full text-center shadow-2xl">
        {status === 'idle' && !urlToken && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <Mail className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">Confirm your email</h1>
            <p className="text-gray-500 mb-2 text-sm">
              Your email must be verified before your course can go live on Green Reserve.
            </p>
            <p className="text-xs text-gray-400 mb-8 bg-gray-50 rounded-lg p-3">
              📬 In production, a link gets sent to your inbox. Click below to verify instantly.
            </p>
            <button onClick={() => verify()} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors">
              Verify My Email
            </button>
          </>
        )}
        {status === 'verifying' && (
          <div className="py-4">
            <Loader2 className="w-12 h-12 text-green-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Verifying your email...</p>
          </div>
        )}
        {status === 'done' && (
          <div className="py-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900">Email verified!</h2>
            <p className="text-gray-500 mt-2">Redirecting to setup...</p>
          </div>
        )}
        {status === 'error' && (
          <div className="py-4">
            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <p className="text-red-600 font-medium mb-2">Verification failed.</p>
            <p className="text-gray-500 text-sm mb-4">The link may have expired or already been used.</p>
            <button onClick={() => router.push('/dashboard/login')} className="text-green-600 underline text-sm">
              Go to login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return <Suspense><VerifyContent /></Suspense>;
}
