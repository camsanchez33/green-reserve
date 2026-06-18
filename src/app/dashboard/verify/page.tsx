'use client';
import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Mail, Loader2 } from 'lucide-react';

function VerifyContent() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'verifying' | 'done' | 'error'>('idle');

  async function verify() {
    setStatus('verifying');
    try {
      const tokenRes = await fetch('/api/auth/get-token');
      if (!tokenRes.ok) { setStatus('error'); return; }
      const { token } = await tokenRes.json();
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setStatus('done');
        setTimeout(() => router.push('/dashboard/onboarding'), 1500);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-[#0a1f0f] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
        {status === 'idle' && (
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
            <button onClick={verify} className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors">
              Verify My Email
            </button>
          </>
        )}
        {status === 'verifying' && (
          <div className="py-4">
            <Loader2 className="w-12 h-12 text-green-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Verifying...</p>
          </div>
        )}
        {status === 'done' && (
          <div className="py-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900">Email verified!</h2>
            <p className="text-gray-500 mt-2">Taking you to setup...</p>
          </div>
        )}
        {status === 'error' && (
          <div className="py-4">
            <p className="text-red-600 font-medium mb-4">Something went wrong.</p>
            <button onClick={() => router.push('/dashboard/login')} className="text-green-600 underline text-sm">
              Back to login
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
