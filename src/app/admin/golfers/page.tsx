'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, User, ArrowLeft, ExternalLink, Send, AlertTriangle, ChevronRight } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_URL ?? '');

const fmtMoney = (n: number) => `$${n.toFixed(2)}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

interface GolferSummary {
  id: string; email: string; name: string; phone: string;
  bookingCount: number; createdAt: string;
}
interface GuestBooking {
  id: string; golferName: string; golferEmail: string; golferPhone: string;
  players: number; totalAmount: number; status: string; createdAt: string;
  courseName: string; courseId: string; teeDate: string; teeTime: string;
}
interface BookingDetail {
  id: string; status: string; paymentStatus: string;
  players: number; totalAmount: number; accessFeeTotal: number;
  greenFeeTotal: number; cancellationFeeTotal: number;
  checkedInAt: string | null; cancelledAt: string | null;
  checkInFailReason: string; checkInToken: string | null;
  createdAt: string; courseName: string; courseId: string;
  teeDate: string; teeTime: string; holes: number;
}
interface GolferDetail {
  id: string; email: string; firstName: string; lastName: string;
  phone: string; createdAt: string;
  bookings: BookingDetail[];
}

function bookingStatusDot(b: BookingDetail): 'ok' | 'bad' | 'warn' | 'neutral' {
  if (b.status === 'cancelled') return 'bad';
  if (b.status === 'completed') return 'ok';
  if (b.checkInFailReason) return 'warn';
  return 'neutral';
}
function bookingStatusLabel(b: BookingDetail) {
  if (b.status === 'cancelled') return b.cancellationFeeTotal > 0 ? 'Cancelled (fee charged)' : 'Cancelled';
  if (b.status === 'completed') return 'Checked in';
  if (b.checkInFailReason) return 'Charge failed';
  return 'Confirmed';
}

function GolfersInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('id') ?? '';

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [golfers, setGolfers] = useState<GolferSummary[]>([]);
  const [guestBookings, setGuestBookings] = useState<GuestBooking[]>([]);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);

  const [detail, setDetail] = useState<GolferDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [resendState, setResendState] = useState<Record<string, 'idle' | 'pending' | 'ok' | 'error'>>({});

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authAndSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setGolfers([]); setGuestBookings([]); setSearched(false); return; }
    setSearching(true);
    setSearchError('');
    try {
      const sRes = await fetch('/api/admin/session');
      if (!sRes.ok) { router.push('/admin/login'); return; }
      const res = await fetch(`/api/admin/golfers?q=${encodeURIComponent(q)}`);
      if (res.status === 403) { setSearchError('This page requires elevated permissions.'); setSearching(false); return; }
      if (!res.ok) { setSearchError('Search failed — try again.'); setSearching(false); return; }
      const d = await res.json();
      setGolfers(d.golfers ?? []);
      setGuestBookings(d.guestBookings ?? []);
      setSearched(true);
    } catch { setSearchError('Network error.'); }
    setSearching(false);
  }, [router]);

  function handleQueryChange(v: string) {
    setQuery(v);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => authAndSearch(v), 350);
  }

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      const res = await fetch(`/api/admin/golfers?id=${id}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); setDetailError(e.error || 'Failed to load golfer'); setDetailLoading(false); return; }
      const d = await res.json();
      setDetail(d.golfer);
    } catch { setDetailError('Network error — try again.'); }
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  function selectGolfer(id: string) {
    const p = new URLSearchParams(searchParams.toString());
    p.set('id', id);
    router.push(`/admin/golfers?${p}`);
  }

  function clearDetail() {
    const p = new URLSearchParams(searchParams.toString());
    p.delete('id');
    router.push(`/admin/golfers?${p}`);
  }

  async function resendConfirmation(bookingId: string) {
    setResendState(s => ({ ...s, [bookingId]: 'pending' }));
    try {
      const res = await fetch('/api/admin/golfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, action: 'resend_confirmation' }),
      });
      if (!res.ok) { setResendState(s => ({ ...s, [bookingId]: 'error' })); return; }
      setResendState(s => ({ ...s, [bookingId]: 'ok' }));
    } catch { setResendState(s => ({ ...s, [bookingId]: 'error' })); }
  }

  const iCls = 'bg-paper border border-line rounded-md px-3 py-2.5 text-ink text-sm placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="golfers"/>
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7">
          {/* Header */}
          <div className="mb-6">
            <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">Support</p>
            <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Golfer lookup</h1>
          </div>

          {/* Detail view */}
          {selectedId ? (
            <div>
              <button
                onClick={clearDetail}
                className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors mb-5"
              >
                <ArrowLeft className="w-4 h-4"/>Back to search
              </button>

              {detailLoading && <div className="py-16 text-center text-ink-muted text-sm">Loading…</div>}
              {detailError && (
                <div className="bg-bad/5 border border-bad/20 rounded-lg px-4 py-3 text-sm text-bad flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0"/>{detailError}
                  <button onClick={() => loadDetail(selectedId)} className="ml-auto underline">Retry</button>
                </div>
              )}
              {detail && (
                <div>
                  {/* Golfer card */}
                  <div className="bg-white border border-line rounded-lg p-5 mb-5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-pine/10 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-pine"/>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-ink text-base">{detail.firstName} {detail.lastName}</div>
                        <div className="text-sm text-ink-soft mt-0.5">{detail.email}</div>
                        {detail.phone && <div className="text-sm text-ink-muted mt-0.5">{detail.phone}</div>}
                      </div>
                      <div className="text-right text-xs text-ink-muted">
                        <div>Account created</div>
                        <div className="font-medium text-ink-soft mt-0.5">{fmtDate(detail.createdAt)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-4 pt-4 border-t border-line-soft text-sm text-ink-muted">
                      <span>{detail.bookings.length} booking{detail.bookings.length !== 1 ? 's' : ''} total</span>
                      <span>·</span>
                      <span>{fmtMoney(detail.bookings.reduce((s, b) => s + (b.status === 'completed' ? b.totalAmount : 0), 0))} charged</span>
                    </div>
                  </div>

                  {/* Bookings */}
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Bookings</div>
                  {detail.bookings.length === 0 ? (
                    <div className="bg-white border border-line rounded-lg py-12 text-center text-ink-muted text-sm">No bookings</div>
                  ) : (
                    <div className="space-y-2">
                      {detail.bookings.map(b => {
                        const st = resendState[b.id] ?? 'idle';
                        const receiptUrl = b.checkInToken
                          ? `${BASE_URL}/receipt/${b.id}?token=${b.checkInToken}`
                          : null;
                        return (
                          <div key={b.id} className="bg-white border border-line rounded-lg px-5 py-4">
                            <div className="flex items-start gap-3">
                              <div className="pt-0.5">
                                <StatusDot status={bookingStatusDot(b)} label={bookingStatusLabel(b)}/>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-medium text-sm text-ink">{b.courseName}</span>
                                  <span className="text-ink-faint text-[11px]">·</span>
                                  <span className="text-xs text-ink-muted">{b.teeDate} at {b.teeTime}</span>
                                  <span className="text-ink-faint text-[11px]">·</span>
                                  <span className="text-xs text-ink-muted">{b.players}p · {b.holes}h</span>
                                </div>
                                <div className="text-[11px] text-ink-muted">{bookingStatusLabel(b)}</div>
                                {b.checkInFailReason && (
                                  <div className="text-[11px] text-bad mt-0.5">{b.checkInFailReason}</div>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-medium text-ink tabular-nums mb-2">
                                  {fmtMoney(b.totalAmount)}
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                  {receiptUrl && (
                                    <a
                                      href={receiptUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-1 text-[11px] text-pine hover:text-pine-hover underline"
                                    >
                                      Receipt<ExternalLink className="w-3 h-3"/>
                                    </a>
                                  )}
                                  <a
                                    href={`/admin/courses/${b.courseId}`}
                                    className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink underline"
                                  >
                                    Course<ExternalLink className="w-3 h-3"/>
                                  </a>
                                </div>
                              </div>
                            </div>
                            {/* Resend action */}
                            <div className="flex justify-end mt-3 pt-3 border-t border-line-soft">
                              <button
                                onClick={() => resendConfirmation(b.id)}
                                disabled={st === 'pending' || st === 'ok'}
                                className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors px-3 py-1.5 rounded-md border ${
                                  st === 'ok'
                                    ? 'border-ok/20 bg-ok/5 text-ok cursor-default'
                                    : st === 'error'
                                    ? 'border-bad/20 bg-bad/5 text-bad hover:bg-bad/10'
                                    : 'border-line hover:border-line-strong text-ink-muted hover:text-ink'
                                }`}
                              >
                                <Send className="w-3 h-3"/>
                                {st === 'pending' ? 'Sending…' : st === 'ok' ? 'Sent' : st === 'error' ? 'Failed — retry' : 'Resend confirmation'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Search view */
            <div>
              {/* Search box */}
              <div className="relative mb-6 max-w-lg">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none"/>
                <input
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  placeholder="Search by email, name, or phone…"
                  className={iCls + ' pl-10 w-full'}
                  autoFocus
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted">Searching…</div>
                )}
              </div>

              {searchError && (
                <div className="bg-bad/5 border border-bad/20 rounded-lg px-4 py-3 text-sm text-bad mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0"/>{searchError}
                </div>
              )}

              {/* Results */}
              {searched && !searching && (
                <>
                  {golfers.length === 0 && guestBookings.length === 0 ? (
                    <div className="py-16 text-center text-ink-muted text-sm bg-white border border-line rounded-lg">
                      No golfers found for &ldquo;{query}&rdquo;
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {/* Registered golfers */}
                      {golfers.length > 0 && (
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">
                            Golfer accounts ({golfers.length})
                          </div>
                          <div className="bg-white border border-line rounded-lg divide-y divide-line-soft overflow-hidden">
                            {golfers.map(g => (
                              <button
                                key={g.id}
                                onClick={() => selectGolfer(g.id)}
                                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-paper/60 transition-colors text-left"
                              >
                                <div className="w-8 h-8 rounded-full bg-pine/10 flex items-center justify-center shrink-0">
                                  <User className="w-4 h-4 text-pine"/>
                                </div>
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

                      {/* Guest bookings */}
                      {guestBookings.length > 0 && (
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">
                            Guest bookings — no account ({guestBookings.length})
                          </div>
                          <div className="bg-white border border-line rounded-lg divide-y divide-line-soft overflow-hidden">
                            {guestBookings.map(b => (
                              <div key={b.id} className="px-5 py-3.5 flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm text-ink">{b.golferName}</div>
                                  <div className="text-xs text-ink-muted mt-0.5">{b.golferEmail}{b.golferPhone ? ` · ${b.golferPhone}` : ''}</div>
                                  <div className="text-xs text-ink-faint mt-0.5">{b.courseName} · {b.teeDate} at {b.teeTime}</div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-sm font-medium text-ink tabular-nums">{fmtMoney(b.totalAmount)}</div>
                                  <div className="text-xs text-ink-muted mt-0.5">{fmtDate(b.createdAt)}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
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
