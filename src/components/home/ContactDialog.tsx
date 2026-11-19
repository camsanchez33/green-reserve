'use client';
import { useRef, useState } from 'react';
import s from '@/app/home.module.css';

// "Contact us" (homepage redo, Cam 2026-11-18): the question form as a pop-up over the page. It posts to the
// existing inquiry intake (/api/inquiries), so the question lands in admin Inquiries like the /for-courses
// form's. The intake needs a first and last name and the course's town and state (its duplicate check is
// course + town + state), so the form asks for those beside the mockup's name, email, course and message.
// A native modal <dialog>: the page behind is inert, Escape closes it, focus returns to the button.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ContactDialog() {
  const dlg = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const hp = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({ name: '', email: '', course: '', city: '', state: '', message: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(v => ({ ...v, [k]: e.target.value }));

  const open = () => { setErr(''); setSent(false); dlg.current?.showModal(); };
  const close = () => dlg.current?.close();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = f.name.trim().replace(/\s+/g, ' ');
    const cut = name.lastIndexOf(' ');
    const miss: string[] = [];
    if (cut < 1) miss.push('your first and last name');
    if (!EMAIL_RE.test(f.email.trim())) miss.push('an email we can reply to');
    if (!f.course.trim()) miss.push('your course');
    if (!f.city.trim() || !f.state.trim()) miss.push('its town and state');
    if (!f.message.trim()) miss.push('a message');
    if (miss.length) { setErr(`Add ${miss.join(', ')}, then send.`); return; }
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: name.slice(0, cut), lastName: name.slice(cut + 1), email: f.email.trim(),
          courseName: f.course.trim(), city: f.city.trim(), state: f.state.trim(), additionalNotes: f.message.trim(),
          hp: hp.current?.value ?? '',
        }),
      });
      // Cleared, so reopening starts fresh and a second Send can't post the same question twice.
      if (res.ok) { setSent(true); setF({ name: '', email: '', course: '', city: '', state: '', message: '' }); return; }
      const d = await res.json().catch(() => ({} as { error?: string }));
      setErr(res.status === 429 && d.error ? d.error
        : d.error === 'invalid_email' ? 'That email doesn’t look right. Check it, then send.'
        : 'It didn’t send. Try again in a moment.');
    } catch {
      setErr('It didn’t send. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <button ref={opener} className={`${s.btn} ${s.ghost}`} type="button" onClick={open} aria-haspopup="dialog">Contact us</button>
      <dialog ref={dlg} className={s.cdlg} aria-labelledby="cdlgH" onClose={() => opener.current?.focus()}
        onClick={e => { if (e.target === dlg.current) close(); }}>
        <div className={s.cdlgHd}>
          <h2 id="cdlgH" className={s.display}>Contact us</h2>
          <button type="button" className={s.cdlgX} onClick={close} aria-label="Close">×</button>
        </div>
        {sent ? (
          <div className={s.cdlgBody}>
            <p className={s.sentNote} role="status">Sent. We&apos;ll reply to the email you gave us.</p>
            <button className={`${s.btn} ${s.ghost}`} type="button" onClick={close}>Close</button>
          </div>
        ) : (
          <form className={s.cdlgBody} onSubmit={submit} noValidate>
            <div className={s.f2}>
              <label htmlFor="cName">Your name<input id="cName" autoComplete="name" value={f.name} onChange={set('name')} /></label>
              <label htmlFor="cEmail">Email<input id="cEmail" type="email" autoComplete="email" value={f.email} onChange={set('email')} /></label>
            </div>
            <label htmlFor="cCourse">Course<input id="cCourse" autoComplete="organization" value={f.course} onChange={set('course')} /></label>
            <div className={s.f2}>
              <label htmlFor="cCity">Town<input id="cCity" autoComplete="address-level2" value={f.city} onChange={set('city')} /></label>
              <label htmlFor="cState">State<input id="cState" autoComplete="address-level1" value={f.state} onChange={set('state')} /></label>
            </div>
            <label htmlFor="cMsg">Message<textarea id="cMsg" value={f.message} onChange={set('message')} /></label>
            <input ref={hp} type="text" name="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" className={s.sr} />
            {err && <p className={s.errNote} role="alert">{err}</p>}
            <div><button className={s.btn} type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button></div>
          </form>
        )}
      </dialog>
    </>
  );
}
