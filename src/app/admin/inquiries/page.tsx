'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, Search, Trash2 } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

interface InquiryStatusEvent {
  id: string; fromStatus: string; toStatus: string;
  trigger: 'system' | 'admin'; actorName: string | null; createdAt: string;
}
interface Inquiry {
  id: string; contactName: string; contactTitle: string; email: string; phone: string;
  courseName: string; address: string; city: string; state: string; zipCode: string;
  website: string; courseType: string; currentBookingMethod: string; teeTimesPerDay: number | null;
  greenFeeRange: string; hasResidentPricing: boolean; hasMemberPricing: boolean;
  hasCaddies: boolean; pricingNotes: string; lookingFor: string[]; additionalNotes: string;
  status: string; adminNotes: string; builtCourseId: string | null; createdAt: string;
  updatedAt?: string;
  detailsToken?: string | null; detailsJson?: string; needsJson?: string;
  events: InquiryStatusEvent[];
}

const STATUS_DOT_MAP: Record<string, string> = {
  pending: 'warn', in_review: 'neutral', details_requested: 'neutral',
  details_submitted: 'neutral', building: 'warn', live: 'ok', rejected: 'bad', archived: 'neutral',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', in_review: 'In Review', details_requested: 'Sheet Sent',
  details_submitted: 'Sheet In', building: 'Building', live: 'Live', rejected: 'Rejected',
  archived: 'Archived',
};

const ACTIVE_CHIPS = [
  { key: 'your_move', label: 'Your move', statuses: ['details_submitted'], pine: true },
  { key: 'new', label: 'New', statuses: ['pending'], pine: false },
  { key: 'in_review', label: 'In review', statuses: ['in_review'], pine: false },
  { key: 'waiting', label: 'Waiting on them', statuses: ['details_requested'], pine: false },
  { key: 'building', label: 'Building', statuses: ['building'], pine: false },
];

const ACTIVE_STATUSES = new Set(['pending', 'in_review', 'details_requested', 'details_submitted', 'building']);
const ARCHIVED_STATUSES = new Set(['live', 'rejected', 'archived']);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function daysAgo(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)); }

function whyArchived(inq: Inquiry): { reason: string; date: string } {
  if (inq.status === 'live') return { reason: 'Went live', date: inq.updatedAt || inq.createdAt };
  if (inq.status === 'rejected') return { reason: 'Rejected', date: inq.updatedAt || inq.createdAt };
  const lastEvent = inq.events.length > 0 ? inq.events[inq.events.length - 1] : null;
  const actorName = lastEvent?.actorName || '';
  if (actorName.toLowerCase().includes('permanently deleted')) return { reason: 'Course deleted', date: lastEvent?.createdAt || inq.updatedAt || inq.createdAt };
  if (actorName.toLowerCase().includes('archived')) return { reason: 'Course archived', date: lastEvent?.createdAt || inq.updatedAt || inq.createdAt };
  return { reason: 'Archived', date: inq.updatedAt || inq.createdAt };
}

function InquiriesListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [adminReady, setAdminReady] = useState(false);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>(
    (searchParams.get('tab') as 'active' | 'archived') || 'active'
  );
  const [activeChips, setActiveChips] = useState<Set<string>>(
    new Set(['your_move', 'new', 'in_review', 'waiting', 'building'])
  );
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'newest');
  const [backfillRan, setBackfillRan] = useState(false);

  const H = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  const loadInquiries = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/admin/inquiries', { headers: H() });
    if (r.ok) setInquiries(await r.json());
    setLoading(false);
  }, [H]);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login'); return; }
      setAdminReady(true);
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    if (adminReady) loadInquiries();
  }, [adminReady, loadInquiries]);

  // One-time backfill: fix orphaned inquiries the first time Archived tab is opened
  useEffect(() => {
    if (activeTab !== 'archived' || backfillRan || !adminReady) return;
    setBackfillRan(true);
    fetch('/api/admin/backfill-orphaned-inquiries', { method: 'POST', headers: H() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.fixed > 0) loadInquiries(); })
      .catch(() => {});
  }, [activeTab, backfillRan, adminReady, H, loadInquiries]);

  async function deleteInquiry(id: string, name: string) {
    if (!confirm(`Permanently delete inquiry for "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/inquiries?id=${id}`, { method: 'DELETE', headers: H() });
    setInquiries(prev => prev.filter(i => i.id !== id));
  }

  function navToDetail(inq: Inquiry) {
    const p = new URLSearchParams();
    p.set('tab', activeTab);
    if (search) p.set('q', search);
    if (sortBy !== 'newest') p.set('sort', sortBy);
    router.push(`/admin/inquiries/${inq.id}?${p.toString()}`);
  }

  // Filter + sort
  const activePool = inquiries.filter(i => ACTIVE_STATUSES.has(i.status));
  const archivedPool = inquiries.filter(i => ARCHIVED_STATUSES.has(i.status));
  const activeStatuses = new Set(ACTIVE_CHIPS.filter(c => activeChips.has(c.key)).flatMap(c => c.statuses));
  const q = search.toLowerCase().trim();
  const matchesSearch = (inq: Inquiry) => !q || (
    inq.courseName.toLowerCase().includes(q) ||
    inq.contactName.toLowerCase().includes(q) ||
    inq.email.toLowerCase().includes(q) ||
    inq.city.toLowerCase().includes(q)
  );
  const sortFn = (a: Inquiry, b: Inquiry) => {
    if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sortBy === 'name') return a.courseName.localeCompare(b.courseName);
    if (sortBy === 'longest_stage') return new Date(a.updatedAt || a.createdAt).getTime() - new Date(b.updatedAt || b.createdAt).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };
  let filteredActive = [...activePool.filter(i => {
    if (activeStatuses.size > 0 && !activeStatuses.has(i.status)) return false;
    return matchesSearch(i);
  })].sort(sortFn);
  let filteredArchived = [...archivedPool.filter(matchesSearch)].sort(sortFn);
  const displayed = activeTab === 'active' ? filteredActive : filteredArchived;

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="inquiries" />
      <div className="ml-56 flex-1 flex flex-col min-h-screen">
        <div className="px-8 py-7 max-w-5xl">

          {/* Page header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Inquiries</h1>
              <p className="text-sm text-ink-soft mt-0.5">{displayed.length} shown</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="bg-white border border-line text-ink text-sm rounded-md pl-8 pr-3 py-2 outline-none focus:border-pine/40 w-44 placeholder-ink-faint"
                />
              </div>
              <button
                onClick={loadInquiries}
                className="flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-line transition-colors"
              >
                <RefreshCw className="w-4 h-4" />Refresh
              </button>
            </div>
          </div>

          {/* Active / Archived tab toggle */}
          <div className="flex items-center gap-1 mb-5 border-b border-line">
            {(['active', 'archived'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={
                  'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ' + (
                    activeTab === tab
                      ? 'border-pine text-pine'
                      : 'border-transparent text-ink-muted hover:text-ink'
                  )
                }
              >
                {tab === 'active' ? 'Active' : 'Archived'}
                <span className={'ml-1.5 text-[10px] font-medium ' + (activeTab === tab ? 'text-pine/70' : 'text-ink-faint')}>
                  {tab === 'active' ? activePool.length : archivedPool.length}
                </span>
              </button>
            ))}
          </div>

          {/* Active tab: filter chips + sort */}
          {activeTab === 'active' && (
            <div className="flex items-center gap-2 flex-wrap mb-5">
              {ACTIVE_CHIPS.map(chip => {
                const on = activeChips.has(chip.key);
                const count = activePool.filter(i => chip.statuses.includes(i.status)).length;
                return (
                  <button
                    key={chip.key}
                    onClick={() => setActiveChips(prev => {
                      const n = new Set(prev);
                      if (n.has(chip.key)) n.delete(chip.key); else n.add(chip.key);
                      return n;
                    })}
                    className={
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors ' + (
                        on && chip.pine
                          ? 'bg-pine/10 text-pine border-pine/30'
                          : on
                          ? 'bg-ink/5 text-ink border-ink/20'
                          : 'text-ink-muted border-line hover:border-line-strong hover:text-ink'
                      )
                    }
                  >
                    {chip.label}
                    {count > 0 && (
                      <span className={'rounded-full w-4 h-4 flex items-center justify-center text-[10px] ' + (on && chip.pine ? 'bg-pine/20 text-pine' : 'bg-line-strong text-ink-muted')}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="ml-auto">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="bg-white border border-line text-ink-soft text-xs rounded-md px-3 py-1.5 outline-none focus:border-pine/40 cursor-pointer"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name A–Z</option>
                  <option value="longest_stage">Longest in stage</option>
                </select>
              </div>
            </div>
          )}

          {/* Archived tab: sort only */}
          {activeTab === 'archived' && (
            <div className="flex items-center justify-end mb-5">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-white border border-line text-ink-soft text-xs rounded-md px-3 py-1.5 outline-none focus:border-pine/40 cursor-pointer"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
          )}

          {/* List */}
          {loading && <div className="py-20 text-center text-ink-muted text-sm">Loading...</div>}
          {!loading && displayed.length === 0 && (
            <div className="py-20 text-center text-ink-muted text-sm">
              {activeTab === 'archived' ? 'No archived inquiries' : 'No inquiries match your filters'}
            </div>
          )}

          {/* Active tab rows */}
          {activeTab === 'active' && (
            <div className="space-y-1.5">
              {filteredActive.map(inq => {
                const days = daysAgo(inq.updatedAt || inq.createdAt);
                const stale = days > 7;
                const dot = STATUS_DOT_MAP[inq.status] || 'neutral';
                return (
                  <div
                    key={inq.id}
                    onClick={() => navToDetail(inq)}
                    className="bg-white border border-line rounded-lg px-5 py-3.5 flex items-center gap-4 cursor-pointer hover:border-pine/30 hover:bg-pine/[0.02] transition-colors"
                  >
                    <StatusDot status={dot as 'ok' | 'bad' | 'warn' | 'neutral'} />
                    <div className="w-44 shrink-0">
                      <div className="text-sm font-medium text-ink truncate">{inq.courseName}</div>
                      <div className="text-xs text-ink-muted truncate">{inq.city}, {inq.state}</div>
                    </div>
                    <div className="flex-1 min-w-0 hidden md:block">
                      <div className="text-xs text-ink-soft truncate">
                        {inq.contactName}{inq.contactTitle ? ' · ' + inq.contactTitle : ''}
                      </div>
                      {inq.lookingFor && inq.lookingFor.length > 0 && (
                        <div className="text-[10px] text-ink-faint truncate">{inq.lookingFor.slice(0, 3).join(' · ')}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right hidden lg:block min-w-[90px]">
                      <div className="text-xs text-ink-soft">{STATUS_LABEL[inq.status] || inq.status}</div>
                      <div className={'text-[10px] font-medium ' + (stale ? 'text-bad' : 'text-ink-faint')}>{days}d in stage</div>
                    </div>
                    <div className="shrink-0 text-xs text-ink-faint hidden xl:block w-24 text-right">
                      {fmtDate(inq.createdAt)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Archived tab rows */}
          {activeTab === 'archived' && (
            <div className="bg-white border border-line rounded-lg overflow-hidden">
              {filteredArchived.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-paper">
                      <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Course</th>
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium hidden md:table-cell">Contact</th>
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium">Status</th>
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium hidden lg:table-cell">Why archived</th>
                      <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-[0.06em] text-ink-muted font-medium hidden xl:table-cell">Submitted</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArchived.map((inq, i) => {
                      const dot = STATUS_DOT_MAP[inq.status] || 'neutral';
                      const { reason, date } = whyArchived(inq);
                      return (
                        <tr
                          key={inq.id}
                          onClick={() => navToDetail(inq)}
                          className={
                            'cursor-pointer transition-colors border-b border-line last:border-b-0 hover:bg-pine/[0.02] ' +
                            (i % 2 === 0 ? 'bg-white' : 'bg-paper/50')
                          }
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <StatusDot status={dot as 'ok' | 'bad' | 'warn' | 'neutral'} />
                              <div>
                                <div className="text-sm font-medium text-ink">{inq.courseName}</div>
                                <div className="text-xs text-ink-muted">{inq.city}, {inq.state}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 hidden md:table-cell">
                            <div className="text-xs text-ink-soft">{inq.contactName}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-xs text-ink-soft">{STATUS_LABEL[inq.status] || inq.status}</span>
                          </td>
                          <td className="px-3 py-3 hidden lg:table-cell">
                            <div className="text-xs font-medium text-ink-soft">{reason}</div>
                            <div className="text-[10px] text-ink-faint">{fmtDate(date)}</div>
                          </td>
                          <td className="px-3 py-3 hidden xl:table-cell">
                            <span className="text-xs text-ink-faint">{fmtDate(inq.createdAt)}</span>
                          </td>
                          <td className="px-2 py-3">
                            <button
                              onClick={e => { e.stopPropagation(); deleteInquiry(inq.id, inq.courseName); }}
                              className="w-7 h-7 flex items-center justify-center rounded text-ink-faint hover:text-bad hover:bg-bad/5 transition-colors"
                              title="Delete permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InquiriesPage() {
  return (
    <Suspense fallback={null}>
      <InquiriesListInner />
    </Suspense>
  );
}
