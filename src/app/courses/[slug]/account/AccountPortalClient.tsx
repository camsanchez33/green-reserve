'use client';
import { use, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, AlertCircle, CheckCircle, Mail, ArrowLeft, LogOut, Receipt,
} from 'lucide-react';

type PortalBooking = {
  id: string; date: string; time: string; holes?: number;
  players: number; totalAmount: number; status: string;
  checkedInAt?: string | null; checkInToken: string | null;
};

type PortalData = {
  course: { name: string; slug: string; brandColor: string; logoUrl: string };
  golfer: { firstName: string; lastName: string; email: string };
  upcoming: PortalBooking[];
  past: PortalBooking[];
  membership: { tierName: string } | null;
};

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function dollars(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function SignIn({ courseName, courseSlug, accent, prefillEmail, onSignedIn }: {
  courseName: string; courseSlug: string; accent: string; prefillEmail: string; onSignedIn: () => void;
}) {
  const [identifier, setIdentifier] = useState(prefillEmail);
  const [step, setStep] = useState<'identifier' | 'code'>('identifier');
  const [challengeToken, setChallengeToken] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  async function requestCode() {
    if (!identifier.trim()) return;
    setSending(true); setError('');
    try {
      const res = await fetch('/api/golfer/auth/otp/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), courseName }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not send a code.'); setSending(false); return; }
      setChallengeToken(data.challengeToken);
      setStep('code');
    } catch { setError('Something went wrong. Try again.'); }
    setSending(false);
  }

  async function verifyCode() {
    if (!code.trim()) return;
    setVerifying(true); setError('');
    try {
      const res = await fetch('/api/golfer/auth/otp/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken, code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Incorrect code.'); setVerifying(false); return; }
      onSignedIn();
    } catch { setError('Something went wrong. Try again.'); }
    setVerifying(false);
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white rounded-lg border border-line p-8">
        <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-5" style={{ backgroundColor: accent + '14', color: accent }}>
          <Mail className="w-6 h-6" />
        </div>
        <h1 className="text-[20px] font-serif font-medium text-ink mb-1">Sign in to {courseName}</h1>
        <p className="text-sm text-ink-soft mb-6">View and manage your tee times here.</p>

        {step === 'identifier' ? (
          <>
            <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Email or phone</label>
            <input
              value={identifier} onChange={e => setIdentifier(e.target.value)}
              placeholder="you@example.com" className={iCls}
              onKeyDown={e => e.key === 'Enter' && requestCode()}
            />
            {error && <p className="text-bad text-sm mt-2">{error}</p>}
            <button
              onClick={requestCode} disabled={sending || !identifier.trim()}
              className="w-full mt-4 py-3 rounded-md font-medium text-white text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: accent }}
            >
              {sending ? <><Loader2 size={16} className="animate-spin" /> Sending...</> : 'Send me a code'}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft mb-3">We sent a 6-digit code to <strong className="text-ink">{identifier}</strong>.</p>
            <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-1.5">Code</label>
            <input
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456" inputMode="numeric" className={iCls + ' tracking-[0.3em] text-center'}
              onKeyDown={e => e.key === 'Enter' && verifyCode()}
              autoFocus
            />
            {error && <p className="text-bad text-sm mt-2">{error}</p>}
            <button
              onClick={verifyCode} disabled={verifying || code.length !== 6}
              className="w-full mt-4 py-3 rounded-md font-medium text-white text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: accent }}
            >
              {verifying ? <><Loader2 size={16} className="animate-spin" /> Verifying...</> : 'Verify & sign in'}
            </button>
            <button onClick={() => { setStep('identifier'); setCode(''); setError(''); }} className="w-full mt-3 text-xs text-ink-muted hover:text-ink transition-colors">
              Use a different email or phone
            </button>
          </>
        )}

        <Link href={`/courses/${courseSlug}`} className="block text-center text-sm text-ink-muted hover:text-ink-soft mt-6 transition-colors">
          &larr; Back to {courseName}
        </Link>
      </div>
    </div>
  );
}

function PortalInner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const search = useSearchParams();
  const prefillEmail = search.get('email') || '';

  const [data, setData] = useState<PortalData | null>(null);
  const [publicCourse, setPublicCourse] = useState<{ name: string; brand_color?: string; logo_url?: string } | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    fetch(`/api/courses/${slug}/account`)
      .then(async r => {
        if (r.status === 401) { setNeedsSignIn(true); return null; }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(d => { if (d) { setData(d); setNeedsSignIn(false); } })
      .catch(() => setError('Could not load your account. Try again shortly.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetch(`/api/courses/${slug}`).then(r => r.ok ? r.json() : null).then(c => { if (c) setPublicCourse(c); }).catch(() => {});
  }, [slug]);

  useEffect(load, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() {
    await fetch('/api/golfer/auth/logout', { method: 'POST' });
    setData(null);
    setNeedsSignIn(true);
  }

  if (loading) {
    return <div className="min-h-screen bg-paper flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink-muted" /></div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-lg border border-line p-8 text-center">
          <AlertCircle className="w-8 h-8 text-bad mx-auto mb-3" />
          <p className="text-ink-soft text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (needsSignIn || !data) {
    return (
      <SignIn
        courseName={publicCourse?.name || 'your course'}
        courseSlug={slug}
        accent={publicCourse?.brand_color || '#24513B'}
        prefillEmail={prefillEmail}
        onSignedIn={load}
      />
    );
  }

  const accent = data.course.brandColor || '#24513B';

  return (
    <div className="min-h-screen bg-paper">
      <div className="border-b border-line bg-white">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center justify-between">
          <div>
            <Link href={`/courses/${slug}`} className="text-xs text-ink-muted hover:text-ink flex items-center gap-1 mb-1.5 transition-colors">
              <ArrowLeft size={12} /> {data.course.name}
            </Link>
            <h1 className="text-[20px] font-serif font-medium text-ink">Hi, {data.golfer.firstName}</h1>
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {data.membership && (
          <div className="rounded-md px-4 py-3 flex items-center gap-2 text-sm" style={{ backgroundColor: accent + '0d', color: accent }}>
            <CheckCircle size={16} />
            <span>Member &mdash; {data.membership.tierName}</span>
          </div>
        )}

        <section>
          <h2 className="text-[13px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-3">Upcoming tee times</h2>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-ink-faint">No upcoming tee times at {data.course.name}.</p>
          ) : (
            <div className="space-y-3">
              {data.upcoming.map(b => (
                <div key={b.id} className="bg-white border border-line rounded-lg p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-ink">{fmtDate(b.date)} &middot; {fmtTime(b.time)}</div>
                    <div className="text-sm text-ink-muted">{b.players} player{b.players !== 1 ? 's' : ''} &middot; {dollars(b.totalAmount)} at check-in</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!b.checkedInAt && b.checkInToken && (
                      <Link href={`/checkin/${b.id}?token=${b.checkInToken}`} className="text-xs font-medium text-white px-3 py-2 rounded-md transition-colors" style={{ backgroundColor: accent }}>
                        Check in
                      </Link>
                    )}
                    <Link href={`/manage/${b.id}`} className="text-xs font-medium text-ink-soft bg-paper border border-line hover:border-line-strong px-3 py-2 rounded-md transition-colors">
                      Manage
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-[13px] uppercase tracking-[0.06em] text-ink-muted font-medium mb-3">Past rounds</h2>
          {data.past.length === 0 ? (
            <p className="text-sm text-ink-faint">No past rounds at {data.course.name} yet.</p>
          ) : (
            <div className="space-y-2">
              {data.past.map(b => (
                <div key={b.id} className="bg-white border border-line rounded-lg px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-ink">{fmtDate(b.date)} &middot; {fmtTime(b.time)}</div>
                    <div className="text-xs text-ink-muted">{b.players} player{b.players !== 1 ? 's' : ''} &middot; {dollars(b.totalAmount)} &middot; <span className="capitalize">{b.status}</span></div>
                  </div>
                  {b.checkInToken && (
                    <Link href={`/receipt/${b.id}?token=${b.checkInToken}`} className="flex items-center gap-1 text-xs text-pine hover:text-pine-hover shrink-0 transition-colors">
                      <Receipt size={13} /> Receipt
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function AccountPortalClient({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <PortalInner params={params} />
    </Suspense>
  );
}
