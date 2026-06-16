'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense } from 'react';
import { ChevronLeft, ExternalLink, Lock, CheckCircle } from 'lucide-react';

function formatTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

function displayDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function BookPageInner() {
  const params = useSearchParams();
  const router = useRouter();

  const teeTimeId = params.get('tee_time_id') || '';
  const courseId = params.get('course_id') || '';
  const courseName = params.get('course_name') || '';
  const courseSlug = params.get('course_slug') || '';
  const date = params.get('date') || '';
  const time = params.get('time') || '';
  const players = parseInt(params.get('players') || '2');
  const greenFee = parseFloat(params.get('green_fee') || '0');
  const cartFee = parseFloat(params.get('cart_fee') || '0');
  const bookingUrl = params.get('booking_url') || '';

  const totalCourse = (greenFee + cartFee) * players;
  const accessFee = 1.0;
  const total = totalCourse + accessFee;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    if (!name.trim() || !email.trim()) {
      setError('Please enter your name and email.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tee_time_id: parseInt(teeTimeId),
          course_id: parseInt(courseId),
          golfer_name: name,
          golfer_email: email,
          players,
        }),
      });

      if (!res.ok) throw new Error('Booking failed');
      setConfirmed(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-[#f8faf9] flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-3xl border border-gray-100 shadow-sm p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-[#f0fdf4] flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-emerald-500" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">You&apos;re all set!</h1>
          <p className="text-gray-500 mb-1">A confirmation email is on its way to <strong>{email}</strong>.</p>
          <p className="text-gray-500 mb-8 text-sm">
            Now head to {courseName}&apos;s booking system to complete your reservation.
          </p>

          <div className="bg-[#f8faf9] rounded-2xl p-5 mb-8 text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Course</span>
              <span className="font-semibold text-gray-900">{courseName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Date</span>
              <span className="font-semibold text-gray-900">{displayDate(date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tee Time</span>
              <span className="font-semibold text-gray-900">{formatTime(time)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Players</span>
              <span className="font-semibold text-gray-900">{players}</span>
            </div>
          </div>

          {bookingUrl ? (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 w-full justify-center py-4 rounded-xl font-bold text-white text-sm transition-all hover:shadow-lg hover:-translate-y-0.5 mb-3"
              style={{ background: '#1b4332' }}
            >
              Go to {courseName}&apos;s Booking Page
              <ExternalLink size={15} />
            </a>
          ) : (
            <button
              onClick={() => router.push('/courses')}
              className="inline-flex items-center gap-2 w-full justify-center py-4 rounded-xl font-bold text-white text-sm mb-3"
              style={{ background: '#1b4332' }}
            >
              Browse More Courses
            </button>
          )}
          <button
            onClick={() => router.push('/courses')}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Back to course search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8faf9]">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Back */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 text-sm mb-6 transition-colors"
        >
          <ChevronLeft size={16} /> Back to tee times
        </button>

        <h1 className="text-2xl font-black text-gray-900 mb-2">Confirm Your Tee Time</h1>
        <p className="text-gray-500 text-sm mb-8">
          Review your details below. After confirming, you&apos;ll be directed to {courseName}&apos;s own booking page to complete the reservation.
        </p>

        <div className="grid gap-6">

          {/* Booking summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div
              className="h-14 flex items-center px-6"
              style={{ background: 'linear-gradient(135deg,#0f2218,#1b4332)' }}
            >
              <span className="text-white font-bold">{courseName}</span>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Date</span>
                <span className="font-semibold text-gray-900">{displayDate(date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Tee Time</span>
                <span className="font-semibold text-gray-900">{formatTime(time)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Players</span>
                <span className="font-semibold text-gray-900">{players}</span>
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <div className="flex justify-between text-gray-500">
                  <span>Green fee (×{players})</span>
                  <span>${(greenFee * players).toFixed(2)}</span>
                </div>
                {cartFee > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Cart fee (×{players})</span>
                    <span>${(cartFee * players).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-500">
                  <span className="flex items-center gap-1">
                    Green Reserve access fee
                    <span className="text-[10px] bg-[#f0fdf4] text-[#065f46] px-1.5 py-0.5 rounded font-semibold">1×</span>
                  </span>
                  <span>$1.00</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-100 pt-2">
                  <span>Total charged today</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Golfer info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="font-bold text-gray-900">Your Details</h2>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="John Smith"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#1b4332] focus:ring-2 focus:ring-[#1b4332]/10 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#1b4332] focus:ring-2 focus:ring-[#1b4332]/10 transition-all"
              />
            </div>
            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}
          </div>

          {/* CTA */}
          <div className="space-y-3">
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full py-4 rounded-xl font-bold text-white text-sm transition-all hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
              style={{ background: '#1b4332' }}
            >
              {loading ? 'Processing…' : `Confirm & Pay $${total.toFixed(2)}`}
            </button>
            <div className="flex items-center justify-center gap-2 text-gray-400 text-xs">
              <Lock size={12} />
              <span>Secure checkout · $1 goes to Green Reserve · Green fees paid directly to the course</span>
            </div>
          </div>

          {/* Transparency note */}
          <div className="bg-[#f0fdf4] rounded-2xl p-5 border border-emerald-100">
            <p className="text-emerald-800 text-sm font-medium mb-1">How this works</p>
            <p className="text-emerald-700 text-xs leading-relaxed">
              Green Reserve charges a $1 access fee — that&apos;s it. After you confirm, you&apos;ll be redirected to {courseName}&apos;s own booking system where you&apos;ll complete your tee time reservation directly with them. They control the pricing, tee sheet, and everything else.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f8faf9]" />}>
      <BookPageInner />
    </Suspense>
  );
}
