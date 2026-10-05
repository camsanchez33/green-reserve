'use client';

// MP-12 (ADMIN_V4 V4-9): split out of admin/courses/[id]/page.tsx, which had
// grown to 2,700 lines and 52 useState in one component. Moved verbatim; state
// and handlers come from useCourseDetail() via useCourse().

import { X, Send } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useCourse } from './context';

export function MessagesTab() {
  const { courseId, thr, msgThread, msgLoading, msgError, setMsgError, msgCompose, setMsgCompose, msgSending, loadCourseThread, sendCourseMessage } = useCourse();
  return (
            <div className="max-w-2xl">
              <Card className="flex flex-col" style={{ minHeight: 480 }}>
                {/* Messages list */}
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4" style={{ maxHeight: 420 }}>
                  {msgLoading && <div className="py-8 text-center text-ink-muted text-sm">Loading...</div>}
                  {!msgLoading && thr.error && (
                    <div className="py-8 text-center">
                      <div className="text-sm text-bad mb-2">{thr.error.msg}</div>
                      <button onClick={loadCourseThread} className="text-xs font-medium text-ink-soft hover:text-ink px-3 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">Retry</button>
                    </div>
                  )}
                  {!msgLoading && !thr.error && (!msgThread || msgThread.messages.length === 0) && (
                    <div className="py-8 text-center">
                      
                      <div className="text-sm text-ink-muted">No messages yet. Start the conversation below.</div>
                    </div>
                  )}
                  {!msgLoading && msgThread && msgThread.messages.map(msg => {
                    const isAdmin = msg.senderType === 'admin';
                    return (
                      <div key={msg.id} className={isAdmin ? 'flex justify-end' : 'flex justify-start'}>
                        <div className="max-w-[70%]">
                          {msg.isBroadcast && (
                            <div className="text-[10px] text-ink-muted mb-1 flex items-center gap-1">
                               Announcement
                            </div>
                          )}
                          <div className={
                            'px-4 py-2.5 rounded-lg text-sm whitespace-pre-wrap leading-relaxed ' + (
                              isAdmin
                                ? 'bg-pine text-white rounded-br-none'
                                : 'bg-paper border border-line text-ink rounded-bl-none'
                            )
                          }>
                            {msg.body}
                          </div>
                          <div className={'text-[10px] mt-1 text-ink-faint ' + (isAdmin ? 'text-right' : '')}>
                            {msg.senderName} · {new Date(msg.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                            {isAdmin && msg.readAt && <span className="ml-1 text-pine/60">· Read</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Composer */}
                <div className="border-t border-line px-5 py-4 shrink-0">
                  {msgError && (
                    <div className="mb-3 text-xs text-bad bg-bad/5 border border-bad/20 rounded-md px-3 py-2 flex items-center justify-between gap-3">
                      <span>{msgError}</span>
                      <button onClick={() => setMsgError('')} className="text-ink-muted hover:text-ink transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  <div className="flex gap-3 items-end">
                    <textarea
                      value={msgCompose}
                      onChange={e => setMsgCompose(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendCourseMessage(); }
                      }}
                      placeholder="Message this course..."
                      rows={2}
                      className="flex-1 bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 resize-none"
                    />
                    <button
                      disabled={!msgCompose.trim() || msgSending}
                      onClick={sendCourseMessage}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors shrink-0"
                    >
                      {msgSending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                  <div className="text-[10px] text-ink-faint mt-1.5">⌘/Ctrl + Enter to send · <button onClick={() => window.open('/admin/messages?courseId=' + courseId, '_blank')} className="text-pine hover:underline">Open full view</button></div>
                </div>
              </Card>
            </div>
          );
}
