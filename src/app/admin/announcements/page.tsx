'use client';
// AW-8a (Cam 2026-10-21): an announcement is one row shown on every live course's dashboard (and, if chosen, emailed to
// their owners) — never a message in a thread. ADMIN-REDO (Cam approved the mockup 2026-11-12, ADMIN_REDO_SPEC.md "Admin
// Announcements"): ONE card — a wordless search, a white refresh and "+", one line per announcement; tap one for its full
// page; "+" opens the composer → review → the result line on the list. Same features as before: send now to every live
// course, optional email, "Send test to me", no drafts, scheduling or recall. Sending stays owner-only (the route
// requires the owner session and says so; the "+" only shows for the owner); the history is readable by support+.
// The broadcasts route and how broadcasts are stored are Build's and unchanged. Which page is open is in the URL
// (?id=… / ?new=1), so Back works.
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { formatDateTime } from '@/lib/format';
import g from '../admin-glass.module.css';
import r from '../revenue/revenue.module.css';
import s from './announcements.module.css';
import {
  type Broadcast, type SendOutcome, type Reach,
  pl, firstLine, listDate, matches, isBroadcasts, outcomeLine, outcomeBad, reachLine,
} from './logic';

type Failure = { msg: string; kind: AdminFetchFailure };
type Draft = { title: string; body: string; sendEmail: boolean };
const EMPTY: Draft = { title: '', body: '', sendEmail: false };

const ICON = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

function Problem({ got, retry, busy }: { got: Failure; retry: () => void; busy: boolean }) {
  return (
    <div className={s.problem} role="alert">
      <span className={g.down}>{got.msg}</span>
      {got.kind === 'unauthorized' ? <Link href="/admin/login" className={s.pill}>Sign in</Link>
        : got.kind === 'forbidden' ? null : <button type="button" className={s.pill} onClick={retry} disabled={busy}>{busy ? 'Trying…' : 'Try again'}</button>}
    </div>
  );
}

function AnnouncementsContent() {
  const params = useSearchParams();
  const router = useRouter();
  const isOwner = useAdminSession().role === 'owner';
  const openId = params.get('id');
  const composing = params.get('new') === '1' && isOwner;

  const [list, setList] = useState<Broadcast[] | null>(null);
  const [loadErr, setLoadErr] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  // From the SAME filter the send uses — never a client-side guess.
  const [reach, setReach] = useState<Reach | null>(null);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<unknown>('/api/admin/broadcasts', { subject: 'announcements' });
    if (!res.ok) setLoadErr({ msg: res.message, kind: res.kind });
    else if (!isBroadcasts(res.data)) setLoadErr({ msg: 'Announcements came back in a shape this page can’t read. Try again.', kind: 'server' });
    else { setList(res.data); setLoadErr(null); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!isOwner) return;
    adminFetch<Reach>('/api/admin/broadcasts?recipients=1', { subject: 'the recipient list' }).then(res => setReach(res.ok ? res.data : null));
  }, [isOwner]);

  const toList = () => router.push('/admin/announcements');

  // The send and the test live HERE, not in the composer: the composer unmounts on browser Back, and a flag inside it
  // would let a second Confirm & send go out while the first is still sending (two announcements, two emails each,
  // no recall). One in-flight flag (state for the buttons, a ref for a same-tick second click) guards both.
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const busy = useRef(false);
  const [sendErr, setSendErr] = useState<Failure | null>(null);
  const [testNote, setTestNote] = useState('');

  async function sendTest() {
    const title = draft.title.trim(), text = draft.body.trim();
    if (!title || !text || busy.current) return;
    busy.current = true; setTesting(true); setTestNote(''); setSendErr(null);
    try {
      // MP-7b: send-test-to-self — emails only the signed-in admin, records nothing.
      const res = await adminFetch<{ sentTo: string }>('/api/admin/broadcasts', {
        method: 'POST', body: JSON.stringify({ title, body: text, test: true }), subject: 'the test email', action: 'send',
      });
      if (!res.ok) setSendErr({ msg: res.message, kind: res.kind });
      else setTestNote(`Test sent to ${res.data.sentTo}. Nobody else got it.`);
    } finally { busy.current = false; setTesting(false); }
  }

  async function send() {
    const title = draft.title.trim(), text = draft.body.trim();
    if (!title || !text || busy.current) return;
    busy.current = true; setSending(true); setSendErr(null); setTestNote(''); setOutcome(null); // a stale result never sits beside a new send
    try {
      const res = await adminFetch<SendOutcome>('/api/admin/broadcasts', {
        method: 'POST', body: JSON.stringify({ title, body: text, sendEmail: draft.sendEmail }), subject: 'this announcement', action: 'send',
      });
      if (!res.ok) { setSendErr({ msg: res.message, kind: res.kind }); load(); return; } // shown on the composer AND the list; the list re-read so "check" shows what went out
      setOutcome(res.data); setDraft(EMPTY); load(); toList();
    } finally { busy.current = false; setSending(false); }
  }

  // What the send is doing, for whichever page is open (the composer shows its own).
  const sendStatus = !composing && (sending || sendErr) ? (
    sending ? <p className={s.empty} role="status">Sending the announcement…</p>
      : sendErr && <div className={s.problem} role="alert"><span className={g.down}>{sendErr.msg}</span>
        {sendErr.kind === 'unauthorized' && <Link href="/admin/login" className={s.pill}>Sign in</Link>}
        <button type="button" className={s.pill} onClick={() => setSendErr(null)}>Dismiss</button></div>
  ) : null;

  let body: ReactNode;
  if (composing) body = <Composer draft={draft} setDraft={setDraft} reach={reach} onBack={toList} send={send} sendTest={sendTest} sending={sending} testing={testing} err={sendErr} testNote={testNote} clearNotes={() => { setSendErr(null); setTestNote(''); }} />;
  else if (openId) {
    const a = list?.find(b => b.id === openId);
    body = (
      <section className={`${g.glass} ${s.card} ${s.page}`} aria-label="Announcement">
        <button type="button" className={s.back} onClick={toList}>‹ Announcements</button>
        {sendStatus}
        {loadErr && <Problem got={loadErr} retry={load} busy={loading} />}
        {!list && !loadErr && <div className={r.skel} aria-busy="true" aria-label="Loading the announcement" />}
        {list && !a && <p className={s.empty}>Could not find this announcement.</p>}
        {a && (
          <>
            <h2>{a.title}</h2>
            <p className={s.abody}>{a.body}</p>
            <div className={s.ameta}>
              <span>{formatDateTime(a.createdAt)} · by {a.sentByName}</span>
              {a.emailSent && <span className={s.sd}><i />Emailed</span>}
              {a.dismissalCount > 0 && <span>{a.dismissalCount} dismissed</span>}
            </div>
          </>
        )}
      </section>
    );
  } else {
    const rows = (list ?? []).filter(b => matches(b, q));
    body = (
      <section className={`${g.glass} ${s.card}`} aria-label="Announcements">
        <div className={s.bar}>
          <label className={s.search}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search announcements" />
          </label>
          <button type="button" className={s.wb} onClick={load} disabled={loading} aria-label={loading ? 'Refreshing' : 'Refresh'} title="Refresh">
            <svg {...ICON}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
          </button>
          {isOwner && (
            <button type="button" className={s.wb} onClick={() => router.push('/admin/announcements?new=1')} disabled={sending} aria-label="New announcement" title="New announcement">
              <svg {...ICON}><path d="M12 5v14M5 12h14" /></svg>
            </button>
          )}
        </div>
        {outcome && (
          <div className={`${s.outc} ${outcomeBad(outcome) ? s.bad : ''}`} role="status">
            <span>
              {outcomeLine(outcome)}
              {outcome.emailFailures.length > 0 && <span className={s.fails}>Email failed for: {outcome.emailFailures.join(', ')}. They still see it on their dashboard.</span>}
            </span>
            <button type="button" className={s.wb} onClick={() => setOutcome(null)} aria-label="Dismiss">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        {sendStatus}
        {loadErr && <Problem got={loadErr} retry={load} busy={loading} />}
        {!list && !loadErr && <div className={r.skel} aria-busy="true" aria-label="Loading announcements" />}
        {list && list.length === 0 && <p className={s.empty}>No announcements yet</p>}
        {list && list.length > 0 && rows.length === 0 && <p className={s.empty}>Nothing matches</p>}
        {rows.length > 0 && (
          <ul className={`${s.list} ${loading ? s.stale : ''}`}>
            {rows.map(b => (
              <li key={b.id}>
                <button type="button" className={s.row} onClick={() => router.push(`/admin/announcements?id=${encodeURIComponent(b.id)}`)}>
                  <i className={`${s.dot} ${b.emailSent ? s.ok : ''}`} title={b.emailSent ? 'Emailed' : 'Dashboard only'} aria-hidden="true" />
                  <b>{b.title}</b>
                  <span className={s.pv}>{firstLine(b.body)}</span>
                  <span className={s.dm}>{b.dismissalCount > 0 ? `${b.dismissalCount} dismissed` : ''}</span>
                  <span className={s.dt}>{listDate(b.createdAt)}</span>
                  <span className="sr-only">{b.emailSent ? 'Emailed' : 'Dashboard only'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <>
      <AdminSidebar active="announcements" />
      <main className={g.main}>
        <div className={g.head}><h1>Announcements</h1></div>
        {body}
      </main>
    </>
  );
}

function Composer({ draft, setDraft, reach, onBack, send, sendTest, sending, testing, err, testNote, clearNotes }: {
  draft: Draft; setDraft: (d: Draft) => void; reach: Reach | null; onBack: () => void; send: () => void; sendTest: () => void;
  sending: boolean; testing: boolean; err: Failure | null; testNote: string; clearNotes: () => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const title = draft.title.trim(), text = draft.body.trim();
  const ready = !!title && !!text;
  const inFlight = sending || testing;
  // The test's result and any error show on both steps, so nothing reported while editing is lost.
  const notes = (
    <>
      {testNote && <p className={s.tnote} role="status">{testNote}</p>}
      {err && <p className={s.err} role="alert">{err.msg}{err.kind === 'unauthorized' && <> <Link href="/admin/login">Sign in</Link></>}</p>}
    </>
  );

  const edit = () => { setReviewing(false); if (!inFlight) clearNotes(); };

  return (
    <section className={`${g.glass} ${s.card} ${s.page}`} aria-label={reviewing ? 'Review the announcement' : 'New announcement'}>
      <button type="button" className={s.back} onClick={onBack} disabled={inFlight}>‹ Announcements</button>
      {!reviewing ? (
        <form className={s.cf} onSubmit={e => { e.preventDefault(); if (ready) setReviewing(true); }}>
          <label className={s.f}>Title
            <input className={s.fld} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className={s.f}>Message
            <textarea className={s.fld} rows={7} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} />
          </label>
          <div className={s.crow}>
            <label className={s.ck}>
              <input type="checkbox" checked={draft.sendEmail} onChange={e => setDraft({ ...draft, sendEmail: e.target.checked })} />
              <span>Also send as email<small>{reach ? `To ${pl(reach.operators, 'operator')} of live courses` : 'To every operator of a live course'}</small></span>
            </label>
            <button type="submit" className={`${s.btn} ${s.pri}`} disabled={!ready || inFlight}>Preview &amp; confirm</button>
          </div>
          {notes}
        </form>
      ) : (
        <div className={s.cf}>
          <div className={s.pvbox}>
            <div className={s.crow}><span>Preview</span><button type="button" className={`${s.btn} ${s.sm}`} onClick={edit} disabled={inFlight}>Edit</button></div>
            <b>{title}</b>
            <p className={s.abody}>{text}</p>
          </div>
          <div className={s.reach}>{reachLine(reach, draft.sendEmail)} <em>This cannot be recalled.</em></div>
          {notes}
          <div className={s.acts}>
            <button type="button" className={s.btn} onClick={edit} disabled={inFlight}>Back to edit</button>
            <button type="button" className={s.btn} onClick={sendTest} disabled={testing || sending}>{testing ? 'Sending test…' : 'Send test to me'}</button>
            <button type="button" className={`${s.btn} ${s.pri}`} onClick={send} disabled={sending || testing} aria-busy={sending}>{sending ? 'Sending…' : 'Confirm & send'}</button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function AnnouncementsPage() {
  return <Suspense fallback={null}><AnnouncementsContent /></Suspense>;
}
