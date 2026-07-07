'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, RefreshCw, DollarSign, CreditCard, Clock3, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { getBookingStatus } from '@/lib/booking-status';

type Booking = {
  id: string; golferName: string; golferEmail: string; players: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number; totalAmount: number;
  cancellationFeeTotal: number; paymentStatus: string; status: string; appliedRate: string; createdAt: string;
  teeTime: { date: string; time: string; holes: number };
};

const STATUS_TONE: Record<string, string> = {
  ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', neutral: 'text-ink-muted',
};
function toneClass(tone: string) {
  if (tone === 'emerald') return STATUS_TONE.ok;
  if (tone === 'amber') return STATUS_TONE.warn;
  if (tone === 'red') return STATUS_TONE.bad;
  return STATUS_TONE.neutral;
}

function fmtTime(t: string) { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; }
function fmtDate(d: string) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

function StatCard({ icon, label, value, sub, accent = false }: {
  icon: React.ReactNode; label: string; value: string | number; sub: string; accent?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-line p-4">
      <div className={'flex items-center gap-1.5 text-xs font-medium mb-1 ' + (accent ? 'text-ok' : 'text-ink-muted')}>{icon}{label}</div>
      <div className="text-xl font-serif font-medium text-ink">{value}</div>
      <div className="text-xs text-ink-muted leading-relaxed mt-0.5">{sub}</div>
    </div>
  );
}

function PaymentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateFilter = searchParams.get('date') || '';
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const url = dateFilter ? `/api/operator/bookings?date=${dateFilter}` : '/api/operator/bookings';
    const res = await fetch(url);
    if (res.status === 401) { router.push('/dashboard/login'); return; }
    const data = await res.json();
    setBookings(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [router, dateFilter]);

  useEffect(() => { load(); }, [load]);

  const nonCancelled = bookings.filter(b => b.status !== 'cancelled');
  const collected = nonCancelled.filter(b => b.paymentStatus === 'paid');
  const collectedRevenue = collected.reduce((s, b) => s + b.greenFeeTotal + b.cartFeeTotal, 0);
  const collectedAccessFees = collected.reduce((s, b) => s + b.accessFeeTotal, 0);
  const cardOnFile = nonCancelled.filter(b => b.paymentStatus === 'card_on_file' || b.paymentStatus === 'no_payment_method');
  const expectedCardOnFile = cardOnFile.reduce((s, b) => s + b.greenFeeTotal + b.cartFeeTotal, 0);
  const noCardCount = cardOnFile.filter(b => b.paymentStatus === 'no_payment_method').length;
  const awaitingNoFee = nonCancelled.filter(b => b.paymentStatus === 'awaiting_checkin');
  const expectedAwaitingNoFee = awaitingNoFee.reduce((s, b) => s + b.greenFeeTotal + b.cartFeeTotal, 0);
  const feesHeld = nonCancelled.filter(b => b.paymentStatus === 'cancellation_fee_charged');
  const feesHeldAmount = feesHeld.reduce((s, b) => s + b.cancellationFeeTotal, 0);
  const feesHeldExpectedRevenue = feesHeld.reduce((s, b) => s + b.greenFeeTotal + b.cartFeeTotal, 0);
  const cancelledWithFee = bookings.filter(b => b.status === 'cancelled' && b.paymentStatus === 'cancellation_fee_charged');
  const lateFeesKept = cancelledWithFee.reduce((s, b) => s + b.cancellationFeeTotal, 0);

  const q = search.trim().toLowerCase();
  const allRows = bookings.filter(b => {
    if (q && !b.golferName.toLowerCase().includes(q) && !b.golferEmail.toLowerCase().includes(q)) return false;
    if (statusFilter === 'paid')      return b.paymentStatus === 'paid' && b.status !== 'cancelled';
    if (statusFilter === 'upcoming')  return b.status === 'confirmed';
    if (statusFilter === 'fee')       return b.paymentStatus === 'cancellation_fee_charged';
    if (statusFilter === 'cancelled') return b.status === 'cancelled';
    return true;
  });

  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      <OperatorSidebar active="payments"/>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Payments</h1>
              <p className="text-xs text-ink-muted mt-0.5">Full booking ledger — actual charges, pending amounts, and held fees.</p>
            </div>
            <button onClick={load} className="flex items-center gap-1.5 text-xs text-ink-soft px-3 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">
              <RefreshCw className="w-3.5 h-3.5"/>Refresh
            </button>
          </div>

          {dateFilter && (
            <div className="flex items-center justify-between bg-pine/5 border border-pine/20 rounded-md px-4 py-2.5 mb-4 text-sm">
              <span className="text-pine font-medium">Showing bookings for {fmtDate(dateFilter)}</span>
              <button onClick={() => router.push('/dashboard/payments')} className="flex items-center gap-1 text-pine hover:underline text-xs font-medium">
                <X className="w-3.5 h-3.5"/>Clear filter
              </button>
            </div>
          )}

          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Collected</div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatCard accent icon={<DollarSign className="w-4 h-4"/>} label="Revenue Collected"
              value={`$${(collectedRevenue / 100).toFixed(2)}`}
              sub={`${collected.length} round${collected.length!==1?'s':''} checked in & paid`}/>
            <StatCard icon={<CreditCard className="w-4 h-4"/>} label="GreenReserve Fees"
              value={`$${(collectedAccessFees / 100).toFixed(2)}`}
              sub="Charged to golfers on top — not deducted from you"/>
            <StatCard icon={<CheckCircle2 className="w-4 h-4"/>} label="Late Fees Kept"
              value={`$${(lateFeesKept / 100).toFixed(2)}`}
              sub={`${cancelledWithFee.length} late cancel${cancelledWithFee.length!==1?'s':''} — non-refundable`}/>
          </div>

          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Pending</div>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <StatCard icon={<Clock3 className="w-4 h-4"/>} label="Card on File"
              value={`${cardOnFile.length} booking${cardOnFile.length!==1?'s':''}`}
              sub={`~$${(expectedCardOnFile / 100).toFixed(2)} expected${noCardCount > 0 ? ` · ${noCardCount} no card required` : ' · free cancel window open'}`}/>
            <StatCard icon={<Clock3 className="w-4 h-4"/>} label="Awaiting Check-In"
              value={`${awaitingNoFee.length + feesHeld.length} booking${awaitingNoFee.length + feesHeld.length!==1?'s':''}`}
              sub={`~$${((expectedAwaitingNoFee + feesHeldExpectedRevenue) / 100).toFixed(2)} expected · cancel window closed`}/>
            <StatCard icon={<AlertCircle className="w-4 h-4"/>} label="Cancellation Fees Held"
              value={`$${(feesHeldAmount / 100).toFixed(2)}`}
              sub={`${feesHeld.length} booking${feesHeld.length!==1?'s':''} — charged but refundable if they check in`}/>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search golfer name or email..."
              className="w-64 bg-white border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint focus:ring-2 focus:ring-pine/10 focus:border-pine/40 outline-none"/>
            <div className="flex gap-1 bg-white rounded-md border border-line p-1">
              {([['all','All'],['paid','Paid'],['upcoming','Upcoming'],['fee','Fee Charged'],['cancelled','Cancelled']] as [string,string][]).map(([key, label]) => (
                <button key={key} onClick={() => setStatusFilter(key)}
                  className={'px-3 py-1.5 rounded text-xs font-medium transition-colors ' + (statusFilter === key ? 'bg-pine text-white' : 'text-ink-soft hover:text-ink')}>
                  {label}
                </button>
              ))}
            </div>
            {(q || statusFilter !== 'all') && <span className="text-xs text-ink-muted">{allRows.length} of {bookings.length} bookings</span>}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-ink-muted gap-2"><Loader2 className="w-5 h-5 animate-spin"/>Loading...</div>
          ) : allRows.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-lg border border-dashed border-line text-ink-muted text-sm">
              {q || statusFilter !== 'all' ? 'No bookings match your search or filter.' : dateFilter ? `No bookings for ${fmtDate(dateFilter)}.` : 'No bookings yet.'}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-line overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-line">
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">Golfer</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">Booked</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">Tee Time</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium text-right">Green + Cart</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium text-right">Fee Held</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium text-right">Total</th>
                    <th className="px-4 py-3 text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map(b => {
                    const bStatus = getBookingStatus(b.status, b.paymentStatus);
                    return (
                      <tr key={b.id} className={'border-b border-line-soft last:border-0 ' + (b.status==='cancelled'?'opacity-50':'')}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">{b.golferName}</div>
                          <div className="text-xs text-ink-muted">{b.golferEmail} · {b.players} player{b.players!==1?'s':''}</div>
                        </td>
                        <td className="px-4 py-3 text-ink-muted text-xs tabular-nums">
                          {new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          <div>{new Date(b.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                        </td>
                        <td className="px-4 py-3 text-ink-soft text-xs tabular-nums">
                          <div>{fmtDate(b.teeTime.date)}</div>
                          <div>{fmtTime(b.teeTime.time)}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-ink tabular-nums">
                          ${((b.greenFeeTotal + b.cartFeeTotal) / 100).toFixed(2)}
                          {b.paymentStatus !== 'paid' && b.status !== 'cancelled' && <span className="text-ink-faint text-xs"> est.</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums">
                          {b.cancellationFeeTotal > 0
                            ? <span className={'font-medium ' + (b.paymentStatus === 'cancellation_fee_charged' ? 'text-warn' : 'text-ink-muted')}>${(b.cancellationFeeTotal / 100).toFixed(2)}</span>
                            : <span className="text-ink-faint">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-ink-soft tabular-nums">
                          ${(b.totalAmount / 100).toFixed(2)}
                          {b.paymentStatus !== 'paid' && b.status !== 'cancelled' && <span className="text-ink-faint text-xs"> est.</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={'text-xs font-medium ' + toneClass(bStatus.tone)}>{bStatus.label}</span>
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
    <Suspense fallback={<div className="min-h-screen bg-paper"/>}>
      <PaymentsPageInner/>
    </Suspense>
  );
}
