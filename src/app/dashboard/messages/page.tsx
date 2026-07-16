'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Send, MessageSquare, Radio } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';

interface MessageItem {
  id: string; senderType: 'admin' | 'operator'; senderName: string;
  body: string; readAt: string | null; isBroadcast: boolean; createdAt: string;
}
interface Thread { id: string; messages: MessageItem[]; }

const fmtFull = (d: string) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

function MessagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  // Feature-request links (e.g. the coming-soon Outings/Tournaments pages)
  // land here with a starter message pre-filled — a real feedback channel,
  // not a dead mailto.
  const [compose, setCompose] = useState(() => searchParams.get('prefill') || '');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async () => {
    const r = await fetch('/api/operator/messages');
    if (r.status === 401) { router.push('/dashboard/login'); return; }
    if (r.ok) setThread(await r.json());
    setLoading(false);
    await fetch('/api/operator/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  }, [router]);

  useEffect(() => {
    fetch('/api/operator/profile').then(r => r.json()).then(p => {
      if (!p || !p.emailVerified) { router.push('/dashboard/verify'); return; }
      if (p.onboardingStep < 3) { router.push('/dashboard/onboarding'); return; }
    });
    loadThread();
  }, [router, loadThread]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread?.messages?.length]);

  async function sendMessage() {
    if (!compose.trim() || sending) return;
    setSending(true);
    const r = await fetch('/api/operator/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: compose.trim() }) });
    if (r.ok) { setCompose(''); await loadThread(); }
    else { const d = await r.json(); alert(d.error || 'Send failed'); }
    setSending(false);
  }

  const messages = thread?.messages ?? [];

  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active="messages"/>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-line shrink-0 bg-white">
          <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink leading-none">Messages</h1>
          <div className="text-xs text-ink-muted mt-0.5">Your conversation with the GreenReserve team</div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
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
