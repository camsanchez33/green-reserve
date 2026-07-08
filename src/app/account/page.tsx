'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Clock, MapPin, Users, ChevronRight, LogOut, Trophy } from 'lucide-react';
import { getBookingStatus, statusToneText } from '@/lib/booking-status';

interface Booking {
  id: string; players: number; appliedRate: string; totalAmount: number;
  paymentStatus: string; status: string; createdAt: string; checkInToken: string | null;
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
    if (!confirm('Cancel this booking? Your card was never charged, so there\'s nothing to refund — unless a late-cancellation fee already applied, which is non-refundable.')) return;
    setCancelling(bookingId);
    const res = await fetch('/api/bookings/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId }),
    });
    const data = await res.json();
    if (res.ok) {
      setCancelResult(r => ({ ...r, [bookingId]: data.feeCharged ? 'Cancelled — late-cancellation fee already charged is non-refundable' : 'Cancelled — no charge was made' }));
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
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-pine border-t-transparent rounded animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <div className="bg-pine px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-[17px] font-serif font-medium tracking-tight text-white">
          Green<span className="text-paper/70">Reserve</span>
        </Link>
        <button onClick={logout} className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Profile card */}
        <div className="bg-white rounded-lg border border-line p-6 mb-6 flex items-center gap-4">
          <div className="w-14 h-14 bg-pine/10 rounded-lg flex items-center justify-center text-pine font-semibold text-xl">
            {profile?.firstName[0]}{profile?.lastName[0]}
          </div>
          <div>
            <div className="font-semibold text-ink text-lg">{profile?.firstName} {profile?.lastName}</div>
            <div className="text-sm text-ink-soft">{profile?.email}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-2xl font-serif font-medium text-pine">{bookings.filter(b => b.status === 'confirmed').length}</div>
            <div className="text-xs text-ink-muted">total rounds</div>
          </div>
        </div>

        {/* Upcoming */}
        <h2 className="font-semibold text-ink text-base mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-pine" /> Upcoming Tee Times
        </h2>
        {upcoming.length === 0 && (
          <div className="bg-white rounded-lg border border-line p-8 text-center mb-6">
            <p className="text-ink-muted mb-3 text-sm">No upcoming tee times.</p>
            <Link href="/" className="text-pine font-medium text-sm hover:underline">Browse courses →</Link>
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
            <h2 className="font-semibold text-ink text-base mb-3">Past Rounds</h2>
            <div className="space-y-3 mb-6">
              {past.map(b => <BookingCard key={b.id} b={b} past />)}
            </div>
          </>
        )}

        {/* Cancelled */}
        {cancelled.length > 0 && (
          <>
            <h2 className="font-semibold text-ink-muted text-base mb-3">Cancelled</h2>
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
  const isCompleted = b.status === 'completed';
  const bStatus = getBookingStatus(b.status, b.paymentStatus);
  return (
    <div className={`bg-white rounded-lg border p-5 ${isCancelled ? 'border-line opacity-60' : 'border-line'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-ink">{b.course.name}</span>
            {isCancelled && <span className="text-xs text-bad font-medium">Cancelled</span>}
            {isCompleted && <span className="text-xs text-ok font-medium">Checked In &amp; Paid</span>}
            {b.appliedRate !== 'standard' && !isCancelled && (
              <span className="text-xs text-pine font-medium capitalize">{b.appliedRate} rate</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-ink-soft flex-wrap">
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{b.teeTime.date}</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{b.teeTime.time}</span>
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{b.players}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-ink-muted mt-1">
            <MapPin className="w-3 h-3" />{b.course.city}, {b.course.state} · {b.teeTime.holes} holes
          </div>
        </div>
        <div className="text-right ml-4">
          <div className="font-semibold text-ink">${(b.totalAmount / 100).toFixed(2)}</div>
          <div className={`text-xs font-medium mt-0.5 ${statusToneText(bStatus.tone)}`}>{bStatus.label}</div>
        </div>
      </div>

      {cancelResult?.[b.id] && (
        <div className="mt-3 text-xs text-ok bg-ok/5 rounded-md px-3 py-2">{cancelResult[b.id]}</div>
      )}

      {!past && !isCancelled && !isCompleted && onCancel && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-line">
          <Link href={`/courses/${b.course.slug}`}
            className="flex items-center gap-1 text-xs text-pine font-medium hover:underline">
            View course <ChevronRight className="w-3 h-3" />
          </Link>
          {b.checkInToken && (
            <Link href={`/checkin/${b.id}?token=${b.checkInToken}`}
              className="text-xs bg-pine text-white font-medium px-3 py-1.5 rounded-md hover:bg-pine-hover transition-colors">
              Check In &amp; Pay
            </Link>
          )}
          <button onClick={() => onCancel(b.id)} disabled={cancelling === b.id}
            className="ml-auto text-xs text-bad hover:opacity-70 font-medium disabled:opacity-50 transition-opacity">
            {cancelling === b.id ? 'Cancelling...' : 'Cancel booking'}
          </button>
        </div>
      )}
    </div>
  );
}
