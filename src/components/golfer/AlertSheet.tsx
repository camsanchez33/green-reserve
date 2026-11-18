'use client';
import { useEffect, useRef, useState } from 'react';
import { alertSmsConsentText } from '@/lib/sms-consent-copy';
import g from './golfer.module.css';

// Tee time alerts (Cam 2026-11-18, lanes/golfer.md item 7; lanes/golfer/login-alerts-mockup.html "alert sheet"), on
// #486's POST /api/alerts. No log-in needed. It opens over the booking page (a right panel on a laptop, sliding up on
// a phone), pre-filled with the day, the time of day and the players, and focus goes back to whatever opened it.
// A logged-in member's alert is on at once; a guest confirms by an emailed link. First come, first served.

export type AlertPartKey = 'morning' | 'midday' | 'afternoon';
const PARTS: { key: AlertPartKey; api: 'morning' | 'midday' | 'late'; label: string; hint: string }[] = [
  // The same edges as the tee time cards and lib/tee-time-alerts partOf (11:00 and 14:00).
  { key: 'morning', api: 'morning', label: 'Morning', hint: 'Before 11 AM' },
  { key: 'midday', api: 'midday', label: 'Mid day', hint: '11 AM–2 PM' },
  { key: 'afternoon', api: 'late', label: 'Afternoon', hint: 'After 2 PM' },
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_DATES = 14; // lib/tee-time-alerts MAX_ALERT_DATES

export type AlertSheetOpen = {
  /** The day the golfer was looking at (YYYY-MM-DD). */
  day: string;
  parts: AlertPartKey[];
  players: number;
  /** A full tee time ("Tell me if it opens"): this time on this day, with an option for its part of the day. */
  slot?: { id: string; time: string; label: string; part: AlertPartKey };
};

function partOf(time: string): AlertPartKey {
  const hm = time.slice(0, 5);
  return hm < '11:00' ? 'morning' : hm < '14:00' ? 'midday' : 'afternoon';
}
export { partOf as alertPartOf };

function shortDate(ds: string) {
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function mask(email: string) {
  const [u, d] = email.split('@');
  return `${(u || '').slice(0, 1)}•••@${d || ''}`;
}

export default function AlertSheet({ open, onClose, course, days, memberEmail }: {
  open: AlertSheetOpen;
  onClose: () => void;
  course: { id: string; name: string };
  /** Bookable days for this golfer, today first (the window), YYYY-MM-DD. */
  days: string[];
  /** Logged in at this course: the alert goes to this email and is on at once. */
  memberEmail: string | null;
}) {
  const slot = open.slot;
  // Only a day the grid offers starts picked (a day outside it could never be unticked).
  const [dates, setDates] = useState<string[]>(days.includes(open.day) ? [open.day] : []);
  const [parts, setParts] = useState<AlertPartKey[]>(open.parts.length ? open.parts : PARTS.map(p => p.key));
  const [players, setPlayers] = useState(Math.min(4, Math.max(1, open.players)));
  const [wide, setWide] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [textOk, setTextOk] = useState(false);
  const [err, setErr] = useState<{ dates?: string; parts?: string; email?: string; phone?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ active: boolean; to: string; phone: string | null; what: string; ends: string } | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { headRef.current?.focus(); }, [done]);
  // Escape closes; Tab stays inside the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (!busy) onClose(); return; }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const items = Array.from(boxRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled])')).filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && at <= 0) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (at === -1 || at === items.length - 1)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const pl = `${players} ${players === 1 ? 'player' : 'players'}`;
  const what = slot
    ? `${wide ? `a ${PARTS.find(p => p.key === slot.part)!.label.toLowerCase()} time` : slot.label} for ${pl} on ${shortDate(open.day)}`
    : `${parts.length === PARTS.length ? 'a time' : `a ${parts.map(k => PARTS.find(p => p.key === k)!.label.toLowerCase()).join(' or ')} time`} for ${pl} on ${[...dates].sort().map(shortDate).join(', ')}`;

  function toggleDate(d: string) {
    setErr(e => ({ ...e, dates: undefined }));
    // At the limit the tap is refused, and said.
    if (!dates.includes(d) && dates.length >= MAX_DATES) { setErr(e => ({ ...e, dates: `An alert holds up to ${MAX_DATES} dates. Untick one to add another.` })); return; }
    setDates(cur => cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d]);
  }
  function togglePart(k: AlertPartKey) {
    setErr(e => ({ ...e, parts: undefined }));
    setParts(cur => cur.includes(k) ? cur.filter(x => x !== k) : PARTS.map(p => p.key).filter(x => x === k || cur.includes(x)));
  }

  async function submit() {
    const next: typeof err = {};
    if (!slot && !dates.length) next.dates = 'Choose at least one date.';
    if (!slot && !parts.length) next.parts = 'Choose at least one time of day.';
    if (!memberEmail) {
      const v = email.trim();
      next.email = !v ? 'Enter your email so we can reach you.' : EMAIL.test(v) ? undefined : 'That doesn’t look like an email. Check for a typo.';
    }
    if (textOk && phone.replace(/\D/g, '').length < 10) next.phone = 'Add a 10-digit mobile number to get texts, or untick the box.';
    else if (!textOk && phone.trim()) next.phone = 'Tick the box to agree to alert texts, or leave the phone empty.';
    setErr(next);
    const first = (['dates', 'parts', 'email', 'phone'] as const).find(k => next[k]);
    if (first) { boxRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus(); return; }

    setBusy(true);
    try {
      const sorted = slot ? [open.day] : [...dates].sort();
      const r = await fetch('/api/alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: course.id,
          dates: sorted,
          parts: slot ? [] : parts.map(k => PARTS.find(p => p.key === k)!.api),
          players,
          ...(slot ? { teeTimeId: slot.id, wide } : {}),
          ...(memberEmail ? {} : { email: email.trim() }),
          // The phone goes only with its own ticked box (alert texts are separate from booking texts).
          ...(textOk ? { phone: phone.trim(), textConsent: true } : {}),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = typeof d.error === 'string' ? d.error : 'That didn’t go through. Try again.';
        let f: 'dates' | 'parts' | 'email' | 'phone' | null = d.field === 'dates' ? 'dates' : d.field === 'parts' ? 'parts' : d.field === 'email' ? 'email' : d.field === 'phone' || d.field === 'textConsent' ? 'phone' : null;
        // Only a field that is on screen can carry the error; anything else is said on the form line.
        if ((f === 'email' && memberEmail) || ((f === 'dates' || f === 'parts') && slot)) f = null;
        // Logged in on the page, but the server no longer sees the log-in (it ran out, or logged out elsewhere).
        const formMsg = d.field === 'email' && memberEmail ? 'Your log-in has ended. Reload the page to log in again, or to set the alert as a guest.' : msg;
        setErr(f ? { [f]: msg } : { form: formMsg });
        return;
      }
      // Fail safe: only an answer that says 'active' reads as on.
      setDone({
        active: d.status === 'active',
        to: d.status === 'active' && typeof d.maskedEmail === 'string' ? d.maskedEmail : email.trim(),
        phone: d.status === 'active' && textOk ? phone.trim() : null,
        what, ends: shortDate(typeof d.endsOn === 'string' ? d.endsOn : sorted[sorted.length - 1]),
      });
    } catch {
      setErr({ form: 'Network error: the alert was not set. Check your connection and try again.' });
    } finally { setBusy(false); }
  }

  const invalid = (k: keyof typeof err) => (err[k] ? { 'aria-invalid': true as const, 'aria-describedby': `al-${k}-err` } : {});

  return (
    <>
      <div className={g.sheetScrim} onClick={() => { if (!busy) onClose(); }} aria-hidden="true" />
      <div className={g.sheet} ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="al-h">
        <div className={g.shead2}>
          <h2 id="al-h" ref={headRef} tabIndex={-1}>
            {done ? (done.active ? 'Alert on' : 'Check your email') : slot ? `Tell me if ${slot.label} opens` : 'Tell me when a time opens'}
          </h2>
          <button className={g.close} type="button" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
        </div>

        {done ? (
          <>
            {done.active ? (
              <p className={g.fixedNote} role="status">We&rsquo;ll email {done.to}{done.phone ? ` and text ${done.phone}` : ''} when {done.what} opens. First to book gets it. Ends after {done.ends}.</p>
            ) : (
              <p className={g.fixedNote} role="status">We sent a link to <b>{done.to}</b>. Tap it to turn this alert on. Nothing is sent until you do. Alert: {done.what}. Ends after {done.ends}.</p>
            )}
            <button className={g.btn} type="button" onClick={onClose}>Back to tee times</button>
          </>
        ) : (
          <form noValidate onSubmit={e => { e.preventDefault(); submit(); }}>
            {slot ? (
              <>
                <p className={g.fixedNote}><b>{shortDate(open.day)}, {slot.label}</b> · {course.name}</p>
                <label className={`${g.sms} ${g.tapRow}`}>
                  <input type="checkbox" checked={wide} onChange={e => setWide(e.target.checked)} />
                  <span>Also tell me about other {PARTS.find(p => p.key === slot.part)!.label.toLowerCase()} times that day</span>
                </label>
              </>
            ) : (
              <>
                <div className={g.field}>
                  <span className={g.lab} id="al-dates-l">Dates (add more if you like)</span>
                  <div className={g.dgrid} role="group" aria-labelledby="al-dates-l" {...invalid('dates')}>
                    {days.map((d, i) => (
                      <button key={d} type="button" aria-pressed={dates.includes(d)} aria-label={shortDate(d)} onClick={() => toggleDate(d)} data-field={i === 0 ? 'dates' : undefined}>
                        {/* The first tile of each month names the month, so a long window can't show two "19"s alike. */}
                        <small>{new Date(d + 'T12:00:00').toLocaleDateString('en-US', i === 0 || d.endsWith('-01') ? { month: 'short' } : { weekday: 'short' })}</small>{new Date(d + 'T12:00:00').getDate()}
                      </button>
                    ))}
                  </div>
                  <div className={g.err} id="al-dates-err" role="alert">{err.dates ?? ''}</div>
                </div>
                <div className={g.field}>
                  <span className={g.lab} id="al-parts-l">Time of day · choose any</span>
                  <div className={g.todrow} role="group" aria-labelledby="al-parts-l" {...invalid('parts')}>
                    {PARTS.map((p, i) => {
                      const on = parts.includes(p.key);
                      return (
                        <button key={p.key} type="button" aria-pressed={on} onClick={() => togglePart(p.key)} data-field={i === 0 ? 'parts' : undefined}>
                          <span className={g.ck} aria-hidden="true">{on ? '✓' : ''}</span>{p.label}<small>{p.hint}</small>
                        </button>
                      );
                    })}
                  </div>
                  <div className={g.err} id="al-parts-err" role="alert">{err.parts ?? ''}</div>
                </div>
              </>
            )}

            <div className={g.field}>
              <span className={g.lab} id="al-pl-l">Players</span>
              <div className={g.stepper} role="group" aria-labelledby="al-pl-l">
                <button type="button" aria-label="One fewer player" disabled={players <= 1} onClick={() => setPlayers(players - 1)}>−</button>
                <output aria-live="polite">{pl}</output>
                <button type="button" aria-label="One more player" disabled={players >= 4} onClick={() => setPlayers(players + 1)}>+</button>
              </div>
            </div>

            {memberEmail ? (
              <p className={g.fixedNote}>We&rsquo;ll email <b>{mask(memberEmail)}</b> when a time opens.</p>
            ) : (
              <div className={g.inp}>
                <label className={g.lab} htmlFor="al-email">Email</label>
                <input id="al-email" data-field="email" type="email" autoComplete="email" value={email}
                  onChange={e => { setEmail(e.target.value); if (err.email) setErr(x => ({ ...x, email: undefined })); }} {...invalid('email')} />
                <div className={g.err} id="al-email-err" role="alert">{err.email ?? ''}</div>
              </div>
            )}
            <div className={g.inp}>
              <label className={g.lab} htmlFor="al-phone">{memberEmail ? 'Also text me (optional)' : 'Mobile (optional)'}</label>
              <input id="al-phone" data-field="phone" type="tel" autoComplete="tel" value={phone}
                onChange={e => { setPhone(e.target.value); if (err.phone) setErr(x => ({ ...x, phone: undefined })); }} {...invalid('phone')} />
              <div className={g.err} id="al-phone-err" role="alert">{err.phone ?? ''}</div>
            </div>
            {/* Its own box, never pre-ticked, separate from booking texts; the words are alertSmsConsentText() exactly. */}
            <label className={g.sms}>
              <input type="checkbox" checked={textOk} onChange={e => { setTextOk(e.target.checked); if (err.phone) setErr(x => ({ ...x, phone: undefined })); }} />
              <span>{alertSmsConsentText(course.name)}</span>
            </label>
            <p className={g.pol}>First to book gets it. The alert ends by itself after its last date.</p>
            {err.form && <p className={g.formerr} role="alert">{err.form}</p>}
            <button className={g.btn} type="submit" disabled={busy}>{busy ? 'Setting…' : memberEmail ? 'Turn on alert' : 'Email me a link to confirm'}</button>
            <p className={g.pol} style={{ marginTop: 10 }}>Every alert email has a link to stop alerts. <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>
          </form>
        )}
      </div>
    </>
  );
}
