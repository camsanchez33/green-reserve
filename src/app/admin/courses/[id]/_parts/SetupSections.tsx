'use client';

// AW-7 (Cam 2026-10-21): the sections that make Setup the place to finish a
// course — the four checks (Stripe, agreement, schedule, staff), each with the
// one action that completes it; going live (moved from Overview); the build
// notes and sheet-vs-live drift (from Overview); documents (from Records); and
// the tee sheet and schedules (the old Operate tab).

import { setupProgress } from '@/lib/course-setup';
import { nextCall, overdueCall, fmtCallTime } from '@/lib/inquiry-call';
import { formatDate as fmtDate } from '@/lib/format';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
import { courseSetupChecks } from './useCourseDetail';
import { OperateTab } from './OperateTab';
import { useCourse } from './context';

const linkBtn = 'text-xs font-medium text-pine hover:underline disabled:opacity-50';

export function SetupChecks() {
  const { detail, c, reminderNudgeBusy, reminderNudgeSent, reminderNudgeError, sendGoLiveReminder, verifyBusy, verifyMsg, markVerified, openOperate } = useCourse();
  const checks = courseSetupChecks(detail);
  const action = (key: string) => {
    if (key === 'stripe' || key === 'agreement') {
      return <button onClick={() => sendGoLiveReminder(key)} disabled={reminderNudgeBusy || reminderNudgeSent} className={linkBtn}>{reminderNudgeBusy ? 'Sending…' : reminderNudgeSent ? 'Reminder sent' : 'Email them a reminder'}</button>;
    }
    if (key === 'schedule') return <button onClick={() => openOperate()} className={linkBtn}>Open the schedule</button>;
    if (key === 'staff' && c.operator && !c.operator.emailVerified) {
      return <button onClick={markVerified} disabled={verifyBusy} className={linkBtn}>{verifyBusy ? 'Working…' : 'Mark their email verified'}</button>;
    }
    return null;
  };
  return (
    <Card className="divide-y divide-line-soft">
      {checks.map(ch => (
        <div key={ch.key} className="flex items-center gap-3 px-5 py-3">
          <StatusDot status={ch.done ? 'ok' : 'warn'} />
          <span className="text-sm font-medium text-ink w-24 shrink-0">{ch.label}</span>
          <span className="text-sm text-ink-soft flex-1 min-w-0">{ch.detail}</span>
          {!ch.done && action(ch.key)}
          {ch.done && ch.key === 'schedule' && <button onClick={() => openOperate()} className={linkBtn}>Open</button>}
        </div>
      ))}
      {(verifyMsg || reminderNudgeError) && (
        <div className="px-5 py-2.5">
          {verifyMsg && <p className={'text-xs ' + (verifyMsg.startsWith('Error') ? 'text-bad' : 'text-ok')}>{verifyMsg}</p>}
          {reminderNudgeError && <p className="text-xs text-bad">{reminderNudgeError}</p>}
        </div>
      )}
    </Card>
  );
}

/** A course still being set up: every go-live step and the action for each (CS-3 §1). */
export function GoingLive() {
  const { detail, c, requestReReview, requestingReReview, sendCoursePreview, sendingPreview, markVerified, verifyBusy, sendGoLiveReminder, reminderNudgeBusy, reminderNudgeSent, toggleActive, liveToggleBusy } = useCourse();
  if (detail.health.status !== 'setup_incomplete' && detail.health.status !== 'orphaned') return null;
  const setup = setupProgress({ ...c, liveStatus: c.liveStatus ?? (c.active ? 'live' : 'draft'), approvalStatus: detail.approval.status });
  const discovery = (detail.calls ?? []).filter(x => x.kind === 'discovery');
  const dNext = nextCall(discovery);
  const dMissed = overdueCall(discovery);
  const stepAction = (key: string) => {
    if (key === 'approved') {
      if (detail.approval.status === 'changes_requested') {
        return <button onClick={requestReReview} disabled={requestingReReview} className={linkBtn}>{requestingReReview ? 'Requesting…' : 'Request re-review'}</button>;
      }
      return <button onClick={sendCoursePreview} disabled={sendingPreview || !c.operator?.email} className={linkBtn}>{sendingPreview ? 'Sending…' : 'Send preview'}</button>;
    }
    if (key === 'verified') return <button onClick={markVerified} disabled={verifyBusy || !c.operator?.email} className={linkBtn}>{verifyBusy ? 'Working…' : 'Mark verified'}</button>;
    if (key === 'stripe') return <button onClick={() => sendGoLiveReminder('stripe')} disabled={reminderNudgeBusy || reminderNudgeSent} className={linkBtn}>{reminderNudgeBusy ? 'Sending…' : reminderNudgeSent ? 'Reminder sent' : 'Send Stripe reminder'}</button>;
    if (key === 'live') return <button onClick={() => toggleActive(true)} disabled={liveToggleBusy} className={linkBtn}>{liveToggleBusy ? 'Working…' : 'Set live'}</button>;
    return null;
  };
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[15px] font-semibold text-ink">Going live</h2>
        <span className="text-xs text-ink-muted">{setup.done} of {setup.total}{setup.next ? ` · next: ${setup.next.short}` : ' · ready to go live'}</span>
      </div>
      <Card className="divide-y divide-line-soft">
        {setup.steps.map(st => (
          <div key={st.key} className="flex items-center gap-3 px-5 py-2.5">
            <StatusDot status={st.done ? 'ok' : 'neutral'} />
            <span className={'text-sm flex-1 ' + (st.done ? 'text-ink' : 'text-ink-soft')}>{st.label}</span>
            {!st.done && stepAction(st.key)}
          </div>
        ))}
        {(dNext || dMissed) && detail.origin && (
          <div className="flex items-center gap-2 px-5 py-2.5 text-xs">
            {dNext
              ? <span className="text-ink">Discovery call {fmtCallTime(dNext.scheduledAt)} · {dNext.durationMin} min</span>
              : <span className="text-warn">Discovery call went by {dMissed ? fmtCallTime(dMissed.scheduledAt) : ''} without a log</span>}
            <a href={`/admin/inquiries/${detail.origin.inquiryId}?call=1`} className="ml-auto font-medium text-pine hover:underline">Open on the inquiry</a>
          </div>
        )}
      </Card>
    </section>
  );
}

/** Changes the course asked for, build notes the builder left, and where the setup sheet and the live course disagree (MP-5e). */
export function BuildFindings() {
  const { detail, c } = useCourse();
  const notes = c.adminNotes && c.adminNotes.startsWith('[BUILD NOTES]')
    ? c.adminNotes.replace('[BUILD NOTES]\n', '').split('\n').filter(Boolean) : [];
  const drift = detail.configDrift ?? [];
  const changes = detail.openItems.openChanges;
  if (notes.length === 0 && drift.length === 0 && changes.length === 0) return null;
  return (
    <div className="space-y-5">
      {changes.length > 0 && (
        <Card className="p-5 border-l-[3px] border-warn">
          <h2 className="text-[15px] font-semibold text-ink">They asked for changes to their page</h2>
          <p className="text-sm text-ink-soft mt-0.5">{changes.join(', ')}</p>
          {detail.origin && <a href={`/admin/inquiries/${detail.origin.inquiryId}`} className="inline-block mt-2 text-xs font-medium text-pine hover:underline">Open the inquiry to work through them</a>}
        </Card>
      )}
      {notes.length > 0 && (
        <Card className="p-5 border-l-[3px] border-warn">
          <h2 className="text-[15px] font-semibold text-ink mb-2">Needs review after the build</h2>
          <ul className="space-y-1">
            {notes.map((line, i) => <li key={i} className="text-sm text-ink-soft">{line.replace(/^• /, '')}</li>)}
          </ul>
        </Card>
      )}
      {/* Read-only on purpose: a drift can mean the sheet is stale or the
          build got it wrong, and only a person knows which. */}
      {drift.length > 0 && (
        <Card className="p-5 border-l-[3px] border-warn">
          <h2 className="text-[15px] font-semibold text-ink">Their setup sheet disagrees with the live course</h2>
          <p className="text-sm text-ink-soft mt-0.5 mb-3">Neither side is assumed right — this only shows that they differ. Fix it in the settings below.</p>
          <div className="divide-y divide-line-soft">
            <div className="grid grid-cols-3 gap-3 py-2 text-[13px] font-semibold text-ink">
              <span>Field</span><span>They told us</span><span>Golfers see</span>
            </div>
            {drift.map(d2 => (
              <div key={d2.field} className="grid grid-cols-3 gap-3 py-2">
                <span className="text-xs text-ink-muted truncate">{d2.label}</span>
                <span className="text-xs text-ink-soft break-words">{d2.sheet}</span>
                <span className="text-xs text-ink font-medium break-words">{d2.live}</span>
              </div>
            ))}
          </div>
          {detail.origin && <a href={`/admin/inquiries/${detail.origin.inquiryId}`} className="inline-block mt-3 text-xs font-medium text-pine hover:underline">Open their sheet</a>}
        </Card>
      )}
    </div>
  );
}

/** Signed agreements, the other records, and uploaded PDFs (was the Records tab). */
export function Documents() {
  const { courseId, c, docsData, docsLoading, docsError, docUploading, uploadDocument } = useCourse();
  return (
    <section id="documents">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[15px] font-semibold text-ink">Documents</h2>
        <label className="text-xs font-medium text-pine hover:text-pine-hover cursor-pointer">
          {docUploading ? 'Uploading…' : 'Upload a PDF'}
          <input type="file" accept="application/pdf" className="hidden" disabled={docUploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocument(f); e.target.value = ''; }} />
        </label>
      </div>
      {docsError && <div className="mb-3 text-sm px-4 py-2.5 rounded-md border bg-bad/5 text-bad border-bad/20">{docsError}</div>}
      {docsLoading && !docsData && <Card className="px-5 py-6 text-sm text-ink-muted">Loading…</Card>}
      {docsData && (
        <Card className="divide-y divide-line-soft">
          {/* AG-2 §3: one row per acceptance, and "Not signed" per signable document still missing. */}
          {(docsData.agreements?.documents ?? []).filter(d2 => !d2.signed).map(d2 => (
            <div key={d2.document} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span className="text-ink-soft">{d2.title} v{d2.version}</span>
              <StatusDot status="bad" label="Not signed" />
            </div>
          ))}
          {(docsData.acceptances ?? []).map(a => (
            <div key={a.id} className="grid grid-cols-[1.3fr_1.2fr_auto] gap-3 px-5 py-2.5 items-center">
              <div className="min-w-0">
                <div className="text-sm text-ink truncate">{a.title} <span className="text-ink-muted">v{a.version}{a.legacy ? ' · legacy' : ''}</span></div>
                <div className="text-xs text-ink-muted truncate">{a.signerName ? `${a.signerName}${a.signerTitle ? ', ' + a.signerTitle : ''}` : a.signerEmail || 'no signer recorded'}</div>
              </div>
              <div className="min-w-0">
                <div className="text-xs text-ink">Signed {fmtDate(a.acceptedAt)}</div>
                <div className="text-xs text-ink-muted truncate">{a.ip ? 'IP ' + a.ip : ''}</div>
              </div>
              <div className="text-right">
                {a.pdfUrl
                  ? <a href={`/api/admin/course-documents/download?courseId=${c.id}&url=${encodeURIComponent(a.pdfUrl)}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-pine hover:underline">PDF</a>
                  : <span className="text-xs text-ink-muted">{a.legacy ? '—' : 'PDF pending'}</span>}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-5 py-2.5 text-sm">
            <span className="text-ink-soft">Stripe connected-account agreement</span>
            <span className="text-ink">{docsData.stripeAgreementDate ? fmtDate(docsData.stripeAgreementDate) : 'Not connected'}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-2.5 text-sm">
            <span className="text-ink-soft">Their page, approved</span>
            <span className="text-ink">{docsData.approval.approvedAt ? fmtDate(docsData.approval.approvedAt) : 'Not yet'}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-2.5 text-sm">
            <span className="text-ink-soft">Booking terms in force</span>
            <span className="text-ink">v{docsData.bookingTermsVersion}</span>
          </div>
          {docsData.documents.map((doc, i) => (
            // MP-5a: contracts are private blobs — served through the authenticated route, never by raw URL.
            <a key={i} href={`/api/admin/course-documents/download?courseId=${courseId}&url=${encodeURIComponent(doc.url)}`}
              target="_blank" rel="noreferrer" className="flex items-center gap-3 px-5 py-2.5 text-sm hover:text-pine">
              <span className="flex-1 min-w-0 truncate text-ink">{doc.name}</span>
              <span className="text-xs text-ink-muted shrink-0">{fmtDate(doc.at)} · {doc.by}</span>
            </a>
          ))}
        </Card>
      )}
    </section>
  );
}

/** The tee sheet, schedules and members (was the Operate tab), closed until asked for. */
export function TeeSheetAndSchedule() {
  const { operateOpen, setOperateOpen, openOperate } = useCourse();
  return (
    <section id="tee-sheet-schedule">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[15px] font-semibold text-ink">Tee sheet and schedule</h2>
        <button onClick={() => operateOpen ? setOperateOpen(false) : openOperate()} className={linkBtn}>{operateOpen ? 'Hide' : 'Show'}</button>
      </div>
      {operateOpen ? <OperateTab /> : <p className="text-sm text-ink-muted">Their tee sheet for any day, the schedules that make it, and their members.</p>}
    </section>
  );
}
