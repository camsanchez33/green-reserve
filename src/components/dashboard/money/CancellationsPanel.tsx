'use client';
// SD-8 — the Cancellations half of the Money page. Behaviour is the old
// /dashboard/cancellations page unchanged: the policy form still refuses to
// save until the real policy has loaded (SD-10), cancelling still says
// whether a fee was kept, and the history still carries the amber left edge.
import { useEffect, useState } from 'react';
import { XCircle, Undo2 } from 'lucide-react';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import type { MoneyBooking, MoneyCourse } from './types';

const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function fmtStamp(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtTime(t: string) { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; }
function fmtDate(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }

export function CancellationsPanel({ bookings, course, courseLoaded, isStaff, onChanged }: {
  bookings: MoneyBooking[];
  course: MoneyCourse;
  /** False until the real policy has loaded — Save stays disabled (SD-10). */
  courseLoaded: boolean;
  /** Staff cancel bookings (that is the job); only the policy is the owner's. */
  isStaff: boolean;
  onChanged: () => void;
}) {
  const [policy, setPolicy] = useState({ cancellationHours: course.cancellationHours, lateCancellationFee: course.lateCancellationFee });
  const [policyTouched, setPolicyTouched] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policySaved, setPolicySaved] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // Adopt the policy the page loaded — and any later refresh of it — but never
  // over the top of an edit in progress (the SD-8 dirty rule, same as Settings).
  useEffect(() => {
    if (!policyTouched) setPolicy({ cancellationHours: course.cancellationHours, lateCancellationFee: course.lateCancellationFee });
  }, [course.cancellationHours, course.lateCancellationFee, policyTouched]);

  const setField = (k: 'cancellationHours' | 'lateCancellationFee', v: number) => {
    setPolicyTouched(true);
    setPolicy(p => ({ ...p, [k]: v }));
  };

  async function savePolicy() {
    setPolicySaving(true);
    // SD-10: "Saved" used to show on a 403 (staff) and a 400 alike.
    const r = await dfetch('/api/operator/settings', { method: 'PATCH', body: JSON.stringify({ cancellationHours: Number(policy.cancellationHours), lateCancellationFee: Number(policy.lateCancellationFee) }) });
    setPolicySaving(false);
    if (!r.ok) { toast(r.error); return; }
    setPolicySaved(true); setPolicyTouched(false); setTimeout(() => setPolicySaved(false), 2000);
    onChanged();
  }

  async function cancelBooking(b: MoneyBooking) {
    const feeCharged = b.paymentStatus === 'cancellation_fee_charged';
    const msg = feeCharged
      ? `Cancel ${b.golferName}'s booking?\n\nTheir $${(b.cancellationFeeTotal / 100).toFixed(2)} late-cancellation fee was already charged and will NOT be refunded.`
      : `Cancel ${b.golferName}'s booking?\n\nNo money has been charged — their card will simply never be billed.`;
    if (!confirm(msg)) return;
    setCancelingId(b.id);
    const r = await dfetch<{ feeCharged?: boolean }>('/api/operator/bookings', { method: 'PATCH', body: JSON.stringify({ id: b.id, action: 'cancel' }) });
    setCancelingId(null);
    if (!r.ok) { toast(r.error); return; }
    const data = r.data ?? {};
    toast(data.feeCharged ? 'Cancelled — the late-cancellation fee already charged is non-refundable.' : 'Cancelled — no charge was made, nothing to refund.', 'ok');
    onChanged();
  }

  const today = new Date().toISOString().split('T')[0];
  const upcoming = bookings.filter(b => b.status === 'confirmed' && b.teeTime.date >= today)
    .sort((a, b) => (a.teeTime.date + a.teeTime.time).localeCompare(b.teeTime.date + b.teeTime.time));
  const cancelled = bookings.filter(b => b.status === 'cancelled')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <div className="bg-white border border-line rounded-lg p-5">
        <h2 className="text-[15px] font-medium text-ink mb-1">Cancellation Policy</h2>
        <p className="text-[13.5px] text-ink-soft mb-4">Golfers can cancel free until this many hours before their tee time. After that, the fee below is automatically charged — and refunded if they still show up and check in.</p>
        {/* §1b: attention = a 3px left border in the semantic colour on a white card. */}
        {policy.lateCancellationFee > 0 && !course.stripeAccountActive && (
          <div className="flex items-start gap-2 bg-white border border-line border-l-[3px] border-l-warn rounded-md px-3 py-2.5 mb-4 text-[12.5px] text-warn">
            <span className="font-medium shrink-0">Paused —</span>
            <span>your ${policy.lateCancellationFee.toFixed(2)} late-cancel fee can&apos;t be charged until you connect Stripe. Golfers can still book and cancel; no fee is being collected in the meantime.</span>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-1.5">Free Cancel Window (hours)</label>
            <input type="number" min={0} value={policy.cancellationHours} disabled={isStaff}
              onChange={e => setField('cancellationHours', Number(e.target.value))}
              className={iCls + ' w-32 disabled:opacity-60'}/>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-1.5">Late-Cancel Fee ($)</label>
            <input type="number" min={0} step="0.01" value={policy.lateCancellationFee} disabled={isStaff}
              onChange={e => setField('lateCancellationFee', Number(e.target.value))}
              className={iCls + ' w-32 disabled:opacity-60'}/>
          </div>
          <button onClick={savePolicy} disabled={policySaving || !courseLoaded || isStaff}
            className="bg-pine hover:bg-pine-hover text-white text-[12.5px] font-medium px-4 py-2 rounded-md disabled:opacity-50 transition-colors">
            {policySaved ? 'Saved' : policySaving ? 'Saving...' : 'Save Policy'}
          </button>
          <span className="text-xs text-ink-muted pb-0.5">
            {isStaff
              ? 'Changing the policy needs the course operator’s login — you can still cancel bookings below.'
              : 'Set fee to $0 to skip card collection at booking.'}
          </span>
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-3">Upcoming Bookings ({upcoming.length})</div>
        {upcoming.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-lg border border-dashed border-line text-ink-muted text-sm">No upcoming confirmed bookings.</div>
        ) : (
          <div className="space-y-2">
            {upcoming.map(b => (
              <div key={b.id} className="bg-white rounded-lg border border-line p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-ink text-[13.5px]">{b.golferName} <span className="text-ink-muted font-normal">· {b.players} player{b.players !== 1 ? 's' : ''}</span></div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5">{fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)} · {b.golferEmail}</div>
                </div>
                <button onClick={() => cancelBooking(b)} disabled={cancelingId === b.id}
                  className="shrink-0 flex items-center gap-1.5 text-[12.5px] px-3 py-1.5 rounded-md border border-bad/30 text-bad hover:bg-bad/5 disabled:opacity-50 transition-colors">
                  <XCircle className="w-3.5 h-3.5"/>{cancelingId === b.id ? 'Cancelling...' : 'Cancel'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-ink-muted mb-3">Cancellation History ({cancelled.length})</div>
        {cancelled.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-lg border border-dashed border-line text-ink-muted text-sm">No cancellations yet.</div>
        ) : (
          <div className="space-y-2">
            {/* U-O: history fades back; a row that carried a late fee keeps
                an amber left edge so the money is findable at a glance. */}
            {cancelled.map(b => (
              <div key={b.id} className={'bg-white rounded-lg border border-line p-3 flex items-center justify-between ' + (b.paymentStatus === 'cancellation_fee_charged' ? 'border-l-[3px] border-l-warn' : 'opacity-70')}>
                <div>
                  <div className="font-medium text-ink text-[13.5px] flex items-center gap-1.5"><Undo2 className="w-3.5 h-3.5 text-ink-muted"/>{b.golferName} <span className="text-ink-muted font-normal">· {b.players} player{b.players !== 1 ? 's' : ''}</span></div>
                  <div className="text-[12.5px] text-ink-soft mt-0.5">Tee time: {fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)}</div>
                  <div className="text-[12.5px] mt-0.5">
                    <span className="text-ink-muted">{b.cancelledAt ? `Cancelled ${fmtStamp(b.cancelledAt)}` : 'Cancelled'}</span>
                    {b.paymentStatus === 'cancellation_fee_charged'
                      ? <span className="text-warn font-medium"> · ${(b.cancellationFeeTotal / 100).toFixed(2)} fee charged{b.cancellationFeeChargedAt ? ` on ${fmtStamp(b.cancellationFeeChargedAt)}` : ''}</span>
                      : <span className="text-ok"> · no fee — cancelled in time</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
