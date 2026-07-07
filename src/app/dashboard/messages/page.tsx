'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Send, MessageSquare, Radio } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';

interface MessageItem {
  id: string; senderType: 'admin' | 'operator'; senderName: string;
  body: string; readAt: string | null; isBroadcast: boolean; createdAt: string;
}
interface Thread {
  id: string;
  messages: MessageItem[];
}

const fmtFull = (d: string) => new Date(d).toLocaleString('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
});

export default function OperatorMessagesPage() {
  const router = useRouter();
  const [thread, setThread] = useState<Thread | null>(null);
  const [courseName, setCourseName] = useState('');
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThread = useCallback(async () => {
    const r = await fetch('/api/operator/messages');
    if (r.status === 401) { router.push('/dashboard/login'); return; }
    if (r.ok) setThread(await r.json());
    setLoading(false);

    // Mark admin messages as read
    await fetch('/api/operator/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  }, [router]);

  useEffect(() => {
    fetch('/api/operator/profile').then(r => r.json()).then(p => {
      if (!p || !p.emailVerified) { router.push('/dashboard/verify'); return; }
      if (p.onboardingStep < 3) { router.push('/dashboard/onboarding'); return; }
    });
    fetch('/api/operator/courses').then(r => r.json()).then(c => {
      if (c?.name) setCourseName(c.name);
    });
    loadThread();
  }, [router, loadThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages?.length]);

  async function sendMessage() {
    if (!compose.trim() || sending) return;
    setSending(true);
    const r = await fetch('/api/operator/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: compose.trim() }),
    });
    if (r.ok) {
      setCompose('');
      await loadThread();
    } else {
      const d = await r.json();
      alert(d.error || 'Send failed');
    }
    setSending(false);
  }

  const messages = thread?.messages ?? [];

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <OperatorSidebar active="messages" courseName={courseName} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-white leading-none">Messages</h1>
            <div className="text-xs text-white/40 mt-0.5">Your conversation with the GreenReserve team</div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {loading && <div className="text-center py-10 text-white/40 text-sm">Loading...</div>}
          {!loading && messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
              <MessageSquare className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <div className="text-sm text-white/50 mb-1">No messages yet</div>
              <div className="text-xs text-white/30">Send a message to reach the GreenReserve team</div>
            </div>
          )}
          {messages.map(msg => {
            const isOperator = msg.senderType === 'operator';
            return (
              <div key={msg.id} className={isOperator ? 'flex justify-end' : 'flex justify-start'}>
                <div className="max-w-[70%]">
                  {msg.isBroadcast && (
                    <div className="flex items-center gap-1 mb-1 text-[10px] text-yellow-400/70">
                      <Radio className="w-3 h-3" /> Platform Announcement
                    </div>
                  )}
                  <div className={
                    'px-4 py-2.5 rounded-lg text-sm whitespace-pre-wrap leading-relaxed ' + (
                      isOperator
                        ? 'bg-emerald-700 text-white rounded-br-none'
                        : msg.isBroadcast
                        ? 'bg-yellow-900/30 border border-yellow-700/30 text-yellow-100 rounded-bl-none'
                        : 'bg-gray-800 border border-white/10 text-gray-100 rounded-bl-none'
                    )
                  }>
                    {msg.body}
                  </div>
                  <div className={'text-[10px] mt-1 text-white/30 ' + (isOperator ? 'text-right' : '')}>
                    {msg.senderName} · {fmtFull(msg.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0 bg-gray-900">
          <div className="flex gap-3 items-end">
            <textarea
              value={compose}
              onChange={e => setCompose(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendMessage();
              }}
              placeholder="Message GreenReserve..."
              rows={2}
              className="flex-1 bg-gray-800 border border-white/10 rounded-md px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-700/50 resize-none"
            />
            <button
              onClick={sendMessage}
              disabled={!compose.trim() || sending}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors shrink-0"
            >
              <Send className="w-3.5 h-3.5" />Send
            </button>
          </div>
          <div className="text-[10px] text-white/20 mt-1.5">⌘/Ctrl + Enter to send</div>
        </div>
      </main>
    </div>
  );
}
