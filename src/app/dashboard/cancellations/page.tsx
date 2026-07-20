'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, XCircle, RefreshCw, Undo2 } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { TabIntroButton, TabIntroCard } from '@/components/dashboard/TabIntro';
import { useTabIntro } from '@/lib/use-tab-intro';

type Booking = {
  id: string; golferName: string; golferEmail: string; players: number;
  totalAmount: number; greenFeeTotal: number; cartFeeTotal: number;
  cancellationFeeTotal: number; cancelledAt?: string | null; cancellationFeeChargedAt?: string | null;
  paymentStatus: string; status: string; createdAt: string;
  teeTime: { date: string; time: string; holes: number };
};

const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function fmtStamp(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtTime(t: string) { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; }
function fmtDate(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }

export default function CancellationsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [policy, setPolicy] = useState({ cancellationHours: 24, lateCancellationFee: 10 });
  const [policySaving, setPolicySaving] = useState(false);
  const [policySaved, setPolicySaved] = useState(false);
  const intro = useTabIntro('cancellations');

  async function savePolicy() {
    setPolicySaving(true);
    await fetch('/api/operator/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cancellationHours: Number(policy.cancellationHours), lateCancellationFee: Number(policy.lateCancellationFee) }) });
    setPolicySaving(false); setPolicySaved(true); setTimeout(() => setPolicySaved(false), 2000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/operator/bookings');
    if (res.status === 401) { router.push('/dashboard/login'); return; }
    const data = await res.json();
    setBookings(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetch('/api/operator/courses').then(r => r.json()).then(c => {
      if (c) setPolicy({ cancellationHours: c.cancellationHours ?? 24, lateCancellationFee: c.lateCancellationFee ?? 10 });
    });
    load();
  }, [load]);

  async function cancelBooking(b: Booking) {
    const feeCharged = b.paymentStatus === 'cancellation_fee_charged';
    const msg = feeCharged
      ? `Cancel ${b.golferName}'s booking?\n\nTheir $${(b.cancellationFeeTotal / 100).toFixed(2)} late-cancellation fee was already charged and will NOT be refunded.`
      : `Cancel ${b.golferName}'s booking?\n\nNo money has been charged — their card will simply never be billed.`;
    if (!confirm(msg)) return;
    setCancelingId(b.id);
    const res = await fetch('/api/operator/bookings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id, action: 'cancel' }) });
    const data = await res.json();
    setCancelingId(null);
    if (!res.ok) { alert(data.error || 'Cancel failed'); return; }
    alert(data.feeCharged ? 'Cancelled — the late-cancellation fee already charged is non-refundable.' : 'Cancelled — no charge was made, nothing to refund.');
    load();
  }

  const today = new Date().toISOString().split('T')[0];
  const upcoming = bookings.filter(b => b.status === 'confirmed' && b.teeTime.date >= today)
    .sort((a, b) => (a.teeTime.date + a.teeTime.time).localeCompare(b.teeTime.date + b.teeTime.time));
  const cancelled = bookings.filter(b => b.status === 'cancelled')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active="cancellations"/>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div>
                <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Cancellations</h1>
                <p className="text-xs text-ink-muted mt-0.5">Cancel a booking on a golfer&apos;s behalf, or review cancellation history.</p>
              </div>
              <TabIntroButton onClick={intro.show}/>
            </div>
            <button onClick={load} className="flex items-center gap-1.5 text-xs text-ink-soft px-3 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">
              <RefreshCw className="w-3.5 h-3.5"/>Refresh
            </button>
          </div>

          <TabIntroCard
            open={intro.open}
            onDismiss={intro.dismiss}
            title="This is your Cancellations."
            bullets={[
              'See who cancelled, when, and whether a late fee applied.',
              'No-shows are charged automatically per your cancellation policy.',
              'If the golfer still shows up and checks in, any fee already charged is refunded automatically.',
            ]}
          />

          {loading ? (
            <div className="flex items-center justify-center py-16 text-ink-muted gap-2"><Loader2 className="w-5 h-5 animate-spin"/>Loading...</div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white border border-line rounded-lg p-5">
                <h2 className="text-sm font-medium text-ink mb-1">Cancellation Policy</h2>
                <p className="text-xs text-ink-muted mb-4">Golfers can cancel free until this many hours before their tee time. After that, the fee below is automatically charged — and refunded if they still show up and check in.</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Free Cancel Window (hours)</label>
                    <input type="number" min={0} value={policy.cancellationHours}
                      onChange={e => setPolicy(pol => ({ ...pol, cancellationHours: Number(e.target.value) }))}
                      className={iCls + ' w-32'}/>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Late-Cancel Fee ($)</label>
                    <input type="number" min={0} step="0.01" value={policy.lateCancellationFee}
                      onChange={e => setPolicy(pol => ({ ...pol, lateCancellationFee: Number(e.target.value) }))}
                      className={iCls + ' w-32'}/>
                  </div>
                  <button onClick={savePolicy} disabled={policySaving}
                    className="bg-pine hover:bg-pine-hover text-white text-[12.5px] font-medium px-4 py-2 rounded-md disabled:opacity-50 transition-colors">
                    {policySaved ? 'Saved' : policySaving ? 'Saving...' : 'Save Policy'}
                  </button>
                  <span className="text-xs text-ink-muted pb-0.5">Set fee to $0 to skip card collection at booking.</span>
                </div>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Upcoming Bookings ({upcoming.length})</div>
                {upcoming.length === 0 ? (
                  <div className="text-center py-10 bg-white rounded-lg border border-dashed border-line text-ink-muted text-sm">No upcoming confirmed bookings.</div>
                ) : (
                  <div className="space-y-2">
                    {upcoming.map(b => (
                      <div key={b.id} className="bg-white rounded-lg border border-line p-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium text-ink text-sm">{b.golferName} <span className="text-ink-muted font-normal">· {b.players} player{b.players !== 1 ? 's' : ''}</span></div>
                          <div className="text-xs text-ink-soft mt-0.5">{fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)} · {b.golferEmail}</div>
                        </div>
                        <button onClick={() => cancelBooking(b)} disabled={cancelingId === b.id}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-bad/30 text-bad hover:bg-bad/5 disabled:opacity-50 transition-colors">
                          <XCircle className="w-3.5 h-3.5"/>{cancelingId === b.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Cancellation History ({cancelled.length})</div>
                {cancelled.length === 0 ? (
                  <div className="text-center py-10 bg-white rounded-lg border border-dashed border-line text-ink-muted text-sm">No cancellations yet.</div>
                ) : (
                  <div className="space-y-2">
                    {cancelled.map(b => (
                      <div key={b.id} className="bg-white rounded-lg border border-line p-3 flex items-center justify-between opacity-70">
                        <div>
                          <div className="font-medium text-ink text-sm flex items-center gap-1.5"><Undo2 className="w-3.5 h-3.5 text-ink-muted"/>{b.golferName} <span className="text-ink-muted font-normal">· {b.players} player{b.players !== 1 ? 's' : ''}</span></div>
                          <div className="text-xs text-ink-soft mt-0.5">Tee time: {fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)}</div>
                          <div className="text-xs mt-0.5">
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
          )}
        </div>
      </main>
    </div>
  );
}
