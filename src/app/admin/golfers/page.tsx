'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, User, ArrowLeft, ExternalLink, Send, AlertTriangle, ChevronRight, X } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import { MANAGER_PLUS } from '@/lib/admin-roles';
import { StatusDot } from '@/components/ui/StatusDot';
import { EmptyState } from '@/components/EmptyState';
import { adminFetch } from '@/lib/admin-fetch';

// MP-6d: the Golfers RECORD page. Before this it could look but barely touch:
// resend confirmation (and "Sent" was a guess), nothing else. A real support
// call needs: who is this person and can I trust them (rounds, no-shows, late
// cancels, failed charges, lifetime collected), what happened to their money
// (the PaymentEvent ledger MP-6b started writing), and the actions — resend
// confirmation, resend receipt, cancel on their behalf, refund.

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_URL ?? '');
const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtStamp = (s: string) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const iCls = 'bg-paper border border-line rounded-md px-3 py-2.5 text-ink text-sm placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

interface GolferSummary { id: string; email: string; name: string; phone: string; bookingCount: number; createdAt: string }
interface GuestBooking {
  id: string; golferName: string; golferEmail: string; golferPhone: string;
  players: number; totalAmount: number; status: string; createdAt: string;
  courseName: string; courseId: string; teeDate: string; teeTime: string;
}
interface PaymentEvent { id: string; kind: string; amount: number; actor: string; actorName: string | null; detail: string; at: string }
interface BookingDetail {
  id: string; status: string; paymentStatus: string;
  players: number; totalAmount: number; accessFeeTotal: number; greenFeeTotal: number; cartFeeTotal: number;
  cancellationFeeTotal: number; refundedTotal: number;
  checkedInAt: string | null; cancelledAt: string | null; cancellationFeeChargedAt: string | null;
  checkInFailReason: string; hasCard: boolean; isGuest: boolean; noShow: boolean;
  createdAt: string; courseId: string; courseName: string; courseSlug: string;
  teeDate: string; teeTime: string; holes: number;
  events: PaymentEvent[];
}
interface Trust { rounds: number; noShows: number; lateCancels: number; failedCharges: number; upcoming: number; lifetimeCollected: number; refunded: number }
interface GolferDetail {
  id: string | null; email: string; firstName: string; lastName: string; phone: string; createdAt: string | null; isGuest: boolean;
  bookings: BookingDetail[]; trust: Trust;
}

function statusOf(b: BookingDetail): { dot: 'ok' | 'bad' | 'warn' | 'neutral'; label: string } {
  if (b.status === 'cancelled') return b.cancellationFeeChargedAt ? { dot: 'bad', label: 'Cancelled — late fee kept' } : { dot: 'neutral', label: 'Cancelled — no charge' };
  if (b.paymentStatus === 'refunded') return { dot: 'neutral', label: 'Refunded' };
  if (b.status === 'completed') return { dot: 'ok', label: b.refundedTotal > 0 ? 'Checked in · part refunded' : 'Checked in & paid' };
  if (b.checkInFailReason) return { dot: 'bad', label: 'Card declined at check-in' };
  if (b.noShow) return { dot: 'warn', label: 'No-show — never checked in' };
  if (b.paymentStatus === 'cancellation_fee_charged') return { dot: 'warn', label: 'Late fee charged · not yet checked in' };
  if (b.paymentStatus === 'paid') return { dot: 'ok', label: 'Paid · not yet checked in' };
  return { dot: 'neutral', label: b.hasCard ? 'Confirmed · card on file' : 'Confirmed · no card' };
}
const EVENT_LABEL: Record<string, string> = {
  refund: 'Refund issued', refund_failed: 'Refund FAILED', dispute_opened: 'Chargeback opened', dispute_closed: 'Chargeback closed', charge_failed: 'Charge failed',
};

function GolfersInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('id') ?? '';
  const guestEmail = searchParams.get('guest') ?? '';
  const { role } = useAdminSession();
  const canMoveMoney = MANAGER_PLUS.includes(role);

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [searching, setSearching] = useState(false);
  const [golfers, setGolfers] = useState<GolferSummary[]>([]);
  const [guestBookings, setGuestBookings] = useState<GuestBooking[]>([]);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);

  const [detail, setDetail] = useState<GolferDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  // One action at a time per booking, and the outcome stays on screen.
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingDetail | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [refundTarget, setRefundTarget] = useState<BookingDetail | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [modalError, setModalError] = useState('');

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setGolfers([]); setGuestBookings([]); setSearched(false); return; }
    setSearching(true); setSearchError('');
    const res = await adminFetch<{ golfers: GolferSummary[]; guestBookings: GuestBooking[] }>(`/api/admin/golfers?q=${encodeURIComponent(q)}`, { subject: 'golfers' });
    if (!res.ok) { setSearchError(res.message); setSearching(false); return; }
    setGolfers(res.data.golfers ?? []); setGuestBookings(res.data.guestBookings ?? []); setSearched(true);
    setSearching(false);
  }, []);

  function handleQueryChange(v: string) {
    setQuery(v);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => search(v), 350);
  }
  useEffect(() => { const q0 = searchParams.get('q'); if (q0 && !selectedId && !guestEmail) search(q0); }, [searchParams, selectedId, guestEmail, search]);

  const loadDetail = useCallback(async () => {
    const url = selectedId ? `/api/admin/golfers?id=${encodeURIComponent(selectedId)}` : `/api/admin/golfers?guest=${encodeURIComponent(guestEmail)}`;
    setDetailLoading(true); setDetailError('');
    const res = await adminFetch<{ golfer: GolferDetail }>(url, { subject: 'this golfer' });
    if (!res.ok) { setDetail(null); setDetailError(res.message); }
    else setDetail(res.data.golfer);
    setDetailLoading(false);
  }, [selectedId, guestEmail]);

  useEffect(() => {
    if (selectedId || guestEmail) loadDetail(); else setDetail(null);
  }, [selectedId, guestEmail, loadDetail]);

  function go(params: Record<string, string | null>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) { if (v === null) p.delete(k); else p.set(k, v); }
    router.push(`/admin/golfers?${p}`);
  }

  async function act(b: BookingDetail, action: 'resend_confirmation' | 'resend_receipt') {
    setBusy(b.id); setNote(null);
    const res = await adminFetch<{ ok: boolean; sentTo: string }>('/api/admin/golfers', { method: 'POST', body: JSON.stringify({ bookingId: b.id, action }), subject: 'this email', action: 'send' });
    setBusy(null);
    if (!res.ok) { setNote({ ok: false, text: res.message }); return; }
    setNote({ ok: true, text: `${action === 'resend_receipt' ? 'Receipt' : 'Confirmation'} sent to ${res.data.sentTo}.` });
  }

  async function submitCancel() {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) { setModalError('A reason is required — the golfer reads it.'); return; }
    setBusy(cancelTarget.id); setModalError('');
    const res = await adminFetch<{ ok: boolean; feeCharged: boolean }>('/api/admin/golfers', { method: 'POST', body: JSON.stringify({ bookingId: cancelTarget.id, action: 'cancel', reason: cancelReason.trim() }), subject: 'this booking', action: 'send' });
    setBusy(null);
    if (!res.ok) { setModalError(res.message); return; }
    setNote({ ok: true, text: res.data.feeCharged ? 'Cancelled. Their late-cancellation fee had already been charged and stays charged; they have been emailed.' : 'Cancelled — no charge, and they have been emailed.' });
    setCancelTarget(null); setCancelReason('');
    loadDetail();
  }

  async function submitRefund() {
    if (!refundTarget) return;
    const dollars = refundAmount.trim() === '' ? null : Number(refundAmount);
    if (dollars !== null && (!Number.isFinite(dollars) || dollars <= 0)) { setModalError('Enter an amount in dollars, or leave it blank for a full refund.'); return; }
    if (!refundReason.trim()) { setModalError('A reason is required — the golfer reads it.'); return; }
    setBusy(refundTarget.id); setModalError('');
    const res = await adminFetch<{ amountCents: number; full: boolean; emailSent: boolean }>('/api/admin/refund', {
      method: 'POST', body: JSON.stringify({ bookingId: refundTarget.id, amountCents: dollars === null ? undefined : Math.round(dollars * 100), reason: refundReason.trim() }),
      subject: 'this refund', action: 'send',
    });
    setBusy(null);
    if (!res.ok) { setModalError(res.message); return; }
    setNote({ ok: true, text: `Refunded ${fmtMoney(res.data.amountCents / 100)}${res.data.full ? '' : ' (partial)'}${res.data.emailSent ? ' — they have been emailed.' : ' — the email did NOT send; tell them yourself.'}` });
    setRefundTarget(null); setRefundAmount(''); setRefundReason('');
    loadDetail();
  }

  // Item 8: group guest bookings that share an email with a registered account
  const golferEmailSet = new Set(golfers.map(g => g.email.toLowerCase()));
  const guestByEmail = new Map<string, GuestBooking[]>();
  for (const b of guestBookings) {
    const key = b.golferEmail.toLowerCase();
    if (golferEmailSet.has(key)) continue;
    if (!guestByEmail.has(key)) guestByEmail.set(key, []);
    guestByEmail.get(key)!.push(b);
  }
  const guestPeople = [...guestByEmail.entries()].map(([email, list]) => ({ email, name: list[0].golferName, phone: list[0].golferPhone, count: list.length, latest: list[0] }));

  const inRecord = !!(selectedId || guestEmail);
  const t = detail?.trust;
  const remaining = refundTarget ? Math.max(0, refundTarget.totalAmount - refundTarget.refundedTotal) : 0;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="golfers"/>
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-5xl">
          <div className="mb-6">
            <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">Support</p>
            <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">{inRecord ? 'Golfer record' : 'Golfer lookup'}</h1>
          </div>

          {inRecord ? (
            <div>
              <button onClick={() => go({ id: null, guest: null })} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors mb-5">
                <ArrowLeft className="w-4 h-4"/>Back to search
              </button>

              {detailLoading && <div className="py-16 text-center text-ink-muted text-sm">Loading…</div>}
              {detailError && (
                <div className="bg-bad/5 border border-bad/20 rounded-lg px-4 py-3 text-sm text-bad flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0"/>{detailError}
                  <button onClick={loadDetail} className="ml-auto underline">Retry</button>
                </div>
              )}

              {detail && t && (
                <div className="space-y-5">
                  {/* Identity */}
                  <div className="bg-white border border-line rounded-lg p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-pine/10 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-pine"/></div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ink text-base">{detail.firstName} {detail.lastName} {detail.isGuest && <span className="text-xs font-normal text-ink-muted">· guest, no account</span>}</div>
                        <a href={'mailto:' + detail.email} className="text-sm text-ink-soft hover:text-pine">{detail.email}</a>
                        {detail.phone && <div className="text-sm text-ink-muted mt-0.5">{detail.phone}</div>}
                      </div>
                      <div className="text-right text-xs text-ink-muted">
                        <div>{detail.isGuest ? 'First booked' : 'Account created'}</div>
                        <div className="font-medium text-ink-soft mt-0.5">{detail.createdAt ? fmtDate(detail.createdAt) : detail.bookings.length ? fmtDate(detail.bookings[detail.bookings.length - 1].createdAt) : '—'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Trust strip — whether to waive a fee gladly or spot a pattern */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {[
                      { label: 'Rounds played', value: String(t.rounds), tone: 'text-ink' },
                      { label: 'Upcoming', value: String(t.upcoming), tone: 'text-ink' },
                      { label: 'No-shows', value: String(t.noShows), tone: t.noShows > 0 ? 'text-warn' : 'text-ink' },
                      { label: 'Late cancels', value: String(t.lateCancels), tone: t.lateCancels > 0 ? 'text-warn' : 'text-ink' },
                      { label: 'Failed charges', value: String(t.failedCharges), tone: t.failedCharges > 0 ? 'text-bad' : 'text-ink' },
                      { label: 'Lifetime paid', value: fmtMoney(t.lifetimeCollected), tone: 'text-ok', sub: t.refunded > 0 ? `${fmtMoney(t.refunded)} refunded` : undefined },
                    ].map(c => (
                      <div key={c.label} className="bg-white border border-line rounded-lg p-4">
                        <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">{c.label}</div>
                        <div className={'text-[22px] font-serif font-medium leading-none tabular-nums ' + c.tone}>{c.value}</div>
                        {c.sub && <div className="text-[11px] text-ink-faint mt-1">{c.sub}</div>}
                      </div>
                    ))}
                  </div>

                  {note && (
                    <div className={'rounded-md px-4 py-2.5 text-sm flex items-center justify-between gap-3 border ' + (note.ok ? 'bg-ok/5 border-ok/20 text-ok' : 'bg-bad/5 border-bad/20 text-bad')} role={note.ok ? 'status' : 'alert'}>
                      <span>{note.text}</span>
                      <button onClick={() => setNote(null)} className="text-ink-muted hover:text-ink"><X className="w-3.5 h-3.5"/></button>
                    </div>
                  )}

                  {/* Bookings + money, one timeline per booking */}
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Bookings ({detail.bookings.length})</div>
                  {detail.bookings.length === 0 ? (
                    <div className="bg-white border border-line rounded-lg py-12 text-center text-ink-muted text-sm">No bookings</div>
                  ) : (
                    <div className="space-y-2">
                      {detail.bookings.map(b => {
                        const st = statusOf(b);
                        const isBusy = busy === b.id;
                        const canCancel = b.status === 'confirmed';
                        const canRefund = (b.paymentStatus === 'paid' || b.paymentStatus === 'refunded') && b.totalAmount - b.refundedTotal > 0.005;
                        const canReceipt = b.paymentStatus === 'paid' || b.paymentStatus === 'refunded';
                        return (
                          <div key={b.id} className="bg-white border border-line rounded-lg px-5 py-4">
                            <div className="flex items-start gap-3">
                              <div className="pt-0.5"><StatusDot status={st.dot} label={st.label}/></div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <a href={`/admin/courses/${b.courseId}`} className="font-medium text-sm text-ink hover:text-pine">{b.courseName}</a>
                                  <span className="text-ink-faint text-[11px]">·</span>
                                  <span className="text-xs text-ink-muted">{b.teeDate} at {b.teeTime}</span>
                                  <span className="text-ink-faint text-[11px]">·</span>
                                  <span className="text-xs text-ink-muted">{b.players}p · {b.holes}h</span>
                                  {b.isGuest && !detail.isGuest && <span className="text-[10px] text-ink-faint">guest booking</span>}
                                </div>
                                <div className="text-[11px] text-ink-muted mt-1">
                                  Booked {fmtDate(b.createdAt)} · {b.paymentStatus.replace(/_/g, ' ')}{b.hasCard ? '' : ' · no card'}
                                </div>
                                {b.checkInFailReason && <div className="text-[11px] text-bad mt-0.5">{b.checkInFailReason}</div>}
                                {b.events.length > 0 && (
                                  <ul className="mt-2 space-y-0.5 border-l-2 border-line-soft pl-3">
                                    {b.events.map(e => (
                                      <li key={e.id} className="text-[11px] text-ink-soft">
                                        <span className={'font-medium ' + (e.kind === 'refund' ? 'text-ok' : e.kind === 'dispute_closed' ? 'text-ink' : 'text-bad')}>{EVENT_LABEL[e.kind] ?? e.kind}</span>
                                        {' '}{fmtMoney(e.amount)} · {fmtStamp(e.at)}{e.actorName ? ` · ${e.actorName}` : e.actor === 'stripe' ? ' · Stripe' : ''}
                                        {e.detail && <span className="text-ink-muted"> — {e.detail}</span>}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-medium text-ink tabular-nums">{fmtMoney(b.totalAmount)}</div>
                                {b.refundedTotal > 0 && <div className="text-[11px] text-ink-muted tabular-nums">−{fmtMoney(b.refundedTotal)} refunded</div>}
                                <div className="text-[11px] text-ink-faint tabular-nums">GR {fmtMoney(b.accessFeeTotal)}</div>
                              </div>
                            </div>
                            {/* Action row */}
                            <div className="flex items-center gap-2 flex-wrap justify-end mt-3 pt-3 border-t border-line-soft">
                              <a href={`${BASE_URL}/receipt/${b.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink underline mr-auto">Receipt page<ExternalLink className="w-3 h-3"/></a>
                              {canCancel && (
                                <button onClick={() => act(b, 'resend_confirmation')} disabled={isBusy}
                                  className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border border-line hover:border-line-strong text-ink-muted hover:text-ink transition-colors disabled:opacity-50">
                                  <Send className="w-3 h-3"/>{isBusy ? 'Working…' : 'Resend confirmation'}
                                </button>
                              )}
                              {canReceipt && (
                                <button onClick={() => act(b, 'resend_receipt')} disabled={isBusy}
                                  className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border border-line hover:border-line-strong text-ink-muted hover:text-ink transition-colors disabled:opacity-50">
                                  <Send className="w-3 h-3"/>{isBusy ? 'Working…' : 'Resend receipt'}
                                </button>
                              )}
                              {canCancel && canMoveMoney && (
                                <button onClick={() => { setCancelTarget(b); setCancelReason(''); setModalError(''); }} disabled={isBusy}
                                  className="text-[11px] font-medium px-3 py-1.5 rounded-md border border-bad/30 text-bad hover:bg-bad/5 transition-colors disabled:opacity-50">
                                  Cancel for them
                                </button>
                              )}
                              {canRefund && canMoveMoney && (
                                <button onClick={() => { setRefundTarget(b); setRefundAmount(''); setRefundReason(''); setModalError(''); }} disabled={isBusy}
                                  className="text-[11px] font-medium px-3 py-1.5 rounded-md border border-bad/30 text-bad hover:bg-bad/5 transition-colors disabled:opacity-50">
                                  Refund
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!canMoveMoney && <p className="text-[11px] text-ink-faint">Cancelling or refunding on a golfer&apos;s behalf needs manager access.</p>}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="relative mb-6 max-w-lg">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none"/>
                <input value={query} onChange={e => handleQueryChange(e.target.value)} placeholder="Search by email, name, or phone…" className={iCls + ' pl-10 w-full'} autoFocus/>
                {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">Searching…</div>}
              </div>

              {searchError && (
                <div className="bg-bad/5 border border-bad/20 rounded-lg px-4 py-3 text-sm text-bad mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0"/>{searchError}
                </div>
              )}

              {searched && !searching && (
                golfers.length === 0 && guestPeople.length === 0 ? (
                  <div className="bg-white border border-line rounded-lg"><EmptyState message={`No golfers found for "${query}"`} /></div>
                ) : (
                  <div className="space-y-5">
                    {golfers.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Golfer accounts ({golfers.length})</div>
                        <div className="bg-white border border-line rounded-lg divide-y divide-line-soft overflow-hidden">
                          {golfers.map(g => (
                            <button key={g.id} onClick={() => go({ id: g.id, guest: null, q: query })} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-paper/60 transition-colors text-left">
                              <div className="w-8 h-8 rounded-full bg-pine/10 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-pine"/></div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-ink">{g.name}</div>
                                <div className="text-xs text-ink-muted mt-0.5">{g.email}{g.phone ? ` · ${g.phone}` : ''}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs text-ink-muted">{g.bookingCount} booking{g.bookingCount !== 1 ? 's' : ''}</div>
                                <div className="text-xs text-ink-faint mt-0.5">Since {fmtDate(g.createdAt)}</div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-ink-faint shrink-0"/>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {guestPeople.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Guests — no account ({guestPeople.length})</div>
                        <div className="bg-white border border-line rounded-lg divide-y divide-line-soft overflow-hidden">
                          {guestPeople.map(p => (
                            <button key={p.email} onClick={() => go({ guest: p.email, id: null, q: query })} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-paper/60 transition-colors text-left">
                              <div className="w-8 h-8 rounded-full bg-paper border border-line flex items-center justify-center shrink-0"><User className="w-4 h-4 text-ink-muted"/></div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-ink">{p.name}</div>
                                <div className="text-xs text-ink-muted mt-0.5">{p.email}{p.phone ? ` · ${p.phone}` : ''}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs text-ink-muted">{p.count} booking{p.count !== 1 ? 's' : ''}</div>
                                <div className="text-xs text-ink-faint mt-0.5">Last: {p.latest.courseName} · {p.latest.teeDate}</div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-ink-faint shrink-0"/>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}

              {!searched && !searching && (
                <div className="py-20 text-center">
                  <Search className="w-8 h-8 text-ink-faint mx-auto mb-3"/>
                  <div className="text-ink-muted text-sm">Search by email, name, or phone to look up a golfer</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cancel on the golfer's behalf */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-line rounded-lg p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-serif font-medium text-ink mb-1">Cancel {cancelTarget.courseName} for {detail?.firstName}?</h3>
            <p className="text-sm text-ink-soft mb-3">
              {cancelTarget.teeDate} at {cancelTarget.teeTime}. {cancelTarget.paymentStatus === 'paid'
                ? 'The round was already paid — it is refunded as part of the cancellation.'
                : cancelTarget.paymentStatus === 'cancellation_fee_charged'
                  ? 'Their late-cancellation fee was already charged and stays charged.'
                  : 'Nothing has been charged; their card is simply never billed.'} They are emailed with your reason.
            </p>
            <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Reason — the golfer reads this</label>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3} placeholder="You called to say you can't make it and asked us to cancel." className={iCls + ' w-full resize-none mb-3'} />
            {modalError && <p className="text-xs text-bad mb-3">{modalError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setCancelTarget(null)} disabled={!!busy} className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors disabled:opacity-50">Keep it</button>
              <button onClick={submitCancel} disabled={!!busy} className="flex-1 bg-bad hover:bg-bad/90 text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors">{busy ? 'Cancelling…' : 'Cancel booking'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Refund */}
      {refundTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-line rounded-lg p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-serif font-medium text-ink mb-1">Refund {detail?.firstName}</h3>
            <p className="text-sm text-ink-soft mb-4">
              {fmtMoney(refundTarget.totalAmount)} was charged for {refundTarget.courseName}, {refundTarget.teeDate}{refundTarget.refundedTotal > 0 ? ` · ${fmtMoney(refundTarget.refundedTotal)} already refunded` : ''}. It goes back to the card they paid with; the course&apos;s payout and GreenReserve&apos;s fee are both reduced.
            </p>
            <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Amount (blank = {fmtMoney(remaining)}, the rest)</label>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
              <input type="number" step="0.01" min="0.01" max={remaining} value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder={remaining.toFixed(2)} className={iCls + ' w-full pl-7'} />
            </div>
            <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Reason — the golfer reads this</label>
            <textarea value={refundReason} onChange={e => setRefundReason(e.target.value)} rows={3} placeholder="Charged twice by mistake — refunding the duplicate." className={iCls + ' w-full resize-none mb-3'} />
            {modalError && <p className="text-xs text-bad mb-3">{modalError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setRefundTarget(null)} disabled={!!busy} className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={submitRefund} disabled={!!busy} className="flex-1 bg-bad hover:bg-bad/90 text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors">{busy ? 'Refunding…' : refundAmount.trim() ? `Refund $${Number(refundAmount || 0).toFixed(2)}` : `Refund ${fmtMoney(remaining)}`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GolfersPage() {
  return (
    <Suspense>
      <GolfersInner/>
    </Suspense>
  );
}
