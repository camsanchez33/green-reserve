'use client';

// MP-12 (ADMIN_V4 V4-9): split out of admin/courses/[id]/page.tsx, which had
// grown to 2,700 lines and 52 useState in one component. Moved verbatim; state
// and handlers come from useCourseDetail() via useCourse().

import { X } from 'lucide-react';
import { formatDate as fmtDate, formatMoney as fmtMoney } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { iCls } from './shared';
import { useCourse } from './context';

export function CourseDialogs() {
  const { detail, manualSlot, setManualSlot, manualForm, setManualForm, manualSaving, manualError, refundTarget, setRefundTarget, refundAmount, setRefundAmount, refundReason, setRefundReason, refundBusy, refundError, schedDeleteTarget, setSchedDeleteTarget, schedDeleteBusy, schedDeleteError, setSchedDeleteError, sendingPreview, showPreviewConfirm, setShowPreviewConfirm, archiveBusy, liveToggleBusy, closurePrompt, setClosurePrompt, closureError, setClosureError, toggleActive, archiveCourse, deleteSchedule, addManualBooking, submitRefund, sendCoursePreview } = useCourse();
  return (
    <>
{/* MP-5b: the consequence, in numbers, before anything happens. This
          only ever appears because the SERVER refused to close a course over
          standing bookings — the counts are its, not a guess made here. */}
      {closurePrompt && (() => {
        const { action, impact } = closurePrompt;
        const verb = action === 'archive' ? 'Archive' : 'Take offline';
        const busy = action === 'archive' ? archiveBusy : liveToggleBusy;
        const plural = impact.bookings === 1 ? '' : 's';
        return (
          <Modal size="md" pad="p-6" title={`${impact.bookings} golfer booking${plural} still standing`} onClose={() => { setClosurePrompt(null); setClosureError(''); }} dismissable={!busy}
            titleNode={<h3 className="font-serif font-medium text-ink mb-2">
                {impact.bookings} golfer booking{plural} {impact.bookings === 1 ? 'is' : 'are'} still standing
              </h3>}>
              <p className="text-sm text-ink-soft mb-3">
                {verb === 'Archive' ? 'Archiving' : 'Taking'} <strong>{detail?.course.name}</strong>
                {verb === 'Archive' ? '' : ' offline'} removes it from the public site. These rounds would be left
                booked at a course golfers can no longer see.
              </p>
              <div className="bg-paper border border-line rounded-md px-4 py-3 mb-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-ink-muted">Bookings</span><span className="text-ink font-medium">{impact.bookings}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Players</span><span className="text-ink font-medium">{impact.players}</span></div>
                <div className="flex justify-between"><span className="text-ink-muted">Golfers to email</span><span className="text-ink font-medium">{impact.golfers}</span></div>
                {impact.nextDate && (
                  <div className="flex justify-between"><span className="text-ink-muted">Soonest</span><span className="text-ink font-medium">{impact.nextDate}</span></div>
                )}
                {impact.withMoney > 0 && (
                  <div className="flex justify-between"><span className="text-warn">Already took money</span><span className="text-warn font-medium">{impact.withMoney}</span></div>
                )}
              </div>
              <p className="text-xs text-ink-soft mb-1">
                Continuing cancels {impact.bookings === 1 ? 'it' : 'them all'} and emails {impact.golfers === 1 ? 'the golfer' : 'each golfer'} to explain why.
                {impact.withMoney > 0 && ' Anything already charged is refunded.'}
              </p>
              <p className="text-xs text-ink-soft mb-4">
                Golfers watching for an opening at these times are deliberately NOT told — the course is closing, not freeing up.
              </p>
              {closureError && <p className="text-xs text-bad mb-3">{closureError}</p>}
              <div className="flex gap-3">
                <button onClick={() => { setClosurePrompt(null); setClosureError(''); }}
                  className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors">
                  Leave it live
                </button>
                <button
                  onClick={() => { if (action === 'archive') archiveCourse(true); else toggleActive(false, true); }}
                  disabled={busy}
                  className="flex-1 bg-bad hover:bg-bad/90 text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Working…' : `Cancel ${impact.bookings} & ${verb.toLowerCase()}`}
                </button>
              </div>
          </Modal>
        );
      })()}

      {/* MP-5a: deleting a schedule now says what it costs, and the rebuild it
          triggers is described honestly — unsold slots go, sold ones stay. */}
      {schedDeleteTarget && (
        <Modal size="sm" pad="p-6" title="Delete this schedule?" onClose={() => { setSchedDeleteTarget(null); setSchedDeleteError(''); }} dismissable={!schedDeleteBusy}
          titleNode={<h3 className="font-serif font-medium text-ink mb-2">Delete this schedule?</h3>}>
            <p className="text-sm text-ink-soft mb-2">
              The tee sheet is rebuilt straight away, so the times this schedule was creating stop being bookable.
            </p>
            <p className="text-sm text-ink-soft mb-4">
              Tee times that are already booked or blocked are kept — golfers who have paid keep their slot.
            </p>
            {schedDeleteError && (
              <p className="text-xs text-bad mb-3">{schedDeleteError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setSchedDeleteTarget(null); setSchedDeleteError(''); }}
                className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors">
                Cancel
              </button>
              <button
                onClick={() => deleteSchedule(schedDeleteTarget)}
                disabled={schedDeleteBusy}
                className="flex-1 bg-bad hover:bg-bad/90 text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors"
              >
                {schedDeleteBusy ? 'Deleting…' : 'Delete schedule'}
              </button>
            </div>
        </Modal>
      )}

      {/* MP-6b: refund a paid round. Money leaves the course's Stripe account
          and GreenReserve's fee on it is reversed pro rata; the golfer is
          emailed the reason. Full unless an amount is given. */}
      {refundTarget && (
        <Modal size="sm" pad="p-6" title={`Refund ${refundTarget.golferName}`} onClose={() => setRefundTarget(null)} dismissable={!refundBusy}
          titleNode={<h3 className="font-serif font-medium text-ink mb-1">Refund {refundTarget.golferName}</h3>}>
            <p className="text-sm text-ink-soft mb-4">
              {fmtMoney(refundTarget.amount)} was charged for {fmtDate(refundTarget.date)}. The money goes back to the card they paid with; the course&apos;s payout and GreenReserve&apos;s fee are both reduced.
            </p>
            <label className="block"><Eyebrow as="span" className="block mb-1.5">Amount (blank = full refund)</Eyebrow>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
              <input type="number" step="0.01" min="0.01" max={refundTarget.amount} value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder={refundTarget.amount.toFixed(2)} className={iCls + ' pl-7'} />
            </div></label>
            <label className="block"><Eyebrow as="span" className="block mb-1.5">Reason — the golfer reads this</Eyebrow>
            <textarea value={refundReason} onChange={e => setRefundReason(e.target.value)} rows={3} placeholder="Course closed for weather on the day — refunding the round in full." className={iCls + ' resize-none mb-3'} /></label>
            {refundError && <p className="text-xs text-bad mb-3">{refundError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setRefundTarget(null)} disabled={refundBusy}
                className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={submitRefund} disabled={refundBusy}
                className="flex-1 bg-bad hover:bg-bad/90 text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors">
                {refundBusy ? 'Refunding…' : refundAmount.trim() ? `Refund $${Number(refundAmount || 0).toFixed(2)}` : `Refund ${fmtMoney(refundTarget.amount)}`}
              </button>
            </div>
        </Modal>
      )}

      {/* Send Preview confirm — lists both things being sent + recipient (RUN_QUEUE "Send Preview = one combined send") */}
      {showPreviewConfirm && detail?.course.operator && (
        <Modal size="sm" pad="p-6" title="Send preview + dashboard access?" onClose={() => setShowPreviewConfirm(false)}
          titleNode={<h3 className="font-serif font-medium text-ink mb-2">Send preview + dashboard access?</h3>}>
            <p className="text-sm text-ink-soft mb-2">
              Sends ONE email to <strong>{detail.course.operator.name}</strong> at <strong>{detail.course.operator.email}</strong> containing:
            </p>
            <ul className="text-sm text-ink-soft list-disc pl-5 mb-4 space-y-1">
              <li>A link to preview their built course page</li>
              <li>Dashboard login access (a fresh temporary password)</li>
            </ul>
            <div className="flex gap-3">
              <button onClick={() => setShowPreviewConfirm(false)} className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors">Cancel</button>
              <button
                onClick={() => { setShowPreviewConfirm(false); sendCoursePreview(); }}
                disabled={sendingPreview}
                className="flex-1 bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors"
              >
                {sendingPreview ? 'Sending…' : 'Send Preview'}
              </button>
            </div>
        </Modal>
      )}

      {/* Manual booking modal */}
      {manualSlot && (
        <Modal size="sm" pad="p-6" title="Add Manual Booking" onClose={() => setManualSlot(null)}
          titleNode={<div className="flex items-center justify-between mb-5">
              <h3 className="font-serif font-medium text-ink">Add Manual Booking</h3>
              <button
                onClick={() => setManualSlot(null)}
                className="text-ink-muted hover:text-ink w-8 h-8 flex items-center justify-center rounded-md hover:bg-paper transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>}>
            <div className="space-y-3">
              {([['Golfer Name *', 'name', 'text'], ['Email *', 'email', 'email'], ['Phone', 'phone', 'tel']] as [string, string, string][]).map(([label, field, type]) => (
                <div key={field}>
                  <label className="block"><Eyebrow as="span" className="block mb-1.5">{label}</Eyebrow>
                  <input
                    type={type}
                    value={(manualForm as Record<string, unknown>)[field] as string}
                    onChange={e => setManualForm(f => ({ ...f, [field]: e.target.value }))}
                    className={iCls}
                  /></label>
                </div>
              ))}
              <div>
                <label className="block"><Eyebrow as="span" className="block mb-1.5">Players *</Eyebrow>
                <select value={manualForm.players} onChange={e => setManualForm(f => ({ ...f, players: Number(e.target.value) }))} className={iCls}>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </select></label>
              </div>
            </div>
            {manualError && <p className="text-xs text-bad mt-3">{manualError}</p>}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setManualSlot(null)}
                className="flex-1 px-4 py-2.5 border border-line rounded-md text-[12.5px] font-medium text-ink-muted hover:text-ink hover:border-line-strong transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addManualBooking}
                disabled={manualSaving}
                className="flex-1 px-4 py-2.5 bg-pine hover:bg-pine-hover disabled:opacity-50 text-white rounded-md text-[12.5px] font-medium transition-colors"
              >
                {manualSaving ? 'Adding…' : 'Add Booking'}
              </button>
            </div>
        </Modal>
      )}
    </>
  );
}
