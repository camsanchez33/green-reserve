'use client';

// AW-7 (Cam 2026-10-21): Contact & notes — who to call and how, the check-in
// call, the message thread, notes and calls, and every touchpoint in one line
// of time. Moved from Overview (contact rail, check-in, relationship) and
// Records (notes, calls); Messages is the old tab, unchanged.

import Link from 'next/link';
import CourseCheckInCard, { describeCheckIn } from '@/components/admin/CourseCheckInCard';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
import { formatDate as fmtDate } from '@/lib/format';
import { PERMISSIONS } from '@/lib/staff-permissions';
import { iCls } from './shared';
import { MessagesTab } from './MessagesTab';
import { useCourse } from './context';
import { courseProblemsInput } from './useCourseDetail';

const STAFF_PRESET_LABEL: Record<string, string> = { starter: 'Starter', front_desk: 'Front desk', manager: 'Manager', custom: 'Custom', legacy: 'Original staff access' };
const row = (label: string, value: React.ReactNode) => (
  <div className="flex justify-between gap-3 py-2"><dt className="text-ink-muted">{label}</dt><dd className="text-ink text-right min-w-0 break-words">{value}</dd></div>
);

export function ContactTab() {
  const { detail, c, checkinFocus, loadDetail, phoneState, savePhone, resendingId, resendMsg, resendSetup, docsData, docsLoading, docsError, noteDraft, setNoteDraft, noteSaving, addClientNote } = useCourse();
  const rel = detail.relationship;
  // The check-in card leads only when the call is due (that's why the page
  // opened here); otherwise it sits below the conversation.
  const checkInDue = courseProblemsInput(detail).checkInOverdue;
  const checkIn = c.active && !c.archivedAt ? (
    <CourseCheckInCard
      courseId={c.id}
      operatorName={c.operator?.name || ''}
      phone={c.phone || c.operator?.phone || ''}
      nextCheckInAt={c.nextCheckInAt ?? null}
      calls={detail.calls ?? []}
      onRefresh={loadDetail}
      focus={checkinFocus}
    />
  ) : null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 max-w-6xl">
      <div className="space-y-6 min-w-0">
        {checkInDue && checkIn}

        <section>
          <h2 className="text-[15px] font-semibold text-ink mb-2">Messages{detail.openItems.unreadMessages > 0 ? <span className="ml-2 text-[13px] font-normal text-bad">{detail.openItems.unreadMessages} unread</span> : null}</h2>
          <MessagesTab />
        </section>

        <section>
          <h2 className="text-[15px] font-semibold text-ink mb-2">Notes</h2>
          <Card className="p-5">
            <div className="flex gap-2 mb-4">
              <input value={noteDraft} onChange={e => setNoteDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addClientNote(); }}
                placeholder="Add a note for the team…" className={iCls} />
              <button onClick={addClientNote} disabled={noteSaving || !noteDraft.trim()}
                className="shrink-0 px-4 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-sm font-medium rounded-md transition-colors">
                {noteSaving ? 'Saving…' : 'Add'}
              </button>
            </div>
            {docsError && <p className="text-sm text-bad mb-2">{docsError}</p>}
            {docsLoading && !docsData ? <p className="text-sm text-ink-muted">Loading…</p>
              : !docsData || docsData.notes.length === 0 ? <p className="text-sm text-ink-soft">No notes yet.</p>
              : (
                <div className="space-y-3">
                  {docsData.notes.map((n, i) => (
                    <div key={i} className="text-sm">
                      <p className="text-ink whitespace-pre-wrap">{n.text}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{n.by} · {fmtDate(n.at)}</p>
                    </div>
                  ))}
                </div>
              )}
          </Card>
        </section>

        {!checkInDue && checkIn}

        {(detail.calls ?? []).length > 0 && (
          <section>
            <h2 className="text-[15px] font-semibold text-ink mb-2">Calls</h2>
            <Card className="divide-y divide-line-soft">
              {(detail.calls ?? []).map(cl => (
                <div key={cl.id} className="px-5 py-2.5">
                  <div className="text-sm text-ink">{describeCheckIn(cl)}</div>
                  {cl.notes && <div className="text-xs text-ink-soft mt-1 whitespace-pre-wrap">{cl.notes}</div>}
                </div>
              ))}
            </Card>
          </section>
        )}

        {/* MP-5e part 3: every touchpoint — notes, messages, pipeline moves, calls, settings. */}
        {rel && (
          <section>
            <h2 className="text-[15px] font-semibold text-ink mb-2">History</h2>
            <Card className="px-5 py-2">
              {rel.feed.length === 0 ? (
                <p className="text-sm text-ink-soft py-2">Nothing recorded yet — notes, messages, calls and pipeline moves will show here.</p>
              ) : (
                <div className="divide-y divide-line-soft">
                  {rel.feed.map((f, i) => (
                    <div key={i} className="py-2 grid grid-cols-[88px_76px_minmax(0,1fr)] gap-3 text-[13.5px]">
                      <span className="text-ink-muted tabular-nums">{fmtDate(f.at)}</span>
                      <span className="text-[13px] font-semibold text-ink pt-0.5">{f.kind}</span>
                      <span className="text-ink min-w-0 break-words">{f.text}{f.by ? <span className="text-ink-muted"> · {f.by}</span> : null}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>
        )}
      </div>

      <div className="space-y-5">
        {c.operator ? (
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold text-ink mb-1">{c.operator.name}</h2>
            <p className="text-xs text-ink-muted mb-3">Owner</p>
            <div className="space-y-1.5 mb-3 text-sm">
              {c.operator.phone && <a href={'tel:' + c.operator.phone} className="block text-pine hover:text-pine-hover">{c.operator.phone}</a>}
              <a href={'mailto:' + c.operator.email} className="block text-ink-soft hover:text-pine break-all">{c.operator.email}</a>
            </div>
            <div className="flex gap-3 flex-wrap">
              {c.operator.emailVerified ? <StatusDot status="ok" label="Email verified" /> : <StatusDot status="bad" label="Email not verified" />}
            </div>
          </Card>
        ) : (
          <Card className="p-5 text-sm text-bad">No owner login for this course.</Card>
        )}

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink mb-2">The course</h2>
          <dl className="text-sm divide-y divide-line-soft">
            <div className="flex items-center gap-3 py-2">
              <dt className="text-ink-muted shrink-0">Phone</dt>
              <input defaultValue={c.phone || ''} onBlur={e => { if (e.target.value !== (c.phone || '')) savePhone(e.target.value); }}
                placeholder="Not set" aria-label="Course phone"
                className="flex-1 min-w-0 text-right bg-transparent text-ink outline-none border-b border-transparent focus:border-pine/40" />
            </div>
            {phoneState && <p className={'text-[11px] py-1 ' + (phoneState === 'saving' ? 'text-ink-muted' : phoneState === 'saved' ? 'text-ok' : 'text-bad')}>{phoneState === 'saving' ? 'Saving…' : phoneState === 'saved' ? 'Saved' : phoneState}</p>}
            {row('Where', [c.city, c.state].filter(Boolean).join(', '))}
            {row('Type', <span className="capitalize">{c.type}</span>)}
            {row('Owner last signed in', rel?.operatorLastLoginAt ? fmtDate(rel.operatorLastLoginAt) : 'Never')}
            {row('Staff last seen', detail.staffSeenAt ? fmtDate(detail.staffSeenAt) : 'Never')}
            {row('First went live', rel?.firstWentLiveAt ? fmtDate(rel.firstWentLiveAt) : 'Not yet')}
            {row('Came from', detail.origin
              ? <Link href={'/admin/inquiries/' + detail.origin.inquiryId} className="text-pine hover:underline">Their inquiry</Link>
              : <span className="text-bad">No linked inquiry</span>)}
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-ink mb-3">Staff</h2>
          {detail.staff.length === 0 ? <p className="text-sm text-ink-soft">No staff logins — the owner works the dashboard alone.</p> : (
            <div className="space-y-3">
              {detail.staff.map(s => (
                <div key={s.id} className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink truncate">
                      {s.name} <span className="text-xs text-ink-muted font-normal">· {STAFF_PRESET_LABEL[s.preset] ?? 'Custom'}{s.active ? '' : ' · inactive'}</span>
                    </div>
                    <a href={'mailto:' + s.email} className="text-xs text-pine hover:underline truncate block">{s.email}</a>
                    {/* SP-A: read-only — the course owner sets this in their Settings. */}
                    <details className="mt-1">
                      <summary className="text-[11px] text-ink-muted cursor-pointer hover:text-ink">{s.permissions.length} permission{s.permissions.length === 1 ? '' : 's'}</summary>
                      <ul className="mt-1 text-[11.5px] text-ink-soft space-y-0.5">
                        {PERMISSIONS.filter(p => s.permissions.includes(p.key)).map(p => <li key={p.key}>{p.group} · {p.label}{p.movesMoney ? ' (moves money)' : ''}</li>)}
                      </ul>
                    </details>
                  </div>
                  <button onClick={() => resendSetup(s.id, s.name)} disabled={resendingId === s.id} title="Email this person a fresh dashboard login"
                    className="shrink-0 text-[11px] font-medium text-pine hover:text-pine-hover px-2 py-1 rounded-md border border-pine/20 hover:bg-pine/5 disabled:opacity-50">
                    {resendingId === s.id ? 'Sending…' : 'Resend login'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {resendMsg && <p className={'text-xs mt-3 ' + (resendMsg.startsWith('Error') ? 'text-bad' : 'text-ok')}>{resendMsg}</p>}
        </Card>
      </div>
    </div>
  );
}
