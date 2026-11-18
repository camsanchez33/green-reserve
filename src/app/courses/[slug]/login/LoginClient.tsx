'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { golferLookVars, type CourseLook } from '@/components/golfer/look';
import { CourseFooter } from '@/components/golfer/CourseFrame';
import type { CancelPolicy } from '@/lib/cancel-policy';
import g from '@/components/golfer/golfer.module.css';
import { loginLine, safeBack, loginOffered } from './login-helpers';

export type LoginCourse = {
  name: string; slug: string; type: string; brand_color?: string; booking_look?: CourseLook;
  address?: string; city?: string; state?: string; phone?: string; website?: string;
  cancellation_hours?: number; late_cancellation_fee?: number; cancel_policy?: CancelPolicy;
  has_member_pricing?: boolean;
  /** Course.memberLoginOn (Settings "Show Log in on your booking page", #495). Absent = off (loginOffered). */
  member_login_on?: boolean;
  /** The groups that can log in here (loginGroups, #495). Absent or empty = no Log in (loginOffered). */
  login_groups?: ('members' | 'residents')[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function LoginClient({ course, back }: { course: LoginCourse; back: string }) {
  const router = useRouter();
  const slug = course.slug;
  const backHref = safeBack(back, slug);
  const backLabel = backHref.startsWith('/book?') ? 'Back to your booking' : 'Back to tee times';
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [formErr, setFormErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'' | 'send' | 'verify'>('');
  // #490: the first-log-in box is asked for only after a right code (409 terms_required); the same code is sent again.
  const [needTerms, setNeedTerms] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [termsErr, setTermsErr] = useState('');
  const headRef = useRef<HTMLHeadingElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Already logged in here: nothing to do on this page.
  useEffect(() => {
    let live = true;
    fetch(`/api/member/${encodeURIComponent(slug)}/session`).then(r => { if (live && r.ok) router.replace(backHref); }).catch(() => {});
    return () => { live = false; };
  }, [slug, backHref, router]);

  const loginOff = !loginOffered(course);

  async function sendCode(again = false) {
    setFormErr(''); setNote('');
    const v = email.trim();
    if (!EMAIL.test(v)) { setEmailErr('Enter your email address, like name@domain.com.'); emailRef.current?.focus(); return; }
    setEmailErr('');
    setBusy('send');
    try {
      const r = await fetch(`/api/member/${encodeURIComponent(slug)}/send-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: v, mode: 'code' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFormErr(d.error || 'That didn’t go through. Try again.'); setTimeout(() => emailRef.current?.focus(), 0); return; }
      setStep('code'); setCode(''); setCodeErr(''); setNeedTerms(false); setAgreed(false); setTermsErr('');
      if (again) setNote('If that address can log in, a new code is on its way.');
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch {
      setFormErr('Network error: the code was not sent. Check your connection and try again.');
      setTimeout(() => emailRef.current?.focus(), 0);
    } finally { setBusy(''); }
  }

  async function verify() {
    setFormErr(''); setNote('');
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) { setCodeErr('Enter the 6 digits from the message.'); codeRef.current?.focus(); return; }
    if (needTerms && !agreed) { setTermsErr('Tick the box to agree before you log in.'); return; }
    setCodeErr(''); setTermsErr('');
    setBusy('verify');
    try {
      const r = await fetch(`/api/member/${encodeURIComponent(slug)}/verify-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: digits, ...(needTerms ? { agreeTerms: agreed } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { router.replace(backHref); router.refresh(); return; }
      if (r.status === 409 && d.code === 'terms_required') { setNeedTerms(true); setAgreed(false); return; }
      if (d.code === 'bad_code') { setCodeErr(d.error || 'That code didn’t work. Check it, or send a new one.'); codeRef.current?.focus(); return; }
      setFormErr(d.error || 'That didn’t go through. Try again.');
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch {
      setFormErr('Network error: you are not logged in yet. Check your connection and try again.');
      setTimeout(() => codeRef.current?.focus(), 0);
    } finally { setBusy(''); }
  }

  useEffect(() => { headRef.current?.focus(); }, []);

  return (
    <div className={g.root} style={golferLookVars(course)}>
      <div className={g.site}>
        <header className={g.top}><h1><Link href={`/courses/${slug}`}>{course.name}</Link></h1></header>
        <main className={g.wrap}>
          <div className={g.bk} style={{ maxWidth: 440 }}>
            <Link href={backHref} className={`${g.lnk} ${g.back}`}>‹ {backLabel}</Link>
            <h2 ref={headRef} tabIndex={-1}>Log in to {course.name}</h2>
            <p className={g.pol}>{loginLine(course.name, course.login_groups)} No account needed to book a tee time.</p>

            {loginOff ? (
              <p className={g.pol} role="status">{course.name} doesn&rsquo;t offer log-in online. Ask the pro shop for your rate.</p>
            ) : step === 'email' ? (
              <form noValidate onSubmit={e => { e.preventDefault(); sendCode(); }}>
                <div className={g.inp}>
                  <label className={g.lab} htmlFor="li-email">Email</label>
                  <input id="li-email" ref={emailRef} type="email" autoComplete="email" value={email}
                    onChange={e => { setEmail(e.target.value); if (emailErr) setEmailErr(''); }}
                    aria-invalid={emailErr ? true : undefined} aria-describedby="li-email-err" />
                  <div className={g.err} id="li-email-err" role="alert">{emailErr}</div>
                </div>
                {formErr && <p className={g.formerr} role="alert">{formErr}</p>}
                <button className={g.btn} type="submit" disabled={!!busy}>{busy === 'send' ? 'Sending…' : 'Send code'}</button>
              </form>
            ) : (
              <>
                <p className={g.pol} role="status">If <b>{email.trim()}</b> is on {course.name}&rsquo;s list, we sent a 6-digit code. It works for 10 minutes.</p>
                <form noValidate onSubmit={e => { e.preventDefault(); verify(); }}>
                  <div className={g.inp}>
                    <label className={g.lab} htmlFor="li-code">6-digit code</label>
                    <input id="li-code" ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                      onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); if (codeErr) setCodeErr(''); }}
                      aria-invalid={codeErr ? true : undefined} aria-describedby="li-code-err"
                      style={{ letterSpacing: '.3em', fontSize: 20 }} />
                    <div className={g.err} id="li-code-err" role="alert">{codeErr}</div>
                  </div>
                  {needTerms && (
                    <div>
                      <label className={g.agree}>
                        <input type="checkbox" checked={agreed} onChange={e => { setAgreed(e.target.checked); if (e.target.checked) setTermsErr(''); }}
                          aria-describedby={agreed ? 'li-terms-err' : 'li-terms-hint li-terms-err'} autoFocus />
                        <span>I agree to GreenReserve&rsquo;s <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>, and that {course.name} and GreenReserve keep my booking history.</span>
                      </label>
                      <div className={g.err} id="li-terms-err" role="alert">{termsErr}</div>
                    </div>
                  )}
                  {formErr && <p className={g.formerr} role="alert">{formErr}</p>}
                  {needTerms && !agreed && <p className={g.hintline} id="li-terms-hint">Tick the box to agree before you log in.</p>}
                  <button className={g.btn} type="submit" disabled={!!busy || (needTerms && !agreed)} aria-describedby={needTerms && !agreed ? 'li-terms-hint' : undefined}>{busy === 'verify' ? 'Logging in…' : 'Log in'}</button>
                </form>
                {note && <p className={g.pol} role="status">{note}</p>}
                <p className={g.pol}>
                  <button className={g.lnk} type="button" disabled={!!busy} onClick={() => sendCode(true)}>Send a new code</button>
                  {' · '}
                  <button className={g.lnk} type="button" onClick={() => { setStep('email'); setFormErr(''); setNote(''); setTimeout(() => emailRef.current?.focus(), 0); }}>Use a different email</button>
                </p>
              </>
            )}

            <p className={g.pol} style={{ marginTop: 18 }}>Not set up? Ask the pro shop.</p>
            <p className={g.pol}>Booking as a guest is fine, no account needed. <Link className={g.lnk} href={backHref}>{backLabel}</Link></p>
          </div>
        </main>
      </div>
      <CourseFooter course={course} accent={course.brand_color || '#173B2A'} />
    </div>
  );
}
