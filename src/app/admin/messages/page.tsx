'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { ErrorBanner } from '@/components/ui/ErrorState';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { compareThreads, type ThreadSignal } from '@/lib/thread-signal';
import { formatStamp as fmtFull, formatDateTime as fmtDate } from '@/lib/format';

interface MessageItem {
  id: string; senderType: 'admin' | 'operator'; senderName: string;
  body: string; readAt: string | null; isBroadcast: boolean; createdAt: string;
}
interface ThreadSummary {
  id: string; courseId: string; courseName: string; courseSlug: string;
  courseActive: boolean; courseArchived: boolean;
  lastMessage: MessageItem | null; unreadCount: number; updatedAt: string;
  closedAt: string | null;
  // MP-7a: computed server-side by lib/thread-signal — the same derivation
  // the Overview's action queue uses, so the two can never disagree.
  signal: ThreadSignal;
}
interface FullThread {
  id: string | null; courseId: string; messages: MessageItem[];
  course: { name: string; slug: string; active: boolean; archivedAt: string | null };
  inquiryId: string | null;
  closedAt: string | null;
  context: {
    operator: { name: string; email: string; phone: string; lastLoginAt: string | null } | null;
    firstWentLiveAt: string | null; lastBookingAt: string | null; bookings30d: number;
    openItems?: { changeRequests: number; failedCharges: number; inquiryId: string | null };
  } | null;
}

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

function MessagesContent() {
  const router = useRouter();
  const params = useSearchParams();
  // MP-11a: the layout resolved the session; a page never re-checks it.
  const adminReady = true;
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
  const [showClosed, setShowClosed] = useState(false);
  const [closing, setClosing] = useState(false);
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
    // AW-8a: Announcements has its own page now.
    if (params.get('view') === 'announcements') router.replace('/admin/announcements');
  }, [adminReady, loadThreads, params, router]);

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
  // MP-7b: close a finished conversation / reopen it. Errors show inline.
  async function setClosed(close: boolean) {
    if (!selectedCourseId || closing) return;
    setClosing(true); setSendError(null);
    try {
      const res = await adminFetch('/api/admin/messages', {
        method: 'PATCH',
        body: JSON.stringify({ courseId: selectedCourseId, action: close ? 'close' : 'reopen' }),
        subject: 'this conversation',
        action: 'save',
      });
      if (!res.ok) { setSendError({ msg: res.message, kind: res.kind }); return; }
      await loadThread(selectedCourseId);
    } finally {
      setClosing(false);
    }
  }

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
  const matched = (q ? threads.filter(t => t.courseName.toLowerCase().includes(q)) : threads).slice().sort(compareThreads);
  // AW-8a (Cam 2026-10-21): three groups — waiting on you (oldest wait first),
  // waiting on them (most recent first), closed (folded away).
  const openThreads = matched.filter(t => !t.closedAt);
  const waitingOnYou = openThreads.filter(t => t.signal.waitingOnUs);
  const waitingOnThem = openThreads.filter(t => !t.signal.waitingOnUs);
  const closedThreads = matched.filter(t => t.closedAt);
  const totalUnread = threads.reduce((s, t) => s + t.unreadCount, 0);
  const waitingCount = threads.filter(t => t.signal.waitingOnUs).length;

  const denied = threadError?.kind === 'forbidden' || threadError?.kind === 'unauthorized';
  const archivedThread = !!thread?.course.archivedAt;
  const composerLocked = denied || archivedThread;

  const renderRow = (t: ThreadSummary) => {
              const isSelected = t.courseId === selectedCourseId;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedCourseId(t.courseId)}
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
                          <span className={'text-[11px] font-medium ' + (t.signal.overdue ? 'text-warn' : 'text-ink-muted')}>
                            {t.signal.ageDays === 0 ? 'Since today' : `${t.signal.ageDays} day${t.signal.ageDays === 1 ? '' : 's'}`}
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
  };

  if (!adminReady) return null;

  return (
    <div className="h-screen bg-paper flex overflow-hidden">
      <AdminSidebar active="messages" unreadMessages={totalUnread} />
      <div className="admin-content flex-1 flex overflow-hidden">

        {/* Thread list */}
        <div className="w-72 shrink-0 border-r border-line flex flex-col bg-white overflow-hidden">
          <div className="px-4 py-4 border-b border-line shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-[15px] font-serif font-semibold text-ink">Messages</h1>
              {waitingCount > 0 && (
                <span className="text-[11px] text-warn font-medium">{waitingCount} waiting on you</span>
              )}
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search courses..."
              className="w-full bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {listError && <div className="px-4 py-8 text-center text-xs text-bad">{listError.msg}</div>}
            {!listError && threads.length === 0 && <div className="px-4 py-8 text-center text-xs text-ink-muted">No messages yet.</div>}
            {!listError && threads.length > 0 && matched.length === 0 && <div className="px-4 py-8 text-center text-xs text-ink-muted">No matches.</div>}
            {!listError && matched.length > 0 && (
              <>
                <div className="px-4 pt-4 pb-1.5 text-[13px] font-semibold text-ink border-b border-line">Waiting on you <span className="font-normal text-ink-muted">{waitingOnYou.length}</span></div>
                {waitingOnYou.length === 0 && <div className="px-4 py-3 text-xs text-ink-muted border-b border-line">Nobody is waiting on a reply.</div>}
                {waitingOnYou.map(renderRow)}
                <div className="px-4 pt-4 pb-1.5 text-[13px] font-semibold text-ink border-b border-line">Waiting on them <span className="font-normal text-ink-muted">{waitingOnThem.length}</span></div>
                {waitingOnThem.map(renderRow)}
                {closedThreads.length > 0 && (
                  <button onClick={() => setShowClosed(v => !v)} aria-expanded={showClosed} className="w-full text-left px-4 pt-4 pb-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink border-b border-line">
                    Closed <span className="font-normal">{closedThreads.length}</span> <span className="font-normal">{showClosed ? '· hide' : '· show'}</span>
                  </button>
                )}
                {showClosed && closedThreads.map(renderRow)}
              </>
            )}
          </div>
        </div>

        {/* Right pane */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedCourseId && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              
              <div className="text-sm font-medium text-ink mb-1">Select a conversation</div>
              <div className="text-xs text-ink-muted">
                {waitingCount > 0
                  ? `${waitingCount} course${waitingCount === 1 ? ' is' : 's are'} waiting on a reply — they're at the top of the list.`
                  : 'Choose a course from the list to view messages'}
              </div>
            </div>
          )}

          {selectedCourseId && (
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
                    {archivedThread ? 'This course is archived — its operator has left the platform.'
                      : thread?.closedAt ? `Closed ${fmtDate(thread.closedAt)} — a new message from either side reopens it.`
                      : 'Conversation with this course operator'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {thread?.id && !archivedThread && !denied && (
                    <button onClick={() => setClosed(!thread.closedAt)} disabled={closing}
                      className="flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-ink border border-line hover:border-line-strong px-3 py-1.5 rounded-md transition-colors disabled:opacity-50">
                      {closing ? 'Saving…' : thread.closedAt ? 'Reopen' : 'Close'}
                    </button>
                  )}
                  <button
                    onClick={() => loadThread(selectedCourseId)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-paper transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {loading && <div className="text-center py-10 text-ink-muted text-sm">Loading...</div>}
                {!loading && (!thread || thread.messages.length === 0) && (
                  <div className="text-center py-10">
                    
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
                             Announcement
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
                            View on inquiry 
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
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
                <div className="text-[10px] text-ink-faint mt-1.5">⌘/Ctrl + Enter to send</div>
              </div>
            </>
          )}
        </div>

        {/* AW-8a (Cam 2026-10-21: "side panel"): who you're talking to and
            what's open at their course, beside the thread (MP-7b's context,
            moved out of the header line). */}
        {selectedCourseId && (
          <aside className="w-72 shrink-0 border-l border-line bg-white overflow-y-auto hidden lg:block">
            <div className="px-5 py-5 space-y-5">
              <button onClick={() => router.push('/admin/courses/' + selectedCourseId)}
                className="w-full text-center text-[13px] font-medium text-white bg-pine hover:bg-pine-hover rounded-md px-3 py-2">
                Open the course
              </button>
              {!thread?.context ? (
                <p className="text-xs text-ink-muted">{loading ? 'Loading…' : 'No course details.'}</p>
              ) : (
                <>
                  <section>
                    <h2 className="text-[13px] font-semibold text-ink mb-1.5">Owner</h2>
                    {thread.context.operator ? (
                      <div className="text-sm space-y-1">
                        <div className="text-ink">{thread.context.operator.name}</div>
                        {thread.context.operator.phone && <a href={`tel:${thread.context.operator.phone.replace(/[^\d+]/g, '')}`} className="block text-pine hover:text-pine-hover">{thread.context.operator.phone}</a>}
                        <a href={`mailto:${thread.context.operator.email}`} className="block text-ink-soft hover:text-pine break-all">{thread.context.operator.email}</a>
                        <div className="text-xs text-ink-muted">{thread.context.operator.lastLoginAt ? `Last in their dashboard ${fmtTime(thread.context.operator.lastLoginAt)}` : 'Never signed in'}</div>
                      </div>
                    ) : <p className="text-sm text-bad">No owner login.</p>}
                  </section>
                  <section>
                    <h2 className="text-[13px] font-semibold text-ink mb-1.5">The course</h2>
                    <div className="text-sm text-ink-soft space-y-1">
                      <div>{!thread.course.active ? 'Not live' : thread.context.firstWentLiveAt ? `Live since ${new Date(thread.context.firstWentLiveAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Live'}</div>
                      <div>{thread.context.bookings30d} booking{thread.context.bookings30d === 1 ? '' : 's'} in 30 days{thread.context.lastBookingAt ? ` · last ${fmtTime(thread.context.lastBookingAt)}` : ''}</div>
                    </div>
                  </section>
                  <section>
                    <h2 className="text-[13px] font-semibold text-ink mb-1.5">Open at their course</h2>
                    {thread.context.openItems && (thread.context.openItems.changeRequests > 0 || thread.context.openItems.failedCharges > 0) ? (
                      <div className="text-sm space-y-1">
                        {thread.context.openItems.changeRequests > 0 && (thread.context.openItems.inquiryId
                          ? <button onClick={() => router.push(`/admin/inquiries/${thread.context!.openItems!.inquiryId}`)} className="block text-warn hover:underline text-left">{thread.context.openItems.changeRequests} change request{thread.context.openItems.changeRequests === 1 ? '' : 's'} to their page</button>
                          : <div className="text-warn">{thread.context.openItems.changeRequests} change request{thread.context.openItems.changeRequests === 1 ? '' : 's'} to their page</div>)}
                        {thread.context.openItems.failedCharges > 0 && <button onClick={() => router.push(`/admin/courses/${selectedCourseId}?tab=money`)} className="block text-bad hover:underline text-left">{thread.context.openItems.failedCharges} failed charge{thread.context.openItems.failedCharges === 1 ? '' : 's'}</button>}
                      </div>
                    ) : <p className="text-sm text-ink-muted">Nothing open.</p>}
                  </section>
                </>
              )}
            </div>
          </aside>
        )}
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
