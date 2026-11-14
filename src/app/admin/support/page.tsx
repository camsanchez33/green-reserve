'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import g from '../admin-glass.module.css';
import r from '../revenue/revenue.module.css';
import s from './support.module.css';
import { TERMS, SESSION_ENDED, NOT_YET, loadFailed, sendFailed, TOO_LONG } from './terms';
import { type ThreadRow, type Thread, MAX_REPLY, isList, isThread, ago, stamp, replyText, preview } from './logic';

// ADMIN-REDO Course support (Cam approved the mockup 2026-11-12, ADMIN_REDO_SPEC.md "Admin Course support"). The admin
// side of the course dashboard's Support chats, like iMessage: ONE card — a wordless search, then every course chat
// (red = not answered, green = answered); tap one for the chat full page with a reply box and Send. No take, assign or
// snooze. Data: Build's GET /api/admin/support(?q=), GET …/[id] (opening marks the course's messages read), POST
// …/[id]/reply — support+, Messages area. The chat opened is in the URL (?id=), so Back and links work.

type Got<T> = { ok: true; data: T } | { ok: false; msg: string; status?: number };
async function getJson<T>(url: string, ok: (v: unknown) => v is T, what: string): Promise<Got<T>> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (res.status === 401) return { ok: false, msg: SESSION_ENDED, status: 401 };
    if (res.status === 404 && !body?.error) return { ok: false, msg: NOT_YET, status: 404 }; // Build's route not live yet
    if (!res.ok || !body) return { ok: false, msg: body?.error ?? loadFailed(what, res.status), status: res.status };
    if (!ok(body)) return { ok: false, msg: loadFailed(what) };
    return { ok: true, data: body };
  } catch { return { ok: false, msg: loadFailed(what) }; }
}

function Problem({ got, retry, busy }: { got: { msg: string; status?: number }; retry: () => void; busy: boolean }) {
  return (
    <div className={s.problem} role="alert">
      <span className={got.status === 404 ? g.wa : g.down}>{got.msg}</span>
      {got.status === 401 ? <Link href="/admin/login" className={s.pill}>Sign in</Link> : <button type="button" className={s.pill} onClick={retry} disabled={busy}>{busy ? 'Trying…' : 'Try again'}</button>}
    </div>
  );
}

function ChatList({ onOpen, initialQ }: { onOpen: (id: string) => void; initialQ: string }) {
  const [q, setQ] = useState(initialQ); // the top search opens a course's chats with ?q=
  const [got, setGot] = useState<Got<{ threads: ThreadRow[] }> | null>(null);
  const [busy, setBusy] = useState(true);
  const seq = useRef(0);
  const load = useCallback(async (query: string) => {
    const mine = ++seq.current;
    setBusy(true);
    const res = await getJson(`/api/admin/support${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`, isList, 'The chats');
    if (mine !== seq.current) return; // a later search won
    setGot(res); setBusy(false);
  }, []);
  useEffect(() => { const t = setTimeout(() => load(q), q ? 250 : 0); return () => clearTimeout(t); }, [q, load]);
  const now = new Date();
  const rows = got?.ok ? got.data.threads : [];
  return (
    <section className={`${g.glass} ${s.card}`} aria-label="Course chats">
      <label className={s.search}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search chats" />
      </label>
      {got && !got.ok && <Problem got={got} retry={() => load(q)} busy={busy} />}
      {!got && <div className={r.skel} aria-busy="true" aria-label="Loading chats" />}
      {got?.ok && rows.length === 0 && <p className={s.empty}>{q.trim() ? 'No chat matches.' : 'No chats yet.'}</p>}
      {got?.ok && (
        <ul className={`${s.list} ${busy ? s.stale : ''}`}>
          {rows.map(t => (
            <li key={t.id}>
              <button type="button" className={s.row} onClick={() => onOpen(t.id)}>
                <i className={`${s.dot} ${t.answered ? s.green : s.red}`} title={t.answered ? TERMS.answered : TERMS.notAnswered} aria-hidden="true" />
                <span className={s.cm}>
                  <span className={s.ctop}>
                    <b>{t.courseName}{t.isTest && <span className={s.test}>Test</span>}</b>
                    <span className={`${s.ago} ${t.overdue ? g.down : ''}`} title={t.overdue ? TERMS.overdue : undefined}>{ago(t.lastAt, now)}</span>
                  </span>
                  <span className={s.sub}>{t.subject}</span>
                  <span className={s.pv}>{preview(t)}</span>
                </span>
                <span className="sr-only">{t.answered ? 'Answered' : 'Not answered yet'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Chat({ id, onBack }: { id: string; onBack: () => void }) {
  const [got, setGot] = useState<Got<Thread> | null>(null);
  const [busy, setBusy] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    setBusy(true);
    setGot(await getJson(`/api/admin/support/${encodeURIComponent(id)}`, isThread, 'This chat'));
    setBusy(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const t = got?.ok ? got.data : null;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [t?.messages.length]);

  async function send() {
    const body = replyText(text);
    if (!body || sending || !t) { if (text.trim().length > MAX_REPLY) setErr(TOO_LONG); return; }
    setSending(true); setErr('');
    try {
      const res = await fetch(`/api/admin/support/${encodeURIComponent(t.id)}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: body }) });
      const out = await res.json().catch(() => ({}));
      if (res.status === 401) setErr(SESSION_ENDED);
      else if (!res.ok) setErr(out.error || sendFailed(res.status));
      else {
        setText('');
        const m = out.message;
        if (m && typeof m.id === 'string') setGot({ ok: true, data: { ...t, answered: true, overdue: false, dueAt: null, messages: [...t.messages, m] } });
        else await load(); // the reply went through but came back without the message: read the chat again
      }
    } catch { setErr(sendFailed()); }
    setSending(false);
  }

  return (
    <section className={`${g.glass} ${s.card} ${s.chat}`} aria-label="Chat">
      <button type="button" className={s.back} onClick={onBack}>‹ Chats</button>
      {got && !got.ok && <Problem got={got} retry={load} busy={busy} />}
      {!got && <div className={r.skel} aria-busy="true" aria-label="Loading the chat" />}
      {t && (
        <>
          <div className={s.chd}>
            <b>{t.courseName}{t.isTest && <span className={s.test}>Test</span>}</b>
            <span>{t.subject}</span>
            <span className={t.answered ? g.up : g.down}>{t.answered ? 'Answered' : 'Not answered yet'}</span>
          </div>
          <div className={s.thr}>
            {t.messages.map(m => (
              <div key={m.id} className={`${s.bb} ${m.from === 'us' ? s.us : s.them}`}>
                <div className={s.bt}>{m.text}</div>
                <p className={s.bm}>{[m.authorName, stamp(m.at)].filter(Boolean).join(' · ')}</p>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form className={s.cmp} onSubmit={e => { e.preventDefault(); send(); }}>
            <textarea value={text} onChange={e => { setText(e.target.value); if (err) setErr(''); }} rows={2} aria-label="Reply"
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} disabled={sending} />
            <button type="submit" className={s.snd} aria-label={sending ? 'Sending' : 'Send'} aria-busy={sending} disabled={sending || !text.trim()}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
            </button>
          </form>
          {sending && <p className={s.note} role="status">Sending…</p>}
          {err && <p className={`${s.note} ${g.down}`} role="alert">{err}{err === SESSION_ENDED && <> <Link href="/admin/login">Sign in</Link></>}</p>}
        </>
      )}
    </section>
  );
}

function SupportContent() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');
  return (
    <>
      <AdminSidebar active="support" />
      <main className={g.main}>
        <div className={g.head}><h1>Course support</h1></div>
        {id ? <Chat key={id} id={id} onBack={() => router.push('/admin/support')} /> : <ChatList initialQ={params.get('q') ?? ''} onOpen={x => router.push(`/admin/support?id=${encodeURIComponent(x)}`)} />}
      </main>
    </>
  );
}

export default function SupportPage() {
  return <Suspense fallback={null}><SupportContent /></Suspense>;
}
