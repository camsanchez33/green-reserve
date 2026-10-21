'use client';

import { ArrowLeft, X, MoreVertical, RefreshCw } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
import { COURSE_TABS } from '@/lib/admin-course-tabs';
import { useCourseDetail, courseSetupChecks, courseTabProblems } from './_parts/useCourseDetail';
import { CourseDetailContext } from './_parts/context';
import { CourseDialogs } from './_parts/CourseDialogs';
import { BookingsTab } from './_parts/BookingsTab';
import { MoneyTab } from './_parts/MoneyTab';
import { SetupTab } from './_parts/SetupTab';
import { ContactTab } from './_parts/ContactTab';

// AW-7 (Cam 2026-10-21): four tabs — Bookings · Money · Setup · Contact &
// notes — opening on the one with a problem (lib/admin-course-tabs.ts).

export default function CourseDetailPage() {
  const s = useCourseDetail();
  const { router, adminReady, detail, loading, loadError, tab, setTab, sendingPreview, previewMsg, setPreviewMsg, setShowPreviewConfirm, requestingReReview, dangerOpen, setDangerOpen, archiveBusy, liveToggleBusy, setClosureError, liveBlockReason, setLiveBlockReason, liveBlockMissing, setLiveBlockMissing, reminderNudgeBusy, reminderNudgeSent, setReminderNudgeSent, reminderNudgeError, setReminderNudgeError, loadDetail, toggleActive, sendGoLiveReminder, archiveCourse, restoreCourse, selectTab, requestReReview, c } = s;

  if (!adminReady || loading) {
    return (
      <div className="min-h-screen bg-paper flex">
        <AdminSidebar active="courses" />
        <div className="admin-content flex-1 flex items-center justify-center">
          <div className="text-ink-muted text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-paper flex">
        <AdminSidebar active="courses" />
        <div className="admin-content flex-1 flex items-center justify-center flex-col gap-4">
          <div className="bg-bad/5 border border-bad/20 rounded-lg px-6 py-5 text-center max-w-sm">
            <div className="text-bad text-sm font-medium mb-1">Failed to load course</div>
            <div className="text-ink-muted text-xs mb-4">{loadError}</div>
            <div className="flex gap-2 justify-center">
              <button onClick={loadDetail} className="px-4 py-2 bg-pine hover:bg-pine-hover text-white text-sm font-medium rounded-md transition-colors">Retry</button>
              <button onClick={() => router.push('/admin/courses')} className="px-4 py-2 border border-line text-ink-soft hover:text-ink rounded-md text-sm transition-colors">Back to list</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!detail || !c) {
    return (
      <div className="min-h-screen bg-paper flex">
        <AdminSidebar active="courses" />
        <div className="admin-content flex-1 flex items-center justify-center flex-col gap-3">
          <div className="text-ink-muted text-sm">Course not found</div>
          <button onClick={() => router.push('/admin/courses')} className="text-pine text-sm hover:underline">Back to list</button>
        </div>
      </div>
    );
  }

  return (
    <CourseDetailContext.Provider value={{ ...s, detail, c }}>
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="courses" />
      <div className="admin-content flex-1 flex flex-col min-h-screen">

        {/* Sticky page header */}
        <div className="bg-white border-b border-line px-8 py-5 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/admin/courses')}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-paper text-ink-muted hover:text-ink transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-0.5">
                <h1 className="text-[30px] leading-none font-serif text-ink truncate">{c.name}</h1>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span title={detail.health.reason}><StatusDot status={detail.health.dot} label={detail.health.label} /></span>
                {detail.health.reason && <span className="text-xs text-ink-soft">{detail.health.reason}</span>}
                <span className="text-xs text-ink-muted">{c.city}, {c.state}</span>
                <span className="text-xs text-ink-muted capitalize">{c.type}</span>
                {detail?.approval.approvedAt && (
                  <span className="text-xs text-ink-faint">
                    Page approved by course · {new Date(detail.approval.approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!c.active && c.operator && detail?.approval.status === 'approved' && (
                <>
                  <span className="px-3 py-1.5 rounded-md text-xs font-medium border bg-ok/5 text-ok border-ok/20 flex items-center gap-1.5">
                    <StatusDot status="ok" />
                    Approved{detail.approval.approvedAt ? ' · ' + new Date(detail.approval.approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </span>
                  <button
                    onClick={requestReReview}
                    disabled={requestingReReview}
                    className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors bg-paper text-ink-soft border-line hover:text-ink hover:border-line-strong disabled:opacity-50"
                    title="Reopen the review loop without waiting on the course"
                  >
                    {requestingReReview ? 'Requesting…' : 'Request re-review'}
                  </button>
                </>
              )}
              {!c.active && c.operator && detail?.approval.status !== 'approved' && (
                <button
                  onClick={() => setShowPreviewConfirm(true)}
                  disabled={sendingPreview}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 bg-paper text-ink-soft border-line hover:text-pine hover:border-pine/30 hover:bg-pine/5 disabled:opacity-50"
                  title="Send preview + dashboard access to operator"
                >
                  
                  {sendingPreview ? 'Sending…' : 'Send preview'}
                </button>
              )}
              <button
                onClick={() => {
                  // Going live is announced by the preflight; going offline is
                  // gated by the server's booking check, which supplies the
                  // real numbers instead of a confirm() guessing at them.
                  if (c.active) { setClosureError(''); toggleActive(false); }
                  else if (confirm(`Set "${c.name}" live? Golfers will be able to book immediately.`)) toggleActive(true);
                }}
                disabled={liveToggleBusy}
                className={'hidden min-[1200px]:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 ' + (c.active ? 'bg-bad/5 text-bad border-bad/20 hover:bg-bad/10' : 'bg-ok/5 text-ok border-ok/20 hover:bg-ok/10')}
              >
                
                {liveToggleBusy ? 'Working…' : c.active ? 'Take offline' : 'Set live'}
              </button>
              <a
                href={'/courses/' + c.slug}
                target="_blank"
                className="hidden min-[1200px]:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-line text-ink-soft hover:text-pine hover:border-pine/30 hover:bg-pine/5 transition-colors"
              >
                View page
              </a>
              <button
                onClick={loadDetail}
                aria-label="Refresh"
                className="hidden min-[1200px]:flex w-9 h-9 items-center justify-center rounded-md border border-line text-ink-muted hover:text-ink hover:bg-paper transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <div className="relative">
                <button
                  onClick={() => setDangerOpen(o => !o)}
                  className="w-9 h-9 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-paper transition-colors border border-line"
                  title="More actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {dangerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setDangerOpen(false)} />
                    <Card className="absolute right-0 top-10 z-20 shadow-card border border-line w-64 py-1.5">
                      {/* Below ~1200px the header's action row cannot fit, so
                          Take offline / View page / Refresh live here instead.
                          Same handlers, same pending + disabled state —
                          relocated, not duplicated behaviour. */}
                      <div className="min-[1200px]:hidden">
                        <button
                          onClick={async () => {
                            if (!confirm(c.active ? `Take "${c.name}" offline? Golfers will no longer be able to book.` : `Set "${c.name}" live? Golfers will be able to book immediately.`)) { setDangerOpen(false); return; }
                            await toggleActive(!c.active);
                            setDangerOpen(false);
                          }}
                          disabled={liveToggleBusy}
                          className={'w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-paper transition-colors disabled:opacity-50 ' + (c.active ? 'text-bad' : 'text-ok')}
                        >
                          
                          {liveToggleBusy ? 'Working…' : c.active ? 'Take offline' : 'Set live'}
                        </button>
                        <a
                          href={'/courses/' + c.slug}
                          target="_blank"
                          onClick={() => setDangerOpen(false)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink-soft hover:bg-paper transition-colors"
                        >
                          View page
                        </a>
                        <button
                          onClick={() => { setDangerOpen(false); loadDetail(); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink-soft hover:bg-paper transition-colors"
                        >
                          Refresh
                        </button>
                        <div className="border-t border-line-soft my-1.5" />
                      </div>
                      {c.archivedAt ? (
                        <button
                          onClick={() => { setDangerOpen(false); restoreCourse(); }}
                          disabled={archiveBusy}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ok hover:bg-ok/5 transition-colors disabled:opacity-50"
                        >
                          Restore course
                        </button>
                      ) : (
                        <button
                          onClick={() => { setDangerOpen(false); archiveCourse(); }}
                          disabled={archiveBusy}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink-soft hover:bg-paper transition-colors disabled:opacity-50"
                        >
                          Archive course
                        </button>
                      )}
                      {/* DELETION DOCTRINE (RUN_QUEUE) — anything that ever
                          became a course is archive-only, never permanently
                          deleted, from here or the API. No delete button. */}
                      <div className="border-t border-line-soft my-1.5" />
                      <p className="px-3 py-2 text-[11px] text-ink-soft leading-relaxed">
                        Courses are archived, never deleted — booking and payment history is retained.
                      </p>
                    </Card>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* AGREEMENT = GO-LIVE GATE / STRIPE RULE FINAL (RUN_QUEUE) — two
              absolutes, no override, ever. A blocked go-live gets a one-click
              reminder nudge instead of a way around it. */}
          {liveBlockReason && (
            <div className="mt-3 rounded-md px-4 py-2.5 bg-bad/5 border border-bad/20 flex items-center justify-between gap-3">
              <p className="text-xs text-bad">
                {liveBlockReason}
                {reminderNudgeError && <span className="block mt-0.5">{reminderNudgeError}</span>}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { setLiveBlockReason(''); setLiveBlockMissing(null); setReminderNudgeSent(false); setReminderNudgeError(''); }} className="text-xs text-ink-muted hover:text-ink transition-colors">Dismiss</button>
                {liveBlockMissing && (
                  <button
                    onClick={() => sendGoLiveReminder(liveBlockMissing)}
                    disabled={reminderNudgeBusy || reminderNudgeSent}
                    className="text-xs font-medium px-3 py-1 rounded-md bg-bad text-white hover:bg-bad/90 transition-colors disabled:opacity-50"
                  >
                    {reminderNudgeBusy ? 'Sending…' : reminderNudgeSent ? 'Sent' : 'Send reminder'}
                  </button>
                )}
              </div>
            </div>
          )}

          {previewMsg && (
            <div className={'mt-3 rounded-md px-4 py-2 flex items-center justify-between gap-3 ' + (previewMsg.startsWith('Error') ? 'bg-bad/5 border border-bad/20' : 'bg-ok/5 border border-ok/20')}>
              <p className={'text-xs ' + (previewMsg.startsWith('Error') ? 'text-bad' : 'text-ok')}>{previewMsg}</p>
              <button onClick={() => setPreviewMsg('')} className="text-ink-muted hover:text-ink transition-colors shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {(() => {
            const problems = courseTabProblems(detail);
            const setupDone = courseSetupChecks(detail).every(x => x.done);
            return (
              <div role="tablist" className="flex items-center gap-6 mt-5 -mb-5 overflow-x-auto">
                {COURSE_TABS.map(t => (
                  <button
                    key={t.key} role="tab" aria-selected={tab === t.key}
                    onClick={() => selectTab(t.key)}
                    className={'flex items-center gap-1.5 pb-3 text-[14px] whitespace-nowrap border-b-2 transition-colors ' + (tab === t.key ? 'border-fairway text-ink font-semibold' : 'border-transparent text-ink-muted hover:text-ink')}
                  >
                    {problems[t.key] && <StatusDot status={t.key === 'money' ? 'bad' : 'warn'} />}
                    {t.label}
                    {t.key === 'setup' && setupDone && <span className="text-ok" aria-label="all done">✓</span>}
                    {t.key === 'contact' && detail.openItems.unreadMessages > 0 && <span className="text-[12px] text-bad">{detail.openItems.unreadMessages}</span>}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Archived notice */}
        {c.archivedAt && (
          <div className="mx-8 mt-5 px-4 py-3 rounded-lg bg-bad/5 border border-bad/20 flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium text-bad">This course is archived</span>
              <span className="text-sm text-ink-soft ml-2">
                — archived {new Date(c.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {c.archivedBy ? ` by ${c.archivedBy}` : ''}. Public pages return 404.
              </span>
            </div>
            <button
              onClick={restoreCourse}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-ok/10 text-ok border border-ok/20 hover:bg-ok/20 transition-colors"
            >
              Restore
            </button>
          </div>
        )}

        {/* Tab content */}
        <div className="px-8 py-7 flex-1">

          {tab === 'bookings' && <BookingsTab/>}
          {tab === 'money' && <MoneyTab/>}
          {tab === 'setup' && <SetupTab/>}
          {tab === 'contact' && <ContactTab/>}

        </div>
      </div>

      
      <CourseDialogs/>
    </div>
    </CourseDetailContext.Provider>
  );
}
