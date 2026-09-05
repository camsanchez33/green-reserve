'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { ErrorBanner } from '@/components/ui/ErrorState';
import { useRouter, useSearchParams } from 'next/navigation';
import { Send, MessageSquare, ArrowUpRight, RefreshCw, Radio, Mail, Users, Archive } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import { StatusDot } from '@/components/ui/StatusDot';
import { compareThreads, type ThreadSignal } from '@/lib/thread-signal';

interface MessageItem {
  id: string; senderType: 'admin' | 'operator'; senderName: string;
  body: string; readAt: string | null; isBroadcast: boolean; createdAt: string;
}
interface ThreadSummary {
  id: string; courseId: string; courseName: string; courseSlug: string;
  courseActive: boolean; courseArchived: boolean;
  lastMessage: MessageItem | null; unreadCount: number; updatedAt: string;
  // MP-7a: computed server-side by lib/thread-signal — the same derivation
  // the Overview's action queue uses, so the two can never disagree.
  signal: ThreadSignal;
}
interface FullThread {
  id: string | null; courseId: string; messages: MessageItem[];
  course: { name: string; slug: string; active: boolean; archivedAt: string | null };
  inquiryId: string | null;
}
interface Broadcast {
  id: string; title: string; body: string; emailSent: boolean;
  sentByName: string; createdAt: string; dismissalCount: number;
}
interface SendOutcome {
  threadInserts: number; threadFailures: string[];
  emailRequested: boolean; emailRecipients: number; emailsSent: number; emailFailures: string[];
}

type View = 'conversations' | 'announcements';

const fmtTime = (d: string) => {
  const dt = new Date(d);
  const now = new Date();
  // Calendar-day diff (not 24h buckets) to avoid "Yesterday" for 2-day-old messages
  const dtDay = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((nowDay.getTime() - dtDay.getTime()) / 86400000);
  if (diffDays === 0) return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return dt.toLocaleDateString('en-US', { weekday: 'short' });
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const fmtFull = (d: string) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function MessagesContent() {
  const router = useRouter();
  const params = useSearchParams();
  // MP-11a: the layout resolved the session; a page never re-checks it.
  const adminReady = true;
  const isOwner = useAdminSession().role === 'owner';
  const [view, setView] = useState<View>('conversations');
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [thread, setThread] = useState<FullThread | null>(null);
  const [compose, setCompose] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [listError, setListError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [threadError, setThreadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [sendError, setSendError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  // MP-2e: cleared on conversation switch — the banner about course A used to
  // hang over course B's composer.
  useEffect(() => { setSendError(null); }, [selectedCourseId]);

  const H = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  // MP-2b: messages became SUPPORT_PLUS in MP-2 and these two loaders had no
  // else branch, so a 403 (viewer) or a 401 (deactivated mid-session) rendered
  // as "No messages yet." — and the thread pane then invited them to send a
  // message that could only fail. Emptiness and denial must not look alike.
  // MP-2c: two loaders, two error slots. MP-2b gave them one shared string, so
  // loadThread's error was wiped by the loadThreads() call at the end of the
  // same function — the message survived about a frame and the pane fell back
  // to "No messages yet. Send one below.", reintroducing the exact bug the fix
  // was written for.
  const loadThreads = useCallback(async () => {
    const res = await adminFetch<ThreadSummary[]>('/api/admin/messages', { subject: 'messages' });
    if (!res.ok) { setThreads([]); setListError({ msg: res.message, kind: res.kind }); return; }
    setThreads(res.data);
    setListError(null);
  }, []);

  const loadThread = useCallback(async (courseId: string) => {
    setLoading(true);
    try {
      const res = await adminFetch<FullThread | null>(`/api/admin/messages?courseId=${courseId}`, { subject: 'this conversation' });
      if (!res.ok) { setThread(null); setThreadError({ msg: res.message, kind: res.kind }); return; }
      setThread(res.data);
      setThreadError(null);
      // Mark as read (best effort — never let this fail the view)
      await fetch('/api/admin/messages', {
        method: 'PATCH', headers: H(), body: JSON.stringify({ courseId }),
      }).catch(() => {});
      loadThreads();
    } finally {
      setLoading(false);
    }
  }, [H, loadThreads]);

  useEffect(() => {
    if (!adminReady) return;
    loadThreads();
    const cid = params.get('courseId');
    if (cid) setSelectedCourseId(cid);
    if (params.get('view') === 'announcements') setView('announcements');
  }, [adminReady, loadThreads, params]);

  useEffect(() => {
    if (selectedCourseId) loadThread(selectedCourseId);
  }, [selectedCourseId, loadThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages?.length]);

  // MP-2d B4: this was a bare async with no try/catch — a rejected fetch (or
  // .json() on the HTML 500 page an AdminSessionUnavailable now produces) threw
  // past setSending(false) and latched the button on "Sending..." forever. The
  // failure path was also alert('Forbidden'), which is neither inline nor
  // explanatory. Mutations go through the classifier now, same as loads.
  async function sendMessage() {
    if (!selectedCourseId || !compose.trim() || sending) return;
    setSending(true); setSendError(null);
    try {
      const res = await adminFetch('/api/admin/messages', {
        method: 'POST',
        body: JSON.stringify({ courseId: selectedCourseId, body: compose.trim() }),
        subject: 'this message',
        action: 'send',
      });
      if (!res.ok) { setSendError({ msg: res.message, kind: res.kind }); return; }
      setCompose('');
      await loadThread(selectedCourseId);
    } finally {
      setSending(false);
    }
  }

  const q = search.toLowerCase().trim();
  // MP-7a: waiting-on-us first, oldest wait at the top, then by activity —
  // the order the Overview already implied and this list never had.
  const filteredThreads = (q ? threads.filter(t => t.courseName.toLowerCase().includes(q)) : threads).slice().sort(compareThreads);
  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0);
  const waitingCount = threads.filter(t => t.signal.waitingOnUs).length;

  const denied = threadError?.kind === 'forbidden' || threadError?.kind === 'unauthorized';
  const archivedThread = !!thread?.course.archivedAt;
  const composerLocked = denied || archivedThread;

  if (!adminReady) return null;

  return (
    <div className="h-screen bg-paper flex overflow-hidden">
      <AdminSidebar active="messages" unreadMessages={totalUnread} />
      <div className="admin-content flex-1 flex overflow-hidden">

        {/* Thread list */}
        <div className="w-72 shrink-0 border-r border-line flex flex-col bg-white overflow-hidden">
          <div className="px-4 py-4 border-b border-line shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-[15px] font-serif font-medium text-ink">Messages</h1>
              {waitingCount > 0 && (
                <span className="text-[11px] text-warn font-medium">{waitingCount} waiting on you</span>
              )}
            </div>
            {/* MP-7a: Broadcasts merged in. A broadcast is a message inserted
                into every thread, so its composer belongs in the same room. */}
            <div className="flex gap-0.5 bg-paper border border-line rounded-md p-0.5 mb-3">
              {([['conversations', 'Conversations'], ['announcements', 'Announcements']] as [View, string][]).map(([v, label]) => (
                <button key={v} onClick={() => setView(v)}
                  className={'flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ' + (view === v ? 'bg-white text-ink border border-line' : 'text-ink-muted hover:text-ink')}>
                  {label}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search courses..."
              className="w-full bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredThreads.length === 0 && (
              <div className={'px-4 py-8 text-center text-xs ' + (listError ? 'text-bad' : 'text-ink-muted')}>
                {listError ? listError.msg : (threads.length === 0 ? 'No messages yet.' : 'No matches.')}
              </div>
            )}
            {filteredThreads.map(t => {
              const isSelected = t.courseId === selectedCourseId && view === 'conversations';
              return (
                <button
                  key={t.id}
                  onClick={() => { setView('conversations'); setSelectedCourseId(t.courseId); }}
                  className={
                    'w-full text-left px-4 py-3.5 border-b border-line transition-colors flex items-start gap-3 ' +
                    (isSelected ? 'bg-pine/5' : 'hover:bg-paper') + (t.courseArchived ? ' opacity-70' : '')
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
                    {(t.signal.waitingOnUs || t.courseArchived || !t.courseActive) && (
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {t.signal.waitingOnUs && (
                          <span className={'text-[10px] font-medium ' + (t.signal.overdue ? 'text-warn' : 'text-ink-muted')}>
                            Waiting on you · {t.signal.ageDays === 0 ? 'today' : `${t.signal.ageDays}d`}
                          </span>
                        )}
                        {t.courseArchived
                          ? <StatusDot status="neutral" label="Archived" />
                          : !t.courseActive && <StatusDot status="neutral" label="Not live" />}
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

        {/* Right pane */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {view === 'announcements' && <AnnouncementsPane isOwner={isOwner} onSent={loadThreads} />}

          {view === 'conversations' && !selectedCourseId && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <MessageSquare className="w-10 h-10 text-ink-faint mb-3" />
              <div className="text-sm font-medium text-ink mb-1">Select a conversation</div>
              <div className="text-xs text-ink-muted">
                {waitingCount > 0
                  ? `${waitingCount} course${waitingCount === 1 ? ' is' : 's are'} waiting on a reply — they're at the top of the list.`
                  : 'Choose a course from the list to view messages'}
              </div>
            </div>
          )}

          {view === 'conversations' && selectedCourseId && (
            <>
              {/* Thread header */}
              <div className="px-6 py-4 border-b border-line shrink-0 flex items-center justify-between bg-white">
                <div>
                  <div className="text-[15px] font-medium text-ink flex items-center gap-2">
                    {thread?.course.name ?? threads.find(t => t.courseId === selectedCourseId)?.courseName ?? '—'}
                    {archivedThread && <StatusDot status="neutral" label="Archived" />}
                    {thread && !archivedThread && !thread.course.active && <StatusDot status="neutral" label="Not live" />}
                  </div>
                  <div className="text-xs text-ink-muted mt-0.5">
                    {archivedThread ? 'This course is archived — its operator has left the platform.' : 'Conversation with this course operator'}
                  </div>
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
                    <div className={'text-sm ' + (threadError ? 'text-bad' : 'text-ink-muted')}>
                      {threadError ? threadError.msg : archivedThread ? 'No messages, and this course is archived.' : 'No messages yet. Send one below to start the conversation.'}
                    </div>
                  </div>
                )}
                {!loading && thread && thread.messages.map(msg => {
                  const isAdmin = msg.senderType === 'admin';
                  return (
                    <div key={msg.id} className={isAdmin ? 'flex justify-end' : 'flex justify-start'}>
                      <div className="max-w-[70%]">
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
                        {!isAdmin && msg.body.startsWith('Requested changes:') && thread?.inquiryId && (
                          <button
                            onClick={() => router.push(`/admin/inquiries/${thread.inquiryId}`)}
                            className="mt-1 text-[11px] font-medium text-pine hover:underline flex items-center gap-1"
                          >
                            View on inquiry <ArrowUpRight className="w-3 h-3"/>
                          </button>
                        )}
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
                {/* MP-2d: the send failure was a browser alert reading
                    "Forbidden". It renders inline now, and a denial disables the
                    composer instead of inviting a write that can only fail.
                    MP-7a: so does an archived course — the server refuses too. */}
                {sendError && (
                  <ErrorBanner message={sendError.msg} kind={sendError.kind} onDismiss={() => setSendError(null)} />
                )}
                {archivedThread && (
                  <div className="flex items-center gap-2 text-xs text-ink-soft bg-paper border border-line rounded-md px-3 py-2 mb-3">
                    <Archive className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                    Messaging is off for archived courses — the operator has left. Restore the course from its page if you need to reach them.
                  </div>
                )}
                <div className="flex gap-3 items-end">
                  <textarea
                    value={compose}
                    onChange={e => setCompose(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendMessage();
                    }}
                    placeholder={denied ? 'You do not have access to this conversation.' : archivedThread ? 'This course is archived.' : 'Message this course...'}
                    disabled={composerLocked}
                    rows={2}
                    className="flex-1 bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 resize-none disabled:opacity-60"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!compose.trim() || sending || composerLocked}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />{sending ? 'Sending…' : 'Send'}
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

// MP-7a: the old /admin/broadcasts page, moved in. Composer is owner-only
// (the API requires the 2FA-backed owner session and says so); history is
// readable by support+.
function AnnouncementsPane({ isOwner, onSent }: { isOwner: boolean; onSent: () => void }) {
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  // From the SAME filter the send uses — never a client-side guess.
  const [reach, setReach] = useState<{ courses: number; operators: number } | null>(null);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [sendErr, setSendErr] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<Broadcast[]>('/api/admin/broadcasts', { subject: 'announcements' });
    if (!res.ok) { setBroadcasts([]); setLoadError({ msg: res.message, kind: res.kind }); }
    else { setBroadcasts(res.data); setLoadError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    adminFetch<{ courses: number; operators: number }>('/api/admin/broadcasts?recipients=1', { subject: 'the recipient list' })
      .then(res => setReach(res.ok ? res.data : null));
  }, []);

  async function sendBroadcast() {
    if (!title.trim() || !body.trim() || sending) return;
    setSending(true); setOutcome(null); setSendErr(null);
    try {
      const res = await adminFetch<SendOutcome>('/api/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), body: body.trim(), sendEmail }),
        subject: 'this announcement',
        action: 'send',
      });
      if (!res.ok) { setSendErr({ msg: res.message, kind: res.kind }); return; }
      setOutcome(res.data);
      setTitle(''); setBody(''); setSendEmail(false); setReviewing(false);
      load(); onSent();
    } finally {
      setSending(false);
    }
  }

  const outcomeBad = outcome && (outcome.threadFailures.length > 0 || outcome.emailFailures.length > 0 || (outcome.emailRequested && outcome.emailsSent === 0));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-8 py-7 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[18px] font-serif font-medium tracking-tight text-ink">Announcements</h2>
            <p className="text-sm text-ink-soft mt-0.5">
              One message into every live course&apos;s thread{reach ? ` — ${reach.courses} course${reach.courses === 1 ? '' : 's'}, ${reach.operators} operator${reach.operators === 1 ? '' : 's'} right now` : ''}.
            </p>
          </div>
          <button onClick={load} className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors">
            <RefreshCw className="w-4 h-4"/>Refresh
          </button>
        </div>

        {loadError && <ErrorBanner message={loadError.msg} kind={loadError.kind} onRetry={() => load()} />}

        {/* What actually happened — counted from results, never from the
            recipient list. */}
        {outcome && (
          <div className={'rounded-md px-4 py-3 text-sm mb-5 border ' + (outcomeBad ? 'bg-warn/5 border-warn/20 text-ink' : 'bg-ok/5 border-ok/20 text-ok')}>
            <div className="font-medium">
              Posted to {outcome.threadInserts} course thread{outcome.threadInserts === 1 ? '' : 's'}
              {outcome.emailRequested ? ` · ${outcome.emailsSent} of ${outcome.emailRecipients} email${outcome.emailRecipients === 1 ? '' : 's'} delivered to Resend` : ' · no email'}
            </div>
            {outcome.threadFailures.length > 0 && (
              <div className="text-xs text-bad mt-1">Could not post to: {outcome.threadFailures.join(', ')}.</div>
            )}
            {outcome.emailFailures.length > 0 && (
              <div className="text-xs text-bad mt-1">Email failed for: {outcome.emailFailures.join(', ')} — they still see it in their dashboard thread.</div>
            )}
          </div>
        )}

        {isOwner ? (
          <div className="bg-white border border-line rounded-lg p-6 mb-7">
            <div className="flex items-center gap-2 mb-4">
              <Radio className="w-4 h-4 text-pine"/>
              <span className="text-sm font-medium text-ink">{reviewing ? 'Review before sending' : 'New announcement'}</span>
              {reviewing && (
                <button onClick={() => setReviewing(false)} className="ml-auto text-xs text-ink-muted hover:text-ink transition-colors">Edit</button>
              )}
            </div>
            {sendErr && <ErrorBanner message={sendErr.msg} kind={sendErr.kind} onDismiss={() => setSendErr(null)} />}

            {!reviewing ? (
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Title</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} className={iCls} placeholder="Maintenance window this weekend"/>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Message</label>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} className={iCls + ' resize-none'} placeholder="Write your message here. Separate paragraphs with blank lines."/>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="w-4 h-4 accent-pine rounded" />
                    <div>
                      <div className="text-sm font-medium text-ink flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-ink-muted"/>Also send as email
                      </div>
                      <div className="text-xs text-ink-muted mt-0.5">
                        {reach ? `To ${reach.operators} operator${reach.operators === 1 ? '' : 's'} of live courses` : 'To every operator of a live course'}
                      </div>
                    </div>
                  </label>
                  <button
                    onClick={() => setReviewing(true)}
                    disabled={!title.trim() || !body.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white font-medium rounded-md text-[12.5px] transition-colors"
                  >
                    Preview &amp; confirm
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-paper border border-line rounded-lg p-4">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Preview</div>
                  <div className="text-sm font-medium text-ink mb-2">{title}</div>
                  <div className="text-sm text-ink-soft whitespace-pre-line leading-relaxed">{body}</div>
                </div>
                <div className="text-xs text-ink-soft bg-pine/5 border border-pine/20 rounded-md px-3 py-2">
                  Posts into {reach ? `${reach.courses} course thread${reach.courses === 1 ? '' : 's'}` : 'every live course’s thread'}
                  {sendEmail ? ` and emails ${reach ? `${reach.operators} operator${reach.operators === 1 ? '' : 's'}` : 'their operators'}.` : '. No email.'}
                  {' '}This cannot be recalled.
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setReviewing(false)}
                    className="px-4 py-2.5 border border-line text-ink-soft hover:text-ink hover:border-line-strong rounded-md text-[12.5px] font-medium transition-colors"
                  >
                    Back to edit
                  </button>
                  <button
                    onClick={sendBroadcast}
                    disabled={sending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white font-medium rounded-md text-[12.5px] transition-colors"
                  >
                    <Send className="w-4 h-4"/>
                    {sending ? 'Sending…' : 'Confirm & send'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-paper border border-line rounded-lg px-5 py-4 mb-7 text-sm text-ink-soft">
            Only the owner can send an announcement. The history is below.
          </div>
        )}

        <div>
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">History</div>
          {loading && <div className="text-ink-muted text-sm py-8 text-center">Loading...</div>}
          {!loading && !loadError && broadcasts.length === 0 && (
            <div className="text-ink-muted text-sm py-12 text-center bg-white border border-line rounded-lg">
              No announcements yet
            </div>
          )}
          <div className="space-y-3">
            {broadcasts.map(b => (
              <div key={b.id} className="bg-white border border-line rounded-lg p-5">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="font-medium text-ink text-sm">{b.title}</div>
                  <div className="flex items-center gap-3 shrink-0">
                    {b.emailSent && <StatusDot status="ok" label="Emailed" />}
                    {b.dismissalCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-ink-muted">
                        <Users className="w-3 h-3"/>{b.dismissalCount} dismissed
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-ink-soft whitespace-pre-line line-clamp-3 mb-3">{b.body}</div>
                <div className="text-xs text-ink-muted">{fmtDate(b.createdAt)} · by {b.sentByName}</div>
              </div>
            ))}
          </div>
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
