'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, Search, Trash2 } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { EmptyState } from '@/components/EmptyState';

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

const TABS = [
  { key: 'your-move', label: 'Your move', statuses: ['details_submitted', 'building'], description: 'Inquiries waiting on your action — sheet received or currently building.' },
  { key: 'new', label: 'New', statuses: ['pending'], description: 'Just submitted — not yet reviewed.' },
  { key: 'in-review', label: 'In review', statuses: ['in_review'], description: "You're evaluating these." },
  { key: 'waiting', label: 'Waiting on them', statuses: ['details_requested'], description: 'Setup sheet sent — waiting on the course.' },
  { key: 'building', label: 'Building', statuses: ['building'], description: 'Draft created — being built/reviewed before go-live.' },
  { key: 'live', label: 'Live', statuses: ['live'], description: 'Converted wins — successfully launched.' },
  { key: 'all', label: 'All', statuses: ['pending', 'in_review', 'details_requested', 'details_submitted', 'building', 'live', 'rejected', 'archived'], description: 'Every inquiry, every stage — including live and archived.' },
  { key: 'archived', label: 'Archived', statuses: ['rejected', 'archived'], description: 'Rejected or closed — kept for records.' },
];

const STATUS_DOT_MAP: Record<string, string> = {
  pending: 'warn', in_review: 'neutral', details_requested: 'neutral',
  details_submitted: 'neutral', building: 'warn', live: 'ok', rejected: 'bad', archived: 'neutral',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', in_review: 'In Review', details_requested: 'Sheet Sent',
  details_submitted: 'Sheet In', building: 'Building', live: 'Live', rejected: 'Rejected',
  archived: 'Archived',
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function daysAgo(d: string) { return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24))); }

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
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'newest');
  const [backfillRan, setBackfillRan] = useState(false);

  const rawTabParam = searchParams.get('tab') || '';
  const [activeTabKey, setActiveTabKey] = useState(
    TABS.find(t => t.key === rawTabParam) ? rawTabParam : 'your-move'
  );

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

  // One-time backfill on first visit to Archived tab
  useEffect(() => {
    if (activeTabKey !== 'archived' || backfillRan || !adminReady) return;
    setBackfillRan(true);
    fetch('/api/admin/backfill-orphaned-inquiries', { method: 'POST', headers: H() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.fixed > 0) loadInquiries(); })
      .catch(() => {});
  }, [activeTabKey, backfillRan, adminReady, H, loadInquiries]);

  async function deleteInquiry(id: string, name: string) {
    if (!confirm('Permanently delete inquiry for "' + name + '"? This cannot be undone.')) return;
    await fetch('/api/admin/inquiries?id=' + id, { method: 'DELETE', headers: H() });
    setInquiries(prev => prev.filter(i => i.id !== id));
  }

  function navToDetail(inq: Inquiry) {
    const p = new URLSearchParams();
    p.set('tab', activeTabKey);
    if (search) p.set('q', search);
    if (sortBy !== 'newest') p.set('sort', sortBy);
    router.push('/admin/inquiries/' + inq.id + '?' + p.toString());
  }

  function switchTab(key: string) {
    setActiveTabKey(key);
    // Sync tab into URL without full navigation so refresh restores it
    const p = new URLSearchParams(window.location.search);
    p.set('tab', key);
    if (!search) p.delete('q'); else p.set('q', search);
    if (sortBy === 'newest') p.delete('sort'); else p.set('sort', sortBy);
    window.history.replaceState(null, '', '/admin/inquiries?' + p.toString());
  }

  const currentTab = TABS.find(t => t.key === activeTabKey) || TABS[0];

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

  const filtered = inquiries
    .filter(i => currentTab.statuses.includes(i.status) && matchesSearch(i))
    .sort(sortFn);

  const countFor = (tab: typeof TABS[number]) => inquiries.filter(i => tab.statuses.includes(i.status)).length;

  const yourMoveTab = TABS.find(t => t.key === 'your-move')!;
  const activeStatuses = ['pending', 'in_review', 'details_requested', 'details_submitted', 'building'];
  const activeCount = inquiries.filter(i => activeStatuses.includes(i.status)).length;
  const needsYouCount = countFor(yourMoveTab);
  const liveAllTimeCount = inquiries.filter(i => i.status === 'live').length;

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="inquiries" />
      <div className="admin-content flex-1 flex flex-col min-h-screen">
        <div className="px-8 py-7">

          {/* Row 1: title + pipeline summary, search + refresh */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Inquiries</h1>
              <p className="text-sm text-ink-soft mt-0.5">
                {activeCount} active · {needsYouCount} needs you · {liveAllTimeCount} live all-time
              </p>
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

          {/* Row 2: tabs (with counts) + sort, same row */}
          <div className="flex items-center justify-between gap-4 border-b border-line mb-5">
            <div className="flex gap-0 -mb-px overflow-x-auto">
              {TABS.map(tab => {
                const count = countFor(tab);
                const active = tab.key === activeTabKey;
                return (
                  <button
                    key={tab.key}
                    onClick={() => switchTab(tab.key)}
                    title={tab.description}
                    className={
                      'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ' + (
                        active
                          ? 'border-pine text-pine'
                          : 'border-transparent text-ink-muted hover:text-ink'
                      )
                    }
                  >
                    {tab.label}
                    <span className={
                      'text-[10px] font-medium rounded-full px-1.5 py-0.5 min-w-[18px] text-center ' + (
                        active
                          ? 'bg-pine/15 text-pine'
                          : count > 0 ? 'bg-line-strong text-ink-muted' : 'text-ink-faint'
                      )
                    }>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-white border border-line text-ink-soft text-xs rounded-md px-3 py-1.5 mb-2 outline-none focus:border-pine/40 cursor-pointer shrink-0"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
              <option value="longest_stage">Longest in stage</option>
            </select>
          </div>

          {/* List */}
          {loading && <div className="py-20 text-center text-ink-muted text-sm">Loading...</div>}
          {!loading && filtered.length === 0 && (
            <EmptyState message={q ? 'No results — clear your search' : currentTab.description} />
          )}

          {!loading && filtered.length > 0 && (
            <div className="space-y-1.5">
              {filtered.map(inq => {
                const isArchived = currentTab.key === 'archived';
                const dot = (STATUS_DOT_MAP[inq.status] || 'neutral') as 'ok' | 'bad' | 'warn' | 'neutral';
                const days = daysAgo(inq.updatedAt || inq.createdAt);
                const stale = !isArchived && days > 7;
                const archived = isArchived ? whyArchived(inq) : null;

                return (
                  <div
                    key={inq.id}
                    onClick={() => navToDetail(inq)}
                    className="bg-white border border-line rounded-lg px-5 py-3.5 flex items-center gap-4 cursor-pointer hover:border-pine/30 hover:bg-pine/[0.02] transition-colors"
                  >
                    <StatusDot status={dot} />

                    {/* Course name + location */}
                    <div className="w-44 shrink-0 min-w-0">
                      <div className="text-sm font-medium text-ink truncate">{inq.courseName}</div>
                      <div className="text-xs text-ink-muted truncate">{inq.city}, {inq.state}</div>
                    </div>

                    {/* Contact */}
                    <div className="flex-1 min-w-0 hidden md:block">
                      <div className="text-xs text-ink-soft truncate">
                        {inq.contactName}{inq.contactTitle ? ' · ' + inq.contactTitle : ''}
                      </div>
                      <div className="text-[10px] text-ink-faint truncate">{inq.email}</div>
                    </div>

                    {/* Stage + days-in-stage */}
                    <div className="shrink-0 text-right hidden lg:block min-w-[110px]">
                      {isArchived && archived ? (
                        <>
                          <div className="text-xs text-ink-soft">{archived.reason}</div>
                          <div className="text-[10px] text-ink-faint">{fmtDate(archived.date)}</div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs text-ink-soft">{STATUS_LABEL[inq.status] || inq.status}</div>
                          <div className={'text-[10px] font-medium ' + (stale ? 'text-bad' : 'text-ink-faint')}>{days}d in stage</div>
                        </>
                      )}
                    </div>

                    {/* Submitted date */}
                    <div className="shrink-0 text-xs text-ink-faint hidden xl:block w-24 text-right">
                      {fmtDate(inq.createdAt)}
                    </div>

                    {/* Archived: delete button */}
                    {isArchived && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteInquiry(inq.id, inq.courseName); }}
                        className="w-7 h-7 flex items-center justify-center rounded text-ink-faint hover:text-bad hover:bg-bad/5 transition-colors shrink-0"
                        title="Delete permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
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
