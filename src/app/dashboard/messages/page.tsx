'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Send, MessageSquare, Radio, Megaphone } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import { formatStamp as fmtFull } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/Eyebrow';

interface MessageItem {
  id: string; senderType: 'admin' | 'operator'; senderName: string;
  body: string; readAt: string | null; isBroadcast: boolean; createdAt: string;
}
interface Thread { id: string; messages: MessageItem[]; }
// MP-7b: announcements are stored once and read here; read = dismissed.
interface AnnouncementItem { id: string; title: string; body: string; createdAt: string; read: boolean }

function MessagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Feature-request links (e.g. the coming-soon Outings/Tournaments pages)
  // land here with a starter message pre-filled — a real feedback channel,
  // not a dead mailto.
  const [compose, setCompose] = useState(() => searchParams.get('prefill') || '');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [annError, setAnnError] = useState('');
  const [openAnn, setOpenAnn] = useState<string | null>(null);
  // Review 2026-10-04: "show all" is its own state — sharing it with the open item
  // collapsed the list the moment the 4th announcement was opened.
  const [showAllAnn, setShowAllAnn] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    const r = await dfetch<AnnouncementItem[]>('/api/operator/announcements?all=1');
    if (r.ok) { setAnnouncements(Array.isArray(r.data) ? r.data : []); setAnnError(''); }
    else if (r.status !== 401) setAnnError(r.error);
  }, []);

  async function markRead(id: string) {
    const r = await dfetch('/api/operator/announcements/dismiss', { method: 'POST', body: JSON.stringify({ announcementId: id }) });
    // Seeing one marks it and everything older as seen (the dismiss route does the same).
    if (r.ok) setAnnouncements(list => { const at = list.find(a => a.id === id)?.createdAt ?? ''; return list.map(a => a.id === id || a.createdAt <= at ? { ...a, read: true } : a); });
    else toast(r.error);
  }

  const loadThread = useCallback(async () => {
    const r = await dfetch<Thread>('/api/operator/messages');
    if (r.status === 401) { router.push('/dashboard/login'); return; }
    if (r.ok) { setThread(r.data); setLoadError(''); }
    else setLoadError(r.error); // SD-10: a 500 used to read as "No messages yet"
    setLoading(false);
    // Mark read — best effort, never user-facing state.
    await fetch('/api/operator/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
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
    setSending(true);
    // Review (no-silent-failures): a network drop threw past setSending(false)
    // and trapped the draft behind a permanently disabled Send.
    const r = await dfetch('/api/operator/messages', { method: 'POST', body: JSON.stringify({ body: compose.trim() }) });
    if (r.ok) { setCompose(''); await loadThread(); }
    else toast(r.error === 'Network error — check your connection and try again.' ? 'The message did not send — check your connection and try again.' : r.error);
    setSending(false);
  }

  const messages = thread?.messages ?? [];

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-paper md:overflow-hidden">
      <OperatorSidebar active="messages"/>

      <main className="flex-1 flex flex-col md:overflow-hidden pb-24 md:pb-0">
        <div className="px-6 py-4 border-b border-line shrink-0 bg-white">
          {/* U-O (§1b): serif title + one sentence of this thread's numbers. */}
          <div className="flex items-center gap-2">
            <h1 className="text-[30px] font-serif font-semibold tracking-tight text-ink leading-none">Messages</h1>
          </div>
          <div className="text-[13.5px] text-ink-soft mt-2">
            Your conversation with the GreenReserve team
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {annError && <LoadError message={`Couldn't load announcements — ${annError}`} onRetry={loadAnnouncements} />}
          {announcements.length > 0 && (
            <Card id="announcements">
              <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                <Megaphone className="w-3.5 h-3.5 text-pine"/>
                <Eyebrow as="span">From GreenReserve</Eyebrow>
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
          {loadError && <LoadError message={loadError} onRetry={loadThread} />}
          {loading && <div className="text-center py-10 text-ink-muted text-sm">Loading...</div>}
          {!loading && messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
              <MessageSquare className="w-10 h-10 text-line-strong mx-auto mb-3"/>
              <div className="text-sm text-ink-soft mb-1">No messages yet</div>
              <div className="text-xs text-ink-muted">Send a message to reach the GreenReserve team</div>
            </div>
          )}
          {messages.map(msg => {
            const isOperator = msg.senderType === 'operator';
            return (
              <div key={msg.id} className={isOperator ? 'flex justify-end' : 'flex justify-start'}>
                <div className="max-w-[70%]">
                  {msg.isBroadcast && (
                    <div className="flex items-center gap-1 mb-1 text-[10px] text-warn">
                      <Radio className="w-3 h-3"/> Platform Announcement
                    </div>
                  )}
                  <div className={'px-4 py-2.5 rounded-lg text-sm whitespace-pre-wrap leading-relaxed ' + (
                    isOperator
                      ? 'bg-pine text-white rounded-br-none'
                      : msg.isBroadcast
                      ? 'bg-warn/5 border border-warn/20 text-ink rounded-bl-none'
                      : 'bg-white border border-line text-ink rounded-bl-none'
                  )}>
                    {msg.body}
                  </div>
                  <div className={'text-[10px] mt-1 text-ink-faint ' + (isOperator ? 'text-right' : '')}>
                    {msg.senderName} · {fmtFull(msg.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef}/>
        </div>

        <div className="px-6 py-4 border-t border-line shrink-0 bg-white">
          <div className="flex gap-3 items-end">
            <textarea value={compose} onChange={e => setCompose(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendMessage(); }}
              placeholder="Message GreenReserve..."
              rows={2}
              className="flex-1 bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 resize-none"
            />
            <button onClick={sendMessage} disabled={!compose.trim() || sending}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-[12.5px] font-medium rounded-md transition-colors shrink-0">
              <Send className="w-3.5 h-3.5"/>Send
            </button>
          </div>
          <div className="text-[10px] text-ink-faint mt-1.5">Cmd/Ctrl + Enter to send</div>
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
