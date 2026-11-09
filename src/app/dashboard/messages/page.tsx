'use client';
// MSG-1 (Cam 2026-11-09, his notes on the Messages tab): say 48 hours, not "one business day"; say they can email
// instead; send them to the assistant if they need it now (with ready questions); a formal "Your ticket has been
// created" once a message is sent; a countdown to when we'll reply; no Ctrl/Cmd+Enter; tidier layout and boxes.
// A "ticket" is a course's message that's still waiting on GreenReserve: its reference is the message's own
// (last 6 of its id) and it's answered by the next reply from us. Replies are due 48 hours after the first message
// still waiting (REPLY_HOURS, lib/support-ticket) — a promise to the course.
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OperatorSidebar from '@/components/OperatorSidebar';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import { formatStamp as fmtFull } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { ADMIN_EMAIL } from '@/lib/contact';
import { askBirdie, useBirdieReady } from '@/lib/birdie/ask';
import { REPLY_HOURS, waitingSince, ticketRef, dueIn } from '@/lib/support-ticket';

interface MessageItem {
  id: string; senderType: 'admin' | 'operator'; senderName: string;
  body: string; readAt: string | null; isBroadcast: boolean; createdAt: string;
}
interface Thread { id: string; messages: MessageItem[]; }
// MP-7b: announcements are stored once and read here; read = dismissed.
interface AnnouncementItem { id: string; title: string; body: string; createdAt: string; read: boolean }

// Questions the assistant answers from the course's own setup — a start for "I need it now".
const ASK = ['How do I open and close the register?', 'How do I move a group to another time?', 'How do I refund a round?', 'How do I set member prices?'];

function MessagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Feature-request links (e.g. the coming-soon Outings/Tournaments pages) land here with a starter message.
  const [compose, setCompose] = useState(() => searchParams.get('prefill') || '');
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState<{ ref: string; due: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [annError, setAnnError] = useState('');
  const [openAnn, setOpenAnn] = useState<string | null>(null);
  const [showAllAnn, setShowAllAnn] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const assistant = useBirdieReady();

  // The countdown moves on its own.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const loadAnnouncements = useCallback(async () => {
    const r = await dfetch<AnnouncementItem[]>('/api/operator/announcements?all=1');
    if (r.ok) { setAnnouncements(Array.isArray(r.data) ? r.data : []); setAnnError(''); }
    else if (r.status !== 401) setAnnError(r.error);
  }, []);

  async function markRead(id: string) {
    const r = await dfetch('/api/operator/announcements/dismiss', { method: 'POST', body: JSON.stringify({ announcementId: id }) });
    if (r.ok) setAnnouncements(list => { const at = list.find(a => a.id === id)?.createdAt ?? ''; return list.map(a => a.id === id || a.createdAt <= at ? { ...a, read: true } : a); });
    else toast(r.error);
  }

  const loadThread = useCallback(async () => {
    const r = await dfetch<Thread>('/api/operator/messages');
    if (r.status === 401) { router.push('/dashboard/login'); return null; }
    if (r.ok) { setThread(r.data); setLoadError(''); }
    else setLoadError(r.error); // SD-10: a 500 used to read as "No messages yet"
    setLoading(false);
    // Mark read — best effort, never user-facing state.
    await fetch('/api/operator/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    return r.ok ? r.data : null;
  }, [router]);

  useEffect(() => {
    fetch('/api/operator/profile').then(r => r.ok ? r.json() : null).then(p => {
      if (!p) return; // never redirect off an error body
      if (!p.emailVerified) { router.push('/dashboard/verify'); return; }
      if (p.onboardingStep < 3) { router.push('/dashboard/onboarding'); return; }
    }).catch(() => {});
    loadThread();
    loadAnnouncements();
  }, [router, loadThread, loadAnnouncements]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread?.messages?.length]);

  async function sendMessage() {
    if (!compose.trim() || sending) return;
    setSending(true); setCreated(null);
    const r = await dfetch<{ id?: string }>('/api/operator/messages', { method: 'POST', body: JSON.stringify({ body: compose.trim() }) });
    if (r.ok) {
      setCompose('');
      const t = await loadThread();
      const since = t ? waitingSince(t.messages) : null;
      const mine = t?.messages.filter(m => m.senderType === 'operator').at(-1);
      // A ticket already past its 48 hours never shows a reply time in the past.
      if (since && mine) setCreated({ ref: ticketRef(since.id), due: dueIn(since.createdAt, Date.now()).overdue ? 'any moment now' : `by ${new Date(Date.parse(since.createdAt) + REPLY_HOURS * 3600_000).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` });
    } else toast(r.error === 'Network error — check your connection and try again.' ? 'The message did not send — check your connection and try again.' : r.error);
    setSending(false);
  }

  const messages = thread?.messages ?? [];
  const waiting = waitingSince(messages);
  const left = waiting ? dueIn(waiting.createdAt, now) : null;

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="messages"/>

      <main className="flex-1 flex flex-col md:overflow-hidden pb-24 md:pb-0">
        <div className="px-4 sm:px-8 pt-6 pb-4 shrink-0">
          <h1 className="text-[26px] font-bold leading-none text-ink">Messages</h1>
          {/* Cam 2026-11-09: when we'll reply, email instead, and the assistant for anything that can't wait. */}
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Card className="px-4 py-3">
              <p className="text-[12.5px] text-ink-muted">Reply time</p>
              {waiting && left ? (
                <>
                  <p className="text-[20px] font-semibold text-ink tabular-nums">{left.overdue ? 'Any moment now' : left.label}</p>
                  <p className="text-[12.5px] text-ink-muted">left on ticket {ticketRef(waiting.id)}</p>
                </>
              ) : (
                <>
                  <p className="text-[20px] font-semibold text-ink">Within {REPLY_HOURS} hours</p>
                  <p className="text-[12.5px] text-ink-muted">{loadError ? 'Couldn’t check your messages' : loading ? 'Checking…' : 'Nothing waiting on us'}</p>
                </>
              )}
            </Card>
            <Card className="px-4 py-3">
              <p className="text-[12.5px] text-ink-muted">Prefer email?</p>
              <a href={`mailto:${ADMIN_EMAIL}`} className="block mt-0.5 text-[15px] font-semibold text-pine hover:underline underline-offset-4 break-all">{ADMIN_EMAIL}</a>
              <p className="text-[12.5px] text-ink-muted">Same team, same {REPLY_HOURS} hours</p>
            </Card>
            <Card className="px-4 py-3">
              <p className="text-[12.5px] text-ink-muted">Need it now?</p>
              {assistant ? (
                <>
                  <button type="button" onClick={() => askBirdie('')} className="mt-0.5 text-[15px] font-semibold text-pine hover:underline underline-offset-4">Ask the assistant</button>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ASK.map(q => <button key={q} type="button" onClick={() => askBirdie(q)} className="text-[12px] rounded-[7px] bg-page px-2 py-1 text-ink-soft hover:text-ink text-left">{q}</button>)}
                  </div>
                </>
              ) : <p className="mt-0.5 text-[13.5px] text-ink">The assistant isn’t on for your course yet.</p>}
            </Card>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-5 space-y-4">
          {annError && <LoadError message={`Couldn't load announcements — ${annError}`} onRetry={loadAnnouncements} />}
          {announcements.length > 0 && (
            <Card id="announcements">
              <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                <h2 className="text-[15px] font-semibold text-ink">From GreenReserve</h2>
                {announcements.some(a => !a.read) && <span className="text-[11px] text-pine font-semibold">{announcements.filter(a => !a.read).length} new</span>}
              </div>
              <ul className="divide-y divide-line">
                {announcements.slice(0, showAllAnn ? undefined : 3).map(a => (
                  <li key={a.id} className="px-4 py-2.5">
                    <button onClick={() => { setOpenAnn(o => o === a.id ? null : a.id); if (!a.read) markRead(a.id); }} className="w-full flex items-baseline justify-between gap-3 text-left">
                      <span className={'text-[13.5px] truncate ' + (a.read ? 'text-ink-soft' : 'text-ink font-semibold')}>{a.title}</span>
                      <span className="shrink-0 text-[11px] text-ink-faint">{fmtFull(a.createdAt)}</span>
                    </button>
                    {openAnn === a.id && <p className="mt-1.5 text-[13px] text-ink-soft whitespace-pre-wrap leading-relaxed">{a.body}</p>}
                  </li>
                ))}
              </ul>
              {announcements.length > 3 && !showAllAnn && (
                <button onClick={() => setShowAllAnn(true)} className="w-full px-4 py-2 text-[12.5px] font-semibold text-pine hover:underline underline-offset-4 text-left border-t border-line">Show all {announcements.length}</button>
              )}
            </Card>
          )}

          <Card className="px-4 sm:px-6 py-5">
            <h2 className="text-[15px] font-semibold text-ink mb-3">Your conversation with GreenReserve</h2>
            {loadError && <LoadError message={loadError} onRetry={loadThread} />}
            {loading && <p className="py-6 text-center text-ink-muted text-sm">Loading…</p>}
            {!loading && !loadError && messages.length === 0 && <p className="py-6 text-center text-[13.5px] text-ink-soft">No messages yet. Write below and we’ll reply within {REPLY_HOURS} hours.</p>}
            <div className="space-y-4">
              {messages.map(msg => {
                const isOperator = msg.senderType === 'operator';
                return (
                  <div key={msg.id} className={isOperator ? 'flex justify-end' : 'flex justify-start'}>
                    <div className="max-w-[75%]">
                      {msg.isBroadcast && <p className="mb-1 text-[11px] text-warn">Announcement</p>}
                      <div className={'px-4 py-2.5 rounded-[10px] text-[14px] whitespace-pre-wrap leading-relaxed ' + (
                        isOperator ? 'bg-pine text-white rounded-br-[3px]'
                          : msg.isBroadcast ? 'bg-warn/5 border border-warn/20 text-ink rounded-bl-[3px]'
                          : 'bg-page text-ink rounded-bl-[3px]'
                      )}>{msg.body}</div>
                      <p className={'text-[11px] mt-1 text-ink-faint ' + (isOperator ? 'text-right' : '')}>
                        {isOperator ? `${msg.senderName} · ticket ${ticketRef(msg.id)}` : msg.senderName} · {fmtFull(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div ref={messagesEndRef}/>
          </Card>
        </div>

        {/* Right inset clears the assistant's corner launcher (tuck + circle), on every screen size (W2-1). */}
        <div className="pl-4 sm:pl-8 pr-[8.5rem] py-4 border-t border-line shrink-0 bg-white">
          {created && (
            <div className="mb-3 rounded-[7px] border-l-[3px] border-ok bg-page px-3 py-2 text-[13.5px] text-ink" role="status">
              <b>Your ticket has been created</b> · {created.ref}. We’ll reply here {created.due}.
            </div>
          )}
          <div className="flex gap-3 items-end">
            <textarea value={compose} onChange={e => { setCompose(e.target.value); if (created) setCreated(null); }}
              placeholder="Write to the GreenReserve team…" aria-label="Message to GreenReserve" rows={3}
              className="flex-1 bg-paper border border-line rounded-[7px] px-3 py-2.5 text-[14px] text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 resize-none" />
            <button onClick={sendMessage} disabled={!compose.trim() || sending}
              className="px-5 min-h-[44px] bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-[14px] font-medium rounded-[7px] transition-colors shrink-0">
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function OperatorMessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesContent />
    </Suspense>
  );
}
