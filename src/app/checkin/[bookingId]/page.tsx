'use client';
import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2, AlertCircle, MapPin } from 'lucide-react';

type CheckInInfo = {
  golferName: string; courseName: string; courseAddress: string;
  date: string; time: string; players: number; holes: number; status: string;
  totalAmount: number; greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number; accessFeeTotal: number;
};

function fmtTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function CheckInPageInner() {
  const params = useParams();
  const search = useSearchParams();
  const bookingId = String(params.bookingId || '');
  const token = search.get('token') || '';

  const [info, setInfo] = useState<CheckInInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [result, setResult] = useState<{ totalCharged: number; feeRefunded: boolean; feeRefundAmount: number } | null>(null);

  useEffect(() => {
    if (!bookingId || !token) { setError('This check-in link is missing required details.'); setLoading(false); return; }
    fetch(`/api/checkin/${bookingId}?token=${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setInfo)
      .catch(() => setError('This check-in link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [bookingId, token]);

  async function handleCheckIn() {
    setCheckingIn(true);
    setError('');
    try {
      const res = await fetch(`/api/checkin/${bookingId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Check-in failed.'); setCheckingIn(false); return; }
      setResult(data);
    } catch {
      setError('Something went wrong. Please try again or check in at the pro shop.');
    }
    setCheckingIn(false);
  }

  if (loading) {
    return <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  if (error && !info) {
    return (
      <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <h1 className="font-bold text-gray-900 mb-2">Can&apos;t check in</h1>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!info) return null;

  if (info.status === 'completed' || result) {
    const charged = result?.totalCharged ?? info.totalAmount;
    return (
      <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-3xl border border-gray-100 shadow-sm p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-[#f0fdf4] flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-emerald-500" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">You&apos;re checked in!</h1>
          <p className="text-gray-500 mb-6 text-sm">${(charged / 100).toFixed(2)} was charged to your card. Enjoy your round at {info.courseName}.</p>
          {result?.feeRefunded && (
            <div className="bg-[#f0fdf4] border border-emerald-100 rounded-2xl p-4 mb-6 text-left">
              <p className="text-emerald-700 text-xs">Your earlier ${(result.feeRefundAmount / 100).toFixed(2)} late-cancellation fee has been refunded.</p>
            </div>
          )}
          <p className="text-xs text-gray-400">A receipt has been emailed to you.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center px-4 py-10">
      <div className="max-w-lg w-full bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-16 flex items-center px-8" style={{ background: 'linear-gradient(135deg,#0f2218,#1b4332)' }}>
          <span className="text-white font-bold">{info.courseName}</span>
        </div>
        <div className="p-8">
          <h1 className="text-xl font-black text-gray-900 mb-1">Check in, {info.golferName.split(' ')[0]}?</h1>
          <p className="text-gray-500 text-sm mb-6">Confirm your round and pay now — no need to stop at the pro shop.</p>

          <div className="bg-[#f8faf9] rounded-2xl p-5 mb-6 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Date</span><span className="font-semibold text-gray-900">{fmtDate(info.date)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Tee Time</span><span className="font-semibold text-gray-900">{fmtTime(info.time)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Players</span><span className="font-semibold text-gray-900">{info.players} &middot; {info.holes} holes</span></div>
            <div className="border-t border-gray-200 mt-2 pt-2 space-y-1.5">
              <div className="flex justify-between text-gray-500"><span>Green Fee</span><span>${(info.greenFeeTotal / 100).toFixed(2)}</span></div>
              {info.cartFeeTotal > 0 && <div className="flex justify-between text-gray-500"><span>Cart Fee</span><span>${(info.cartFeeTotal / 100).toFixed(2)}</span></div>}
              {info.rangeBallsTotal > 0 && <div className="flex justify-between text-gray-500"><span>Range Balls</span><span>${(info.rangeBallsTotal / 100).toFixed(2)}</span></div>}
              <div className="flex justify-between text-gray-500"><span>Fees</span><span>${(info.accessFeeTotal / 100).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-100 pt-2">
                <span>Total</span><span>${(info.totalAmount / 100).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-gray-400 mb-6">
            <MapPin size={14} className="shrink-0 mt-0.5" />
            <span>{info.courseAddress}</span>
          </div>

          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          <button
            onClick={handleCheckIn}
            disabled={checkingIn}
            className="w-full py-4 rounded-xl font-bold text-white text-sm transition-all hover:shadow-lg disabled:opacity-70 flex items-center justify-center gap-2"
            style={{ background: '#1b4332' }}
          >
            {checkingIn ? <><Loader2 size={16} className="animate-spin" /> Charging your card…</> : `Check In & Pay $${(info.totalAmount / 100).toFixed(2)}`}
          </button>
          <p className="text-center text-xs text-gray-400 mt-3">Charges the card you saved when you booked.</p>
        </div>
      </div>
    </div>
  );
}

export default function CheckInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f8faf9]" />}>
      <CheckInPageInner />
    </Suspense>
  );
}
