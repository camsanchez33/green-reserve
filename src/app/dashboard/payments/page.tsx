'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, RefreshCw, DollarSign, CreditCard, Clock3, X } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';

type Booking = {
  id: string; golferName: string; golferEmail: string; players: number;
  greenFeeTotal: number; cartFeeTotal: number; accessFeeTotal: number; totalAmount: number;
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
function statusBadge(status: string) {
  const map: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700',
    pending: 'bg-yellow-50 text-yellow-700',
    refunded: 'bg-gray-100 text-gray-500',
  };
  return map[status] || 'bg-gray-100 text-gray-500';
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

  const paid = bookings.filter(b => b.status !== 'cancelled');
  const totalRevenue = paid.reduce((s, b) => s + b.greenFeeTotal + b.cartFeeTotal, 0);
  const pendingCount = paid.filter(b => b.paymentStatus === 'pending').length;
  const totalAccessFees = paid.reduce((s, b) => s + b.accessFeeTotal, 0);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <OperatorSidebar active="payments" courseName={courseName} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-black text-gray-900">Payments</h1>
              <p className="text-xs text-gray-400">Every transaction processed through GreenReserve for your course.</p>
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

          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-medium mb-1 text-emerald-600"><DollarSign className="w-4 h-4" />Your Revenue</div>
              <div className="text-xl font-black text-gray-900">${(totalRevenue / 100).toFixed(2)}</div>
              <div className="text-xs text-gray-400">green + cart fees, paid directly to you</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-medium mb-1 text-blue-600"><CreditCard className="w-4 h-4" />Transactions</div>
              <div className="text-xl font-black text-gray-900">{paid.length}</div>
              <div className="text-xs text-gray-400">${(totalAccessFees / 100).toFixed(2)} in GreenReserve fees (not yours)</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-medium mb-1 text-yellow-600"><Clock3 className="w-4 h-4" />Pending</div>
              <div className="text-xl font-black text-gray-900">{pendingCount}</div>
              <div className="text-xs text-gray-400">not yet charged (no card on file)</div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" />Loading...</div>
          ) : paid.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300 text-gray-400 text-sm">{dateFilter ? `No transactions for ${fmtDate(dateFilter)}.` : 'No transactions yet.'}</div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="px-4 py-3 font-semibold">Golfer</th>
                    <th className="px-4 py-3 font-semibold">Tee Time</th>
                    <th className="px-4 py-3 font-semibold">Rate</th>
                    <th className="px-4 py-3 font-semibold text-right">Green+Cart</th>
                    <th className="px-4 py-3 font-semibold text-right">Total Charged</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paid.map(b => (
                    <tr key={b.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{b.golferName}</div>
                        <div className="text-xs text-gray-400">{b.golferEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{fmtDate(b.teeTime.date)}, {fmtTime(b.teeTime.time)}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{b.appliedRate}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">${((b.greenFeeTotal + b.cartFeeTotal) / 100).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">${(b.totalAmount / 100).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusBadge(b.paymentStatus)}`}>{b.paymentStatus}</span>
                      </td>
                    </tr>
                  ))}
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
