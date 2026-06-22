'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, XCircle, RefreshCw, Undo2 } from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { getBookingStatus, statusBadgeClass } from '@/lib/booking-status';

type Booking = {
  id: string; golferName: string; golferEmail: string; players: number;
  totalAmount: number; greenFeeTotal: number; cartFeeTotal: number;
  paymentStatus: string; status: string; createdAt: string;
  teeTime: { date: string; time: string; holes: number };
};

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function CancellationsPage() {
  const router = useRouter();
  const [courseName, setCourseName] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/operator/bookings');
    if (res.status === 401) { router.push('/dashboard/login'); return; }
    const data = await res.json();
    setBookings(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetch('/api/operator/courses').then(r => r.json()).then(c => { if (c?.name) setCourseName(c.name); });
    load();
  }, [load]);

  async function cancelBooking(id: string, name: string) {
    if (!confirm(`Cancel ${name}'s booking? Their card was never charged, so there's nothing to refund — unless the late-cancellation fee already went through, in which case it's non-refundable.`)) return;
    setCancelingId(id);
    const res = await fetch('/api/operator/bookings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'cancel' }),
    });
    const data = await res.json();
    setCancelingId(null);
    if (!res.ok) { alert(data.error || 'Cancel failed'); return; }
    alert(data.feeCharged ? 'Cancelled — the late-cancellation fee already charged to this golfer is non-refundable.' : 'Cancelled — no charge was made, nothing to refund.');
    load();
  }

  const today = new Date().toISOString().split('T')[0];
  const upcoming = bookings.filter(b => b.status === 'confirmed' && b.teeTime.date >= today)
    .sort((a, b) => (a.teeTime.date + a.teeTime.time).localeCompare(b.teeTime.date + b.teeTime.time));
  const cancelled = bookings.filter(b => b.status === 'cancelled')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <OperatorSidebar active="cancellations" courseName={courseName} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-black text-gray-900">Cancellations</h1>
              <p className="text-xs text-gray-400">Cancel a booking on a golfer's behalf, or review cancellation history.</p>
            </div>
            <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300">
              <RefreshCw className="w-3.5 h-3.5" />Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" />Loading...</div>
          ) : (
            <div className="space-y-8">
              <div>
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Upcoming Bookings ({upcoming.length})</h2>
                {upcoming.length === 0 ? (
                  <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300 text-gray-400 text-sm">No upcoming confirmed bookings.</div>
                ) : (
                  <div className="space-y-2">
                    {upcoming.map(b => (
                      <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-gray-900 text-sm">{b.golferName} <span className="text-gray-400 font-normal">· {b.players} player{b.players !== 1 ? 's' : ''}</span></div>
                          <div className="text-xs text-gray-400">{fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)} · {b.golferEmail}</div>
                        </div>
                        <button onClick={() => cancelBooking(b.id, b.golferName)} disabled={cancelingId === b.id}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                          <XCircle className="w-3.5 h-3.5" />{cancelingId === b.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Cancellation History ({cancelled.length})</h2>
                {cancelled.length === 0 ? (
                  <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300 text-gray-400 text-sm">No cancellations yet.</div>
                ) : (
                  <div className="space-y-2">
                    {cancelled.map(b => (
                      <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between opacity-75">
                        <div>
                          <div className="font-semibold text-gray-700 text-sm flex items-center gap-1.5"><Undo2 className="w-3.5 h-3.5 text-gray-400" />{b.golferName} <span className="text-gray-400 font-normal">· {b.players} player{b.players !== 1 ? 's' : ''}</span></div>
                          <div className="text-xs text-gray-400">{fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)}</div>
                        </div>
                        {(() => { const s = getBookingStatus(b.status, b.paymentStatus); return (
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusBadgeClass(s.tone)}`}>{s.label}</span>
                        ); })()}
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
