'use client';
// SUPPORT-1 (Cam 2026-11-12, ADMIN_REDO_SPEC "Course dashboard Support: APPROVED", mockup lanes/dashboard/messages-mockup.html):
// Messages becomes Support — only the chats. "Open chats" fills the page: each line is the subject, the last message ("You: …"
// when ours is last) and where it stands — Waiting on us (amber) · New reply (green) · Answered. A white "+" starts a new chat.
// Tapping a chat opens it full page: "‹ Chats", the subject, "Waiting on us · we reply within 2 business days", the messages,
// a box and a white paper-airplane Send (faded until typed). One chat per question; GreenReserve's announcements arrive as a
// chat from GreenReserve. The three top cards, search, filter and the separate announcements list are gone (Cam).
// Data: /api/operator/support (the Build worker's routes; the shapes are below). The open chat is ?c=<id>, so Back works.
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OperatorSidebar from '@/components/OperatorSidebar';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { Card } from '@/components/ui/Card';
import { formatStamp as fmtFull } from '@/lib/format';
import { useDashboardAccess } from '@/lib/use-dashboard-access';

type ChatState = 'waiting' | 'reply' | 'answered';
type Chat = {
  id: string; subject: string; state: ChatState;
  last: { body: string; fromUs: boolean; at: string } | null;
  dueAt: string | null; unread: number; fromGreenReserve: boolean;
};
type ChatMessage = { id: string; body: string; fromUs: boolean; senderName: string; at: string };

const STATE: Record<ChatState, { label: string; tone: string; dot: string }> = {
  waiting: { label: 'Waiting on us', tone: 'text-warn font-semibold', dot: 'bg-warn' },
  reply: { label: 'New reply', tone: 'text-ok font-semibold', dot: 'bg-ok' },
  answered: { label: 'Answered', tone: 'text-ink-muted', dot: 'bg-transparent' },
};
const NEW = 'new';

function SupportContent() {
  const router = useRouter();
  const params = useSearchParams();
  const access = useDashboardAccess();
  const open = params.get('c');
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [listError, setListError] = useState('');
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [chatError, setChatError] = useState('');
  // Feature-request links (the coming-soon pages) land here with a starter message: it opens a new chat with it typed.
  const [compose, setCompose] = useState(() => params.get('prefill') || '');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const go = useCallback((c: string | null) => { router.push(c ? `/dashboard/support?c=${encodeURIComponent(c)}` : '/dashboard/support'); }, [router]);

  const loadList = useCallback(async () => {
    const r = await dfetch<{ chats: Chat[] }>('/api/operator/support');
    if (r.status === 401) { router.push('/dashboard/login'); return; }
    if (r.ok) { setChats(r.data.chats); setListError(''); } else setListError(r.error);
  }, [router]);

  const loadChat = useCallback(async (id: string) => {
    const r = await dfetch<{ chat: Chat; messages: ChatMessage[] }>(`/api/operator/support/${encodeURIComponent(id)}`);
    if (r.ok) { setChat(r.data.chat); setMessages(r.data.messages); setChatError(''); } else setChatError(r.error);
  }, []);

  useEffect(() => {
    fetch('/api/operator/profile').then(r => r.ok ? r.json() : null).then(p => {
      if (!p) return; // never redirect off an error body
      if (!p.emailVerified) { router.push('/dashboard/verify'); return; }
      if (p.onboardingStep < 3) { router.push('/dashboard/onboarding'); return; }
    }).catch(() => {});
  }, [router]);
  // A prefilled message with no chat open starts a new one.
  useEffect(() => { if (!open && params.get('prefill')) go(NEW); }, [open, params, go]);
  useEffect(() => { if (!open) loadList(); }, [open, loadList]);
  useEffect(() => {
    setSendError('');
    if (!open || open === NEW) { setChat(null); setMessages(open === NEW ? [] : null); setChatError(''); if (open === NEW) boxRef.current?.focus(); return; }
    setChat(null); setMessages(null); loadChat(open);
  }, [open, loadChat]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  async function send() {
    const body = compose.trim();
    if (!body || sending || !open) return;
    setSending(true); setSendError('');
    if (open === NEW) {
      const r = await dfetch<{ chat: Chat }>('/api/operator/support', { method: 'POST', body: JSON.stringify({ body }) });
      setSending(false);
      if (!r.ok) { setSendError(r.error); return; }
      setCompose('');
      router.replace(`/dashboard/support?c=${encodeURIComponent(r.data.chat.id)}`);
      return;
    }
    const r = await dfetch<{ message: ChatMessage }>(`/api/operator/support/${encodeURIComponent(open)}`, { method: 'POST', body: JSON.stringify({ body }) });
    setSending(false);
    if (!r.ok) { setSendError(r.error); return; }
    setCompose('');
    await loadChat(open);
  }

  if (access.loaded && !access.can('messages.use')) {
    return (
      <div className="flex flex-col min-h-screen bg-page">
        <OperatorSidebar active="messages" />
        <main className="flex-1 px-4 sm:px-8 py-6"><StaffNotice what="Support" view="messages.use" /></main>
      </div>
    );
  }

  const st = chat ? STATE[chat.state] : null;
  return (
    <div className="flex flex-col min-h-screen bg-page">
      <OperatorSidebar active="messages" />
      <main className="flex-1 px-4 sm:px-8 py-6 pb-24 md:pb-8">
        <h1 className="font-serif text-[30px] sm:text-[34px] font-semibold leading-none text-ink">Support</h1>

        {!open ? (
          <Card className="mt-5 p-4">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-[15px] font-semibold text-ink mr-auto">Open chats</h2>
              <button type="button" onClick={() => go(NEW)} aria-label="New chat" title="New chat"
                className="w-9 h-9 grid place-items-center rounded-[8px] text-ink hover:bg-page">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
            {listError && <LoadError message={`Couldn't load your chats — ${listError}`} onRetry={loadList} />}
            {!chats && !listError && <p className="py-3 text-[13.5px] text-ink-muted">Loading…</p>}
            {chats && chats.length === 0 && <p className="py-3 text-[13.5px] text-ink-soft">No chats yet. Tap + to ask us anything.</p>}
            {chats && chats.length > 0 && (
              <ul>
                {chats.map(c => {
                  const s = STATE[c.state];
                  const bold = c.state === 'reply' || c.unread > 0;
                  return (
                    <li key={c.id} className="border-t border-line first:border-t-0">
                      <button type="button" onClick={() => go(c.id)}
                        className="w-full text-left grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2.5 px-2.5 py-3 rounded-[10px] hover:bg-page">
                        <span aria-hidden="true" className={'w-1.5 h-1.5 rounded-full ' + s.dot} />
                        <span className="min-w-0">
                          <span className={'block truncate text-[14px] ' + (bold ? 'text-ink font-semibold' : 'text-ink-soft')}>{c.fromGreenReserve ? `GreenReserve · ${c.subject}` : c.subject}</span>
                          {c.last && <span className="block truncate text-[12.5px] text-ink-muted">{c.last.fromUs ? 'You: ' : ''}{c.last.body}</span>}
                        </span>
                        <span className={'text-[12px] whitespace-nowrap ' + s.tone}>{s.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ) : (
          <Card className="mt-5 p-4 flex flex-col min-h-[60vh]">
            <button type="button" onClick={() => go(null)} className="self-start text-[13.5px] font-semibold text-ink-muted hover:text-ink mb-2.5">‹ Chats</button>
            {open === NEW ? (
              <>
                <h2 className="text-[20px] font-semibold text-ink">New chat</h2>
                <p className="text-[12.5px] text-ink-muted mt-1 mb-3">We reply within 2 business days</p>
              </>
            ) : chat && st ? (
              <>
                <h2 className="text-[20px] font-semibold text-ink">{chat.subject}</h2>
                <p className="text-[12.5px] text-ink-muted mt-1 mb-3">{chat.state === 'waiting' ? 'Waiting on us · we reply within 2 business days' : st.label}</p>
              </>
            ) : null}
            {chatError && <LoadError message={`Couldn't load this chat — ${chatError}`} onRetry={() => open && loadChat(open)} />}
            {!messages && !chatError && <p className="py-3 text-[13.5px] text-ink-muted">Loading…</p>}
            <div className="flex-1 flex flex-col gap-3.5 py-1">
              {(messages ?? []).map(m => (
                <div key={m.id} className={'max-w-[78%] ' + (m.fromUs ? 'self-end' : 'self-start')}>
                  <div className={'px-3.5 py-2.5 rounded-[12px] text-[14px] leading-relaxed whitespace-pre-wrap ' + (m.fromUs ? 'bg-ink text-page rounded-br-[3px]' : 'bg-page border border-line text-ink rounded-bl-[3px]')}>{m.body}</div>
                  <p className={'mt-1 text-[11px] text-ink-muted ' + (m.fromUs ? 'text-right' : '')}>{m.senderName} · {fmtFull(m.at)}</p>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            {(open === NEW || chat) && (
              // Right inset clears the assistant's corner launcher (W2-1).
              <div className="border-t border-line mt-3 pt-3 pr-[4.5rem] sm:pr-[5.5rem]">
                <div className="flex items-end gap-2">
                  <textarea ref={boxRef} value={compose} onChange={e => { setCompose(e.target.value); if (sendError) setSendError(''); }} rows={3} aria-label="Message"
                    className="flex-1 min-w-0 bg-page border border-line rounded-[10px] px-3 py-2.5 text-[14px] text-ink focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 resize-none" />
                  <button type="button" onClick={send} disabled={!compose.trim() || sending} aria-label={sending ? 'Sending' : 'Send'} title="Send"
                    className="w-11 h-11 shrink-0 grid place-items-center text-ink disabled:opacity-45">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
                  </button>
                </div>
                {sendError && <p role="alert" className="mt-2 text-[13px] text-bad">{sendError === 'Network error — check your connection and try again.' ? 'The message did not send — check your connection and try again.' : sendError}</p>}
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportContent />
    </Suspense>
  );
}
