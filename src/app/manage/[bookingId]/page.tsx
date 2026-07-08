'use client';
import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, AlertCircle, Loader2, MapPin, Calendar, Clock, Users, ChevronRight, ArrowLeft } from 'lucide-react';

type BookingInfo = {
  bookingId: string;
  golferName: string;
  courseName: string;
  courseSlug: string;
  courseAddress: string;
  brandColor: string;
  date: string;
  time: string;
  holes: number;
  players: number;
  greenFeeTotal: number;
  cartFeeTotal: number;
  rangeBallsTotal: number;
  accessFeeTotal: number;
  totalAmount: number;
  cancellationHours: number;
  cancellationFeeTotal: number;
  cancellationFeeCharged: boolean;
  status: string;
  paymentStatus: string;
  windowOpen: boolean;
};

type AvailableSlot = {
  id: string; time: string; holes: number; spotsLeft: number;
  greenFee: number; cartFee: number;
};

type ModifyResult = {
  date: string; time: string; holes: number; players: number;
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number;
  accessFeeTotal: number; totalAmount: number;
};

function fmtTime(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}
function dollars(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

function PriceBreakdown({ greenFeeTotal, cartFeeTotal, rangeBallsTotal, accessFeeTotal, totalAmount }: {
  greenFeeTotal: number; cartFeeTotal: number; rangeBallsTotal: number;
  accessFeeTotal: number; totalAmount: number;
}) {
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex justify-between text-ink-soft"><span>Green Fee</span><span>{dollars(greenFeeTotal)}</span></div>
      {cartFeeTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Cart Fee</span><span>{dollars(cartFeeTotal)}</span></div>}
      {rangeBallsTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Range Balls</span><span>{dollars(rangeBallsTotal)}</span></div>}
      <div className="flex justify-between text-ink-soft"><span>Fees</span><span>{dollars(accessFeeTotal)}</span></div>
      <div className="flex justify-between font-semibold text-ink text-base border-t border-line pt-2">
        <span>Total due at check-in</span><span>{dollars(totalAmount)}</span>
      </div>
    </div>
  );
}

type View = 'main' | 'cancel-confirm' | 'change-time' | 'change-time-confirm' | 'change-players' | 'change-players-confirm' | 'modified';

function ManagePageInner() {
  const params = useParams();
  const search = useSearchParams();
  const bookingId = String(params.bookingId || '');
  const token = search.get('token') || '';

  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [expired, setExpired] = useState(false);
  const [view, setView] = useState<View>('main');

  // Cancel state
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const [cancelResult, setCancelResult] = useState<{ feeCharged: boolean } | null>(null);

  // Change time state
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState('');

  // Change players state
  const [selectedPlayers, setSelectedPlayers] = useState(0);
  const [changingPlayers, setChangingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState('');

  // Post-modify info
  const [modifyResult, setModifyResult] = useState<ModifyResult | null>(null);

  useEffect(() => {
    if (!bookingId || !token) { setErrorMsg('This link is missing required details.'); setLoading(false); return; }
    fetch(`/api/manage/${bookingId}?token=${encodeURIComponent(token)}`)
      .then(async r => {
        if (r.status === 410) { setExpired(true); return null; }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(data => { if (data) { setInfo(data); setSelectedPlayers(data.players); } })
      .catch(() => setErrorMsg('This link is invalid or has expired. Contact the course for assistance.'))
      .finally(() => setLoading(false));
  }, [bookingId, token]);

  async function handleCancel() {
    setCancelling(true); setCancelError('');
    try {
      const res = await fetch('/api/bookings/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, token }),
      });
      const data = await res.json();
      if (!res.ok) { setCancelError(data.error || 'Could not cancel. Please contact the course.'); setCancelling(false); return; }
      setCancelResult(data); setCancelled(true);
    } catch { setCancelError('Something went wrong. Please contact the course directly.'); }
    setCancelling(false); setView('main');
  }

  async function openChangeTime() {
    setSlotsLoading(true); setSwapError(''); setSelectedSlot(null);
    setView('change-time');
    try {
      const res = await fetch(`/api/manage/${bookingId}/available-times?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSlots(data);
    } catch (e) { setSwapError((e as Error).message || 'Could not load available times.'); }
    setSlotsLoading(false);
  }

  async function handleSwapTime() {
    if (!selectedSlot) return;
    setSwapping(true); setSwapError('');
    try {
      const res = await fetch(`/api/manage/${bookingId}/swap-time`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newTeeTimeId: selectedSlot.id }),
      });
      const data = await res.json();
      if (!res.ok) { setSwapError(data.error || 'Could not change tee time.'); setSwapping(false); return; }
      setModifyResult(data);
      if (info) setInfo({ ...info, time: data.time, greenFeeTotal: data.greenFeeTotal, cartFeeTotal: data.cartFeeTotal, accessFeeTotal: data.accessFeeTotal, totalAmount: data.totalAmount });
      setView('modified');
      // Re-send confirmation email
      fetch('/api/manage/' + bookingId + '/send-modified-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => undefined);
    } catch { setSwapError('Something went wrong. Please try again.'); }
    setSwapping(false);
  }

  async function handleChangePlayers() {
    if (!info || selectedPlayers === info.players) return;
    setChangingPlayers(true); setPlayersError('');
    try {
      const res = await fetch(`/api/manage/${bookingId}/change-players`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPlayers: selectedPlayers }),
      });
      const data = await res.json();
      if (!res.ok) { setPlayersError(data.error || 'Could not update party size.'); setChangingPlayers(false); return; }
      const updated = { ...data, date: info.date, time: info.time, holes: info.holes };
      setModifyResult(updated);
      setInfo({ ...info, players: data.players, greenFeeTotal: data.greenFeeTotal, cartFeeTotal: data.cartFeeTotal, accessFeeTotal: data.accessFeeTotal, totalAmount: data.totalAmount });
      setView('modified');
      fetch('/api/manage/' + bookingId + '/send-modified-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => undefined);
    } catch { setPlayersError('Something went wrong. Please try again.'); }
    setChangingPlayers(false);
  }

  if (loading) return <div className="min-h-screen bg-paper flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink-muted" /></div>;

  const headerStyle = { backgroundColor: info?.brandColor || '#24513B' };

  if (expired) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-line p-8 text-center">
          <Clock size={36} className="text-ink-muted mx-auto mb-4" />
          <h1 className="font-semibold text-ink mb-2">This link has expired</h1>
          <p className="text-ink-soft text-sm">Booking links expire 24 hours after your tee time. Contact the course directly for assistance.</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-line p-8 text-center">
          <AlertCircle size={36} className="text-bad mx-auto mb-4" />
          <h1 className="font-semibold text-ink mb-2">Link not recognized</h1>
          <p className="text-ink-soft text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (!info) return null;

  // ── Cancelled ─────────────────────────────────────────────────────────────
  if (cancelled) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
          <div className="h-14 flex items-center px-6" style={headerStyle}><span className="text-white font-medium">{info.courseName}</span></div>
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-lg bg-ok/8 flex items-center justify-center mx-auto mb-5"><CheckCircle size={28} className="text-ok" /></div>
            <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-2">Booking cancelled</h1>
            <p className="text-ink-soft text-sm mb-6">Your spot at {info.courseName} on {fmtDate(info.date)} has been cancelled.</p>
            {cancelResult?.feeCharged
              ? <div className="bg-warn/5 border border-warn/20 rounded-md p-4 mb-4 text-left"><p className="text-warn text-sm font-medium">Late-cancellation fee applied</p><p className="text-ink-soft text-xs mt-1">A {dollars(info.cancellationFeeTotal)} fee was charged — this cancellation came after the free-cancel window closed. Non-refundable.</p></div>
              : <div className="bg-ok/5 border border-ok/20 rounded-md p-4 mb-4 text-left"><p className="text-ok text-sm font-medium">No charge — your card has been released</p></div>
            }
            <p className="text-xs text-ink-muted">A confirmation email has been sent to you.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Modified ──────────────────────────────────────────────────────────────
  if (view === 'modified' && modifyResult) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
          <div className="h-14 flex items-center px-6" style={headerStyle}><span className="text-white font-medium">{info.courseName}</span></div>
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-lg bg-ok/8 flex items-center justify-center mx-auto mb-5"><CheckCircle size={28} className="text-ok" /></div>
            <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-2">Booking updated</h1>
            <p className="text-ink-soft text-sm mb-6">A confirmation email has been sent with your updated details.</p>
            <div className="bg-paper rounded-md border border-line p-4 mb-6 text-left space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Date</span><span className="font-medium text-ink">{fmtDate(modifyResult.date)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Time</span><span className="font-medium text-ink">{fmtTime(modifyResult.time)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Players</span><span className="font-medium text-ink">{modifyResult.players}</span></div>
              <div className="border-t border-line pt-2">
                <PriceBreakdown greenFeeTotal={modifyResult.greenFeeTotal} cartFeeTotal={modifyResult.cartFeeTotal} rangeBallsTotal={modifyResult.rangeBallsTotal} accessFeeTotal={modifyResult.accessFeeTotal} totalAmount={modifyResult.totalAmount} />
              </div>
            </div>
            <button onClick={() => setView('main')} className="text-sm text-ink-muted underline underline-offset-2">Back to booking</button>
          </div>
        </div>
      </div>
    );
  }

  const alreadyCancelled = info.status === 'cancelled';
  const alreadyCompleted = info.status === 'completed';
  const canModify = !alreadyCancelled && !alreadyCompleted && info.windowOpen;

  const policyText = info.cancellationFeeTotal > 0
    ? info.windowOpen
      ? `Free to cancel until ${info.cancellationHours}h before your tee time. A ${dollars(info.cancellationFeeTotal)} fee applies after that.`
      : `The free-cancellation window has closed. A ${dollars(info.cancellationFeeTotal)} fee has been or will be charged.`
    : 'Free cancellation any time — no late-cancellation fee.';

  const confirmCancelMsg = info.windowOpen
    ? `Cancel for free — no charge to your card.`
    : info.cancellationFeeCharged
      ? `A ${dollars(info.cancellationFeeTotal)} fee was already charged. Cancelling now won't add another charge, but the fee is non-refundable.`
      : `The free-cancel window has closed. Cancelling will charge ${dollars(info.cancellationFeeTotal)} to your card.`;

  // ── Change time: slot picker ──────────────────────────────────────────────
  if (view === 'change-time') {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
        <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
          <div className="h-14 flex items-center px-6 gap-3" style={headerStyle}>
            <button onClick={() => { setView('main'); setSelectedSlot(null); }} className="text-white/70 hover:text-white transition-colors"><ArrowLeft size={18} /></button>
            <span className="text-white font-medium">Choose a new time</span>
          </div>
          <div className="p-6">
            <p className="text-ink-muted text-sm mb-4">{fmtDate(info.date)} &middot; {info.players} player{info.players !== 1 ? 's' : ''}</p>
            {slotsLoading && <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-ink-muted" /></div>}
            {!slotsLoading && swapError && <p className="text-bad text-sm">{swapError}</p>}
            {!slotsLoading && !swapError && slots.length === 0 && (
              <p className="text-ink-muted text-sm text-center py-6">No other times available for this date.</p>
            )}
            {!slotsLoading && slots.length > 0 && (
              <div className="space-y-2">
                {slots.map(slot => {
                  const isSelected = selectedSlot?.id === slot.id;
                  return (
                    <button
                      key={slot.id}
                      onClick={() => setSelectedSlot(isSelected ? null : slot)}
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-md border text-sm transition-all ${isSelected ? 'border-pine bg-pine/5' : 'border-line hover:border-pine/30'}`}
                    >
                      <div className="text-left">
                        <span className="font-medium text-ink">{fmtTime(slot.time)}</span>
                        <span className="text-ink-muted ml-2">{slot.holes} holes &middot; {slot.spotsLeft} spot{slot.spotsLeft !== 1 ? 's' : ''} left</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-medium ${isSelected ? 'text-pine' : 'text-ink'}`}>{dollars(slot.greenFee * info.players)}</span>
                        {slot.greenFee !== info.greenFeeTotal / info.players && (
                          <span className="block text-[11px] text-ink-muted">vs {dollars(info.greenFeeTotal)}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedSlot && (
              <div className="mt-4 border border-line rounded-md p-4 space-y-3">
                <p className="text-sm font-medium text-ink">Confirm new time: {fmtTime(selectedSlot.time)}</p>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between text-ink-soft"><span>New green fee</span><span>{dollars(selectedSlot.greenFee * info.players)}</span></div>
                  {info.cartFeeTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Cart fee</span><span>{dollars(selectedSlot.cartFee * info.players)}</span></div>}
                  {info.rangeBallsTotal > 0 && <div className="flex justify-between text-ink-soft"><span>Range balls</span><span>{dollars(info.rangeBallsTotal)}</span></div>}
                  <div className="flex justify-between text-ink-soft"><span>Fees</span><span>{dollars(info.accessFeeTotal)}</span></div>
                  <div className="flex justify-between font-semibold text-ink border-t border-line pt-2">
                    <span>New total at check-in</span>
                    <span>{dollars(selectedSlot.greenFee * info.players + (info.cartFeeTotal > 0 ? selectedSlot.cartFee * info.players : 0) + info.rangeBallsTotal + info.accessFeeTotal)}</span>
                  </div>
                </div>
                {swapError && <p className="text-bad text-xs">{swapError}</p>}
                <button
                  onClick={handleSwapTime}
                  disabled={swapping}
                  className="w-full py-3 rounded-md bg-pine text-white font-medium text-sm hover:bg-pine-hover transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {swapping ? <><Loader2 size={14} className="animate-spin" /> Changing…</> : 'Confirm New Time'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Change players ────────────────────────────────────────────────────────
  if (view === 'change-players') {
    const perPlayerGreen = info.players > 0 ? info.greenFeeTotal / info.players : 0;
    const perPlayerCart = info.players > 0 ? info.cartFeeTotal / info.players : 0;
    const newGreen = Math.round(perPlayerGreen * selectedPlayers);
    const newCart = Math.round(perPlayerCart * selectedPlayers);
    const newAccess = 150 * selectedPlayers;
    const newTotal = newGreen + newCart + info.rangeBallsTotal + newAccess;
    const maxPlayers = 4;

    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
        <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
          <div className="h-14 flex items-center px-6 gap-3" style={headerStyle}>
            <button onClick={() => { setView('main'); setSelectedPlayers(info.players); }} className="text-white/70 hover:text-white transition-colors"><ArrowLeft size={18} /></button>
            <span className="text-white font-medium">Change party size</span>
          </div>
          <div className="p-6">
            <p className="text-ink-muted text-sm mb-5">{fmtDate(info.date)} at {fmtTime(info.time)}</p>

            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => setSelectedPlayers(p => Math.max(1, p - 1))}
                disabled={selectedPlayers <= 1}
                className="w-10 h-10 rounded-md border border-line flex items-center justify-center text-ink font-medium text-lg hover:border-pine/40 disabled:opacity-30 disabled:cursor-not-allowed"
              >−</button>
              <div className="flex-1 text-center">
                <span className="text-3xl font-serif font-medium text-ink">{selectedPlayers}</span>
                <p className="text-xs text-ink-muted mt-1">player{selectedPlayers !== 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={() => setSelectedPlayers(p => Math.min(maxPlayers, p + 1))}
                disabled={selectedPlayers >= maxPlayers}
                className="w-10 h-10 rounded-md border border-line flex items-center justify-center text-ink font-medium text-lg hover:border-pine/40 disabled:opacity-30 disabled:cursor-not-allowed"
              >+</button>
            </div>

            {selectedPlayers !== info.players && (
              <div className="border border-line rounded-md p-4 mb-4 space-y-2">
                <p className="text-xs text-ink-muted uppercase tracking-[0.06em] font-medium">Updated pricing</p>
                <PriceBreakdown greenFeeTotal={newGreen} cartFeeTotal={newCart} rangeBallsTotal={info.rangeBallsTotal} accessFeeTotal={newAccess} totalAmount={newTotal} />
                <p className="text-xs text-ink-muted">
                  {newTotal > info.totalAmount ? `+${dollars(newTotal - info.totalAmount)} vs current` : newTotal < info.totalAmount ? `−${dollars(info.totalAmount - newTotal)} vs current` : 'Same total'}
                </p>
              </div>
            )}

            {playersError && <p className="text-bad text-sm mb-3">{playersError}</p>}

            <button
              onClick={handleChangePlayers}
              disabled={changingPlayers || selectedPlayers === info.players}
              className="w-full py-3 rounded-md bg-pine text-white font-medium text-sm hover:bg-pine-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {changingPlayers ? <><Loader2 size={14} className="animate-spin" /> Updating…</> : `Update to ${selectedPlayers} Player${selectedPlayers !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <div className="max-w-lg w-full bg-white rounded-lg border border-line overflow-hidden">
        <div className="h-14 flex items-center px-6" style={headerStyle}>
          <span className="text-white font-medium">{info.courseName}</span>
        </div>
        <div className="p-8">
          <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-1">
            {alreadyCancelled ? 'Booking cancelled' : alreadyCompleted ? 'Round complete' : `Hi, ${info.golferName.split(' ')[0]}`}
          </h1>
          <p className="text-ink-soft text-sm mb-6">
            {alreadyCancelled ? 'This booking was cancelled.' : alreadyCompleted ? 'Thanks for playing — this round is complete.' : 'Manage your booking below.'}
          </p>

          {/* Details */}
          <div className="bg-paper rounded-md border border-line p-5 mb-5 space-y-3">
            <div className="flex items-center gap-2.5 text-sm"><Calendar size={15} className="text-ink-muted shrink-0" /><span className="text-ink font-medium">{fmtDate(info.date)}</span></div>
            <div className="flex items-center gap-2.5 text-sm"><Clock size={15} className="text-ink-muted shrink-0" /><span className="text-ink font-medium">{fmtTime(info.time)} &middot; {info.holes} holes</span></div>
            <div className="flex items-center gap-2.5 text-sm"><Users size={15} className="text-ink-muted shrink-0" /><span className="text-ink font-medium">{info.players} player{info.players !== 1 ? 's' : ''}</span></div>
            <div className="flex items-start gap-2.5 text-sm"><MapPin size={15} className="text-ink-muted shrink-0 mt-0.5" /><span className="text-ink-soft">{info.courseAddress}</span></div>
            <div className="border-t border-line pt-3">
              <PriceBreakdown greenFeeTotal={info.greenFeeTotal} cartFeeTotal={info.cartFeeTotal} rangeBallsTotal={info.rangeBallsTotal} accessFeeTotal={info.accessFeeTotal} totalAmount={info.totalAmount} />
            </div>
          </div>

          {/* Policy */}
          {!alreadyCancelled && !alreadyCompleted && (
            <div className={`rounded-md border p-4 mb-5 text-sm ${info.windowOpen ? 'bg-ok/5 border-ok/20 text-ok' : 'bg-warn/5 border-warn/20 text-warn'}`}>
              {policyText}
            </div>
          )}
          {alreadyCancelled && <div className="rounded-md bg-bad/5 border border-bad/20 p-4 mb-5 text-sm text-bad">This booking is cancelled.</div>}
          {alreadyCompleted && <div className="rounded-md bg-ok/5 border border-ok/20 p-4 mb-5 text-sm text-ok">This round was completed and payment was collected at check-in.</div>}

          {/* Modify actions (only when window still open) */}
          {canModify && view === 'main' && (
            <div className="space-y-2 mb-4">
              <button
                onClick={openChangeTime}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-md border border-line hover:border-pine/30 text-sm font-medium text-ink transition-colors"
              >
                <span className="flex items-center gap-2"><Clock size={15} className="text-ink-muted" />Change tee time</span>
                <ChevronRight size={15} className="text-ink-muted" />
              </button>
              <button
                onClick={() => { setSelectedPlayers(info.players); setView('change-players'); }}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-md border border-line hover:border-pine/30 text-sm font-medium text-ink transition-colors"
              >
                <span className="flex items-center gap-2"><Users size={15} className="text-ink-muted" />Change party size</span>
                <ChevronRight size={15} className="text-ink-muted" />
              </button>
            </div>
          )}

          {/* Cancel action */}
          {!alreadyCancelled && !alreadyCompleted && view === 'main' && (
            <button
              onClick={() => setView('cancel-confirm')}
              className="w-full py-3 rounded-md border border-bad/30 text-bad font-medium text-sm hover:bg-bad/5 transition-colors"
            >
              Cancel Booking
            </button>
          )}

          {view === 'cancel-confirm' && (
            <div className="border border-line rounded-md p-5 space-y-4 mt-4">
              <div className="flex items-start gap-2">
                <XCircle size={16} className="text-bad shrink-0 mt-0.5" />
                <p className="text-sm text-ink">{confirmCancelMsg}</p>
              </div>
              {cancelError && <p className="text-bad text-xs">{cancelError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setView('main')} className="flex-1 py-2.5 rounded-md border border-line text-ink-soft font-medium text-sm hover:bg-paper transition-colors">Keep Booking</button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 py-2.5 rounded-md bg-bad text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {cancelling ? <><Loader2 size={14} className="animate-spin" /> Cancelling…</> : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-ink-muted text-center mt-5">Booking ID: {info.bookingId}</p>
        </div>
      </div>
    </div>
  );
}

export default function ManagePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <ManagePageInner />
    </Suspense>
  );
}
