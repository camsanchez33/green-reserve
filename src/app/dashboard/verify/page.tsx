'use client';
import { useState, Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Mail, Loader2, XCircle } from 'lucide-react';

const RESEND_COOLDOWN_SECONDS = 60;

function VerifyContent() {
  const router = useRouter();
  const params = useSearchParams();
  const urlToken = params.get('token');
  const [status, setStatus] = useState<'idle' | 'verifying' | 'done' | 'error'>('idle');

  const [checkingSession, setCheckingSession] = useState(!urlToken);
  const [email, setEmail] = useState('');
  const [courseIsLive, setCourseIsLive] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (urlToken) { verify(urlToken); return; }

    // No token in the URL — this is a logged-in operator (e.g. signed in with
    // a temp password without clicking the emailed link) who still needs to
    // verify. Load their email + course status for the fallback screen.
    (async () => {
      const profileRes = await fetch('/api/operator/profile');
      if (profileRes.status === 401) { router.push('/dashboard/login'); return; }
      const profile = await profileRes.json();
      if (profile?.emailVerified) { router.push('/dashboard/onboarding'); return; }
      setEmail(profile?.email || '');

      const courseRes = await fetch('/api/operator/courses');
      if (courseRes.ok) {
        const course = await courseRes.json();
        setCourseIsLive(!!course?.active && course?.liveStatus === 'live');
      }
      setCheckingSession(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlToken]);

  useEffect(() => () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); }, []);

  async function verify(token: string) {
    setStatus('verifying');
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setStatus('done');
        const me = await fetch('/api/auth/me');
        if (me.ok) { setTimeout(() => router.push('/dashboard/onboarding'), 1500); }
        else { setTimeout(() => router.push('/dashboard/login?verified=1'), 1500); }
      } else { setStatus('error'); }
    } catch { setStatus('error'); }
  }

  async function resend() {
    setResendState('sending');
    setResendError('');
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setResendState('sent');
        setCooldown(RESEND_COOLDOWN_SECONDS);
        cooldownTimer.current = setInterval(() => {
          setCooldown(c => {
            if (c <= 1) { if (cooldownTimer.current) clearInterval(cooldownTimer.current); return 0; }
            return c - 1;
          });
        }, 1000);
      } else {
        setResendState('error');
        setResendError(data.error || 'Could not send the email. Try again shortly.');
      }
    } catch {
      setResendState('error');
      setResendError('Could not send the email. Try again shortly.');
    }
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="bg-white border border-line rounded-lg p-10 max-w-md w-full text-center">
        {status === 'idle' && !urlToken && (
          checkingSession ? (
            <div className="py-4">
              <Loader2 className="w-8 h-8 text-pine animate-spin mx-auto"/>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 bg-pine/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <Mail className="w-8 h-8 text-pine"/>
              </div>
              <h1 className="text-[22px] font-serif font-medium text-ink mb-2">We sent a link to {email || 'your inbox'}</h1>
              <p className="text-sm text-ink-soft mb-6">
                {courseIsLive
                  ? 'Click the link in that email to confirm it\'s you. Your course is already live — this just secures your account.'
                  : 'Click the link in that email to confirm it\'s you and finish setting up your dashboard.'}
              </p>
              <button
                onClick={resend}
                disabled={resendState === 'sending' || cooldown > 0}
                className="w-full bg-pine hover:bg-pine-hover text-white py-3 rounded-md font-medium text-[13px] disabled:opacity-50 transition-colors"
              >
                {resendState === 'sending' ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the link'}
              </button>
              {resendState === 'sent' && cooldown > 0 && (
                <p className="text-xs text-ok mt-3">Sent — check your inbox (and spam folder).</p>
              )}
              {resendState === 'error' && (
                <p className="text-xs text-bad mt-3">{resendError}</p>
              )}
            </>
          )
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
