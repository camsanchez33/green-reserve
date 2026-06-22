'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, RefreshCw, DollarSign, CreditCard, Clock3, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { getBookingStatus, statusBadgeClass } from '@/lib/booking-status';

type Booking = {
  id: string; golferName: string; golferEmail: string; players: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number;
  cancellationFeeTotal: number;
  paymentStatus: string; status: string; appliedRate: string; createdAt: string;
  teeTime: { date: string; time: string; holes: number };
};

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatCard({ icon, label, value, sub, tone = 'gray' }: {
  icon: React.ReactNode; label: string; value: string | number; sub: string;
  tone?: 'emerald' | 'blue' | 'amber' | 'red' | 'gray';
}) {
  const colors = { emerald:'text-emerald-600', blue:'text-blue-600', amber:'text-amber-600', red:'text-red-500', gray:'text-gray-500' };
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
      <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${colors[tone]}`}>{icon}{label}</div>
      <div className="text-xl font-black text-gray-900">{value}</div>
      <div className="text-xs text-gray-400 leading-relaxed">{sub}</div>
    </div>
  );
}

function PaymentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateFilter = searchParams.get('date') || '';
  const [courseName, setCourseName] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const url = dateFilter ? `/api/operator/bookings?date=${dateFilter}` : '/api/operator/bookings';
    const res = await fetch(url);
    if (res.status === 401) { router.push('/dashboard/login'); return; }
    const data = await res.json();
    setBookings(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [router, dateFilter]);

  useEffect(() => {
    fetch('/api/operator/courses').then(r => r.json()).then(c => { if (c?.name) setCourseName(c.name); });
    load();
  }, [load]);

  const nonCancelled = bookings.filter(b => b.status !== 'cancelled');

  // Money actually collected — only completed/paid rounds
  const collected = nonCancelled.filter(b => b.paymentStatus === 'paid');
  const collectedRevenue = collected.reduce((s, b) => s + b.greenFeeTotal + b.cartFeeTotal, 0);
  const collectedAccessFees = collected.reduce((s, b) => s + b.accessFeeTotal, 0);

  // Card on file OR no-card-required (no-fee-policy courses) — all open bookings not yet paid
  const cardOnFile = nonCancelled.filter(b => b.paymentStatus === 'card_on_file' || b.paymentStatus === 'no_payment_method');
  const expectedCardOnFile = cardOnFile.reduce((s, b) => s + b.greenFeeTotal + b.cartFeeTotal, 0);
  const noCardCount = cardOnFile.filter(b => b.paymentStatus === 'no_payment_method').length;

  // Cutoff passed, no fee policy — awaiting check-in, nothing charged
  const awaitingNoFee = nonCancelled.filter(b => b.paymentStatus === 'awaiting_checkin');
  const expectedAwaitingNoFee = awaitingNoFee.reduce((s, b) => s + b.greenFeeTotal + b.cartFeeTotal, 0);

  // Cutoff passed, late-cancel fee charged — still awaiting check-in (fee refundable if they show)
  const feesHeld = nonCancelled.filter(b => b.paymentStatus === 'cancellation_fee_charged');
  const feesHeldAmount = feesHeld.reduce((s, b) => s + b.cancellationFeeTotal, 0);
  const feesHeldExpectedRevenue = feesHeld.reduce((s, b) => s + b.greenFeeTotal + b.cartFeeTotal, 0);

  // Late fees that will NOT be refunded — golfer cancelled after the window or no-showed
  const cancelledWithFee = bookings.filter(b => b.status === 'cancelled' && b.paymentStatus === 'cancellation_fee_charged');
  const lateFeesKept = cancelledWithFee.reduce((s, b) => s + b.cancellationFeeTotal, 0);

  const allRows = bookings; // show ALL bookings including cancelled in the table

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <OperatorSidebar active="payments" courseName={courseName} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-black text-gray-900">Payments</h1>
              <p className="text-xs text-gray-400">Full booking ledger — actual charges, pending amounts, and held fees.</p>
            </div>
            <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300">
              <RefreshCw className="w-3.5 h-3.5" />Refresh
            </button>
          </div>

          {dateFilter && (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 mb-4 text-sm">
              <span className="text-green-800 font-medium">Showing bookings for {fmtDate(dateFilter)}</span>
              <button onClick={() => router.push('/dashboard/payments')} className="flex items-center gap-1 text-green-700 hover:underline text-xs font-semibold">
                <X className="w-3.5 h-3.5" />Clear filter
              </button>
            </div>
          )}

          {/* ── Collected (real money) ── */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Collected</p>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatCard tone="emerald" icon={<DollarSign className="w-4 h-4"/>} label="Revenue Collected"
              value={`$${(collectedRevenue / 100).toFixed(2)}`}
              sub={`${collected.length} round${collected.length!==1?'s':''} checked in & paid`} />
            <StatCard tone="gray" icon={<CreditCard className="w-4 h-4"/>} label="GreenReserve Fees"
              value={`$${(collectedAccessFees / 100).toFixed(2)}`}
              sub="Charged to golfers on top — not deducted from you" />
            <StatCard tone="red" icon={<CheckCircle2 className="w-4 h-4"/>} label="Late Fees Kept"
              value={`$${(lateFeesKept / 100).toFixed(2)}`}
              sub={`${cancelledWithFee.length} late cancel${cancelledWithFee.length!==1?'s':''} — non-refundable`} />
          </div>

          {/* ── Pending / expected ── */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Pending</p>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <StatCard tone="blue" icon={<Clock3 className="w-4 h-4"/>} label="Card on File"
              value={`${cardOnFile.length} booking${cardOnFile.length!==1?'s':''}`}
              sub={`~$${(expectedCardOnFile / 100).toFixed(2)} expected${noCardCount > 0 ? ` · ${noCardCount} no card required` : ' · free cancel window still open'}`} />
            <StatCard tone="amber" icon={<Clock3 className="w-4 h-4"/>} label="Awaiting Check-In"
              value={`${awaitingNoFee.length + feesHeld.length} booking${awaitingNoFee.length + feesHeld.length!==1?'s':''}`}
              sub={`~$${((expectedAwaitingNoFee + feesHeldExpectedRevenue) / 100).toFixed(2)} expected · cancel window closed`} />
            <StatCard tone="amber" icon={<AlertCircle className="w-4 h-4"/>} label="Cancellation Fees Held"
              value={`$${(feesHeldAmount / 100).toFixed(2)}`}
              sub={`${feesHeld.length} booking${feesHeld.length!==1?'s':''} — charged but refundable if they check in`} />
          </div>

          {/* ── Table ── */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" />Loading...</div>
          ) : allRows.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300 text-gray-400 text-sm">{dateFilter ? `No bookings for ${fmtDate(dateFilter)}.` : 'No bookings yet.'}</div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="px-4 py-3 font-semibold">Golfer</th>
                    <th className="px-4 py-3 font-semibold">Tee Time</th>
                    <th className="px-4 py-3 font-semibold text-right">Green + Cart</th>
                    <th className="px-4 py-3 font-semibold text-right">Fee Held</th>
                    <th className="px-4 py-3 font-semibold text-right">Total</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map(b => {
                    const bStatus = getBookingStatus(b.status, b.paymentStatus);
                    return (
                      <tr key={b.id} className={`border-b border-gray-50 last:border-0 ${b.status==='cancelled'?'opacity-50':''}`}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{b.golferName}</div>
                          <div className="text-xs text-gray-400">{b.golferEmail} · {b.players} player{b.players!==1?'s':''}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          <div>{fmtDate(b.teeTime.date)}</div>
                          <div>{fmtTime(b.teeTime.time)}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          ${((b.greenFeeTotal + b.cartFeeTotal) / 100).toFixed(2)}
                          {b.paymentStatus !== 'paid' && b.status !== 'cancelled' && <span className="text-gray-300 text-xs"> est.</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          {b.cancellationFeeTotal > 0 ? (
                            <span className={`font-semibold ${b.paymentStatus === 'cancellation_fee_charged' ? 'text-amber-600' : 'text-gray-400'}`}>
                              ${(b.cancellationFeeTotal / 100).toFixed(2)}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          ${(b.totalAmount / 100).toFixed(2)}
                          {b.paymentStatus !== 'paid' && b.status !== 'cancelled' && <span className="text-gray-300 text-xs"> est.</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusBadgeClass(bStatus.tone)}`}>{bStatus.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100" />}>
      <PaymentsPageInner />
    </Suspense>
  );
}
