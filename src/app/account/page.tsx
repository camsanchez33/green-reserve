'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Clock, MapPin, Users, ChevronRight, LogOut, Trophy } from 'lucide-react';

interface Booking {
  id: string; players: number; appliedRate: string; totalAmount: number;
  paymentStatus: string; status: string; createdAt: string;
  teeTime: { date: string; time: string; holes: number };
  course: { name: string; city: string; state: string; slug: string };
}

interface GolferProfile {
  id: string; firstName: string; lastName: string; email: string; phone: string;
}

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<GolferProfile | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelResult, setCancelResult] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      fetch('/api/golfer/auth/me').then(r => r.ok ? r.json() : null),
      fetch('/api/bookings').then(r => r.ok ? r.json() : []),
    ]).then(([prof, bks]) => {
      if (!prof) { router.push('/account/login'); return; }
      setProfile(prof);
      setBookings(bks);
      setLoading(false);
    });
  }, [router]);

  async function cancelBooking(bookingId: string) {
    if (!confirm('Cancel this booking? Refunds follow the course\'s cancellation policy.')) return;
    setCancelling(bookingId);
    const res = await fetch('/api/bookings/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId }),
    });
    const data = await res.json();
    if (res.ok) {
      setCancelResult(r => ({ ...r, [bookingId]: data.refundIssued ? `Refund of $${(data.refundAmount / 100).toFixed(2)} issued` : 'Cancelled (no refund — outside window)' }));
      setBookings(bks => bks.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b));
    }
    setCancelling(null);
  }

  async function logout() {
    await fetch('/api/golfer/auth/logout', { method: 'POST' });
    router.push('/');
  }

  const upcoming = bookings.filter(b => b.status === 'confirmed' && new Date(`${b.teeTime.date}T${b.teeTime.time}`) > new Date());
  const past = bookings.filter(b => b.status === 'confirmed' && new Date(`${b.teeTime.date}T${b.teeTime.time}`) <= new Date());
  const cancelled = bookings.filter(b => b.status === 'cancelled');

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1b4332] px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-white font-black text-xl tracking-tight">
          Green<span className="text-green-300">Reserve</span>
        </Link>
        <button onClick={logout} className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-black text-xl">
            {profile?.firstName[0]}{profile?.lastName[0]}
          </div>
          <div>
            <div className="font-black text-gray-900 text-lg">{profile?.firstName} {profile?.lastName}</div>
            <div className="text-sm text-gray-500">{profile?.email}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-2xl font-black text-green-700">{bookings.filter(b => b.status === 'confirmed').length}</div>
            <div className="text-xs text-gray-500">total rounds</div>
          </div>
        </div>

        {/* Upcoming */}
        <h2 className="font-black text-gray-900 text-lg mb-3 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-green-600" /> Upcoming Tee Times
        </h2>
        {upcoming.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center mb-6">
            <p className="text-gray-400 mb-3">No upcoming tee times.</p>
            <Link href="/courses" className="text-green-700 font-semibold text-sm hover:underline">Find a course →</Link>
          </div>
        )}
        <div className="space-y-3 mb-6">
          {upcoming.map(b => (
            <BookingCard key={b.id} b={b} onCancel={cancelBooking} cancelling={cancelling} cancelResult={cancelResult} />
          ))}
        </div>

        {/* Past */}
        {past.length > 0 && (
          <>
            <h2 className="font-black text-gray-900 text-lg mb-3">Past Rounds</h2>
            <div className="space-y-3 mb-6">
              {past.map(b => <BookingCard key={b.id} b={b} past />)}
            </div>
          </>
        )}

        {/* Cancelled */}
        {cancelled.length > 0 && (
          <>
            <h2 className="font-black text-gray-900 text-lg mb-3 text-gray-500">Cancelled</h2>
            <div className="space-y-3">
              {cancelled.map(b => <BookingCard key={b.id} b={b} past />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BookingCard({ b, onCancel, cancelling, cancelResult, past }: {
  b: Booking; past?: boolean;
  onCancel?: (id: string) => void;
  cancelling?: string | null;
  cancelResult?: Record<string, string>;
}) {
  const isCancelled = b.status === 'cancelled';
  return (
    <div className={`bg-white rounded-2xl border p-5 ${isCancelled ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-black text-gray-900">{b.course.name}</span>
            {isCancelled && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Cancelled</span>}
            {b.appliedRate !== 'standard' && !isCancelled && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium capitalize">{b.appliedRate} rate</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{b.teeTime.date}</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{b.teeTime.time}</span>
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{b.players}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
            <MapPin className="w-3 h-3" />{b.course.city}, {b.course.state} · {b.teeTime.holes} holes
          </div>
        </div>
        <div className="text-right ml-4">
          <div className="font-black text-gray-900">${(b.totalAmount / 100).toFixed(2)}</div>
          <div className="text-xs text-gray-400 capitalize">{b.paymentStatus}</div>
        </div>
      </div>

      {cancelResult?.[b.id] && (
        <div className="mt-3 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{cancelResult[b.id]}</div>
      )}

      {!past && !isCancelled && onCancel && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          <Link href={`/courses/${b.course.slug}`}
            className="flex items-center gap-1 text-xs text-green-700 font-medium hover:underline">
            View course <ChevronRight className="w-3 h-3" />
          </Link>
          <button onClick={() => onCancel(b.id)} disabled={cancelling === b.id}
            className="ml-auto text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50">
            {cancelling === b.id ? 'Cancelling...' : 'Cancel booking'}
          </button>
        </div>
      )}
    </div>
  );
}
