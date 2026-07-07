'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Send, MessageSquare, ArrowUpRight, RefreshCw, Radio } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface MessageItem {
  id: string; senderType: 'admin' | 'operator'; senderName: string;
  body: string; readAt: string | null; isBroadcast: boolean; createdAt: string;
}
interface ThreadSummary {
  id: string; courseId: string; courseName: string; courseSlug: string;
  lastMessage: MessageItem | null; unreadCount: number; updatedAt: string;
}
interface FullThread {
  id: string; courseId: string; messages: MessageItem[];
  course: { name: string; slug: string };
}

const fmtTime = (d: string) => {
  const dt = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - dt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return dt.toLocaleDateString('en-US', { weekday: 'short' });
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const fmtFull = (d: string) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

function MessagesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [adminReady, setAdminReady] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [thread, setThread] = useState<FullThread | null>(null);
  const [compose, setCompose] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const H = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  const loadThreads = useCallback(async () => {
    const r = await fetch('/api/admin/messages', { headers: H() });
    if (r.ok) setThreads(await r.json());
  }, [H]);

  const loadThread = useCallback(async (courseId: string) => {
    setLoading(true);
    const r = await fetch(`/api/admin/messages?courseId=${courseId}`, { headers: H() });
    if (r.ok) {
      const data = await r.json();
      setThread(data);
    } else {
      setThread(null);
    }
    // Mark as read
    await fetch('/api/admin/messages', {
      method: 'PATCH', headers: H(), body: JSON.stringify({ courseId }),
    });
    setLoading(false);
    // Refresh thread list unread counts
    loadThreads();
  }, [H, loadThreads]);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login'); return; }
      setAdminReady(true);
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    if (!adminReady) return;
    loadThreads();
    const cid = params.get('courseId');
    if (cid) setSelectedCourseId(cid);
  }, [adminReady, loadThreads, params]);

  useEffect(() => {
    if (selectedCourseId) loadThread(selectedCourseId);
  }, [selectedCourseId, loadThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages?.length]);

  async function sendMessage() {
    if (!selectedCourseId || !compose.trim() || sending) return;
    setSending(true);
    const r = await fetch('/api/admin/messages', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ courseId: selectedCourseId, body: compose.trim() }),
    });
    if (r.ok) {
      setCompose('');
      await loadThread(selectedCourseId);
      await loadThreads();
    } else {
      const d = await r.json();
      alert(d.error || 'Send failed');
    }
    setSending(false);
  }

  const q = search.toLowerCase().trim();
  const filteredThreads = q ? threads.filter(t => t.courseName.toLowerCase().includes(q)) : threads;
  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0);

  if (!adminReady) return null;

  return (
    <div className="h-screen bg-paper flex overflow-hidden">
      <AdminSidebar active="messages" unreadMessages={totalUnread} />
      <div className="ml-56 flex-1 flex overflow-hidden">

        {/* Thread list */}
        <div className="w-72 shrink-0 border-r border-line flex flex-col bg-white overflow-hidden">
          <div className="px-4 py-4 border-b border-line shrink-0">
            <h1 className="text-[15px] font-serif font-medium text-ink mb-3">Messages</h1>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search courses..."
              className="w-full bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredThreads.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-ink-muted">
                {threads.length === 0 ? 'No messages yet.' : 'No matches.'}
              </div>
            )}
            {filteredThreads.map(t => {
              const isSelected = t.courseId === selectedCourseId;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedCourseId(t.courseId)}
                  className={
                    'w-full text-left px-4 py-3.5 border-b border-line transition-colors flex items-start gap-3 ' +
                    (isSelected ? 'bg-pine/5' : 'hover:bg-paper')
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={'text-sm truncate ' + (t.unreadCount > 0 ? 'font-semibold text-ink' : 'font-medium text-ink-soft')}>
                        {t.courseName}
                      </span>
                      {t.lastMessage && (
                        <span className="text-[10px] text-ink-faint shrink-0">{fmtTime(t.lastMessage.createdAt)}</span>
                      )}
                    </div>
                    {t.lastMessage && (
                      <div className="text-xs text-ink-muted truncate">
                        {t.lastMessage.senderType === 'admin' ? 'You: ' : ''}
                        {t.lastMessage.isBroadcast ? '[Announcement] ' : ''}
                        {t.lastMessage.body.split('\n')[0]}
                      </div>
                    )}
                  </div>
                  {t.unreadCount > 0 && (
                    <span className="shrink-0 bg-pine text-white text-[10px] font-semibold rounded-full w-4 h-4 flex items-center justify-center mt-0.5">
                      {t.unreadCount > 9 ? '9+' : t.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Thread view */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedCourseId && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <MessageSquare className="w-10 h-10 text-ink-faint mb-3" />
              <div className="text-sm font-medium text-ink mb-1">Select a conversation</div>
              <div className="text-xs text-ink-muted">Choose a course from the list to view messages</div>
            </div>
          )}

          {selectedCourseId && (
            <>
              {/* Thread header */}
              <div className="px-6 py-4 border-b border-line shrink-0 flex items-center justify-between bg-white">
                <div>
                  <div className="text-[15px] font-medium text-ink">
                    {thread?.course.name ?? threads.find(t => t.courseId === selectedCourseId)?.courseName ?? '—'}
                  </div>
                  <div className="text-xs text-ink-muted mt-0.5">Conversation with this course operator</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadThread(selectedCourseId)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-paper transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => router.push('/admin/courses/' + selectedCourseId)}
                    className="flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-pine border border-line hover:border-pine/30 px-3 py-1.5 rounded-md transition-colors"
                  >
                    View course <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {loading && <div className="text-center py-10 text-ink-muted text-sm">Loading...</div>}
                {!loading && (!thread || thread.messages.length === 0) && (
                  <div className="text-center py-10">
                    <MessageSquare className="w-8 h-8 text-ink-faint mx-auto mb-2" />
                    <div className="text-sm text-ink-muted">No messages yet. Send one below to start the conversation.</div>
                  </div>
                )}
                {!loading && thread && thread.messages.map(msg => {
                  const isAdmin = msg.senderType === 'admin';
                  return (
                    <div key={msg.id} className={isAdmin ? 'flex justify-end' : 'flex justify-start'}>
                      <div className={'max-w-[70%] ' + (isAdmin ? '' : '')}>
                        {msg.isBroadcast && (
                          <div className="flex items-center gap-1 mb-1 text-[10px] text-ink-muted">
                            <Radio className="w-3 h-3" /> Announcement
                          </div>
                        )}
                        <div className={
                          'px-4 py-2.5 rounded-lg text-sm whitespace-pre-wrap leading-relaxed ' + (
                            isAdmin
                              ? 'bg-pine text-white rounded-br-none'
                              : 'bg-white border border-line text-ink rounded-bl-none'
                          )
                        }>
                          {msg.body}
                        </div>
                        <div className={'text-[10px] mt-1 ' + (isAdmin ? 'text-right text-ink-faint' : 'text-ink-faint')}>
                          {msg.senderName} · {fmtFull(msg.createdAt)}
                          {isAdmin && msg.readAt && <span className="ml-1 text-pine/70">· Read</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="px-6 py-4 border-t border-line bg-white shrink-0">
                <div className="flex gap-3 items-end">
                  <textarea
                    value={compose}
                    onChange={e => setCompose(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendMessage();
                    }}
                    placeholder="Message this course..."
                    rows={2}
                    className="flex-1 bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 resize-none"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!compose.trim() || sending}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />Send
                  </button>
                </div>
                <div className="text-[10px] text-ink-faint mt-1.5">⌘/Ctrl + Enter to send</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminMessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesContent />
    </Suspense>
  );
}
