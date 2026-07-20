'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, Search, Trash2, ChevronRight } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { EmptyState } from '@/components/EmptyState';

interface InquiryStatusEvent {
  id: string; fromStatus: string; toStatus: string;
  trigger: 'system' | 'admin' | 'course'; actorName: string | null; createdAt: string;
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

// A-02b: the tab row splits into a connected pipeline funnel (how an inquiry
// actually flows left to right) and a separate "lenses" group (cross-cutting
// views that aren't a pipeline stage).
const PIPELINE_KEYS = ['new', 'in-review', 'waiting', 'building', 'live'];
const LENS_KEYS = ['your-move', 'all', 'archived'];

// Work tabs default to longest-in-stage first — it's a queue, oldest overdue
// should scream first. Informational tabs (Live/All/Archived) default newest.
const DEFAULT_SORT_BY_TAB: Record<string, string> = {
  'your-move': 'longest_stage', 'new': 'longest_stage', 'in-review': 'longest_stage',
  'waiting': 'longest_stage', 'building': 'longest_stage',
  'live': 'newest', 'all': 'newest', 'archived': 'newest',
};
const SORT_LS_KEY = 'admin-inquiries-sort-by-tab';
const PAGE_SIZE = 50;

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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasBadEmail = (inq: Inquiry) => !!inq.email && !EMAIL_RE.test(inq.email.trim());

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
  const [backfillRan, setBackfillRan] = useState(false);
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterCourseType, setFilterCourseType] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterAgeBucket, setFilterAgeBucket] = useState('');
  const [filterBadDataOnly, setFilterBadDataOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPreview, setBulkPreview] = useState<{ kind: 'send_sheet' | 'archive'; ids: string[] } | null>(null);
  const [bulkConfirmText, setBulkConfirmText] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState('');

  const rawTabParam = searchParams.get('tab') || '';
  const [activeTabKey, setActiveTabKey] = useState(
    TABS.find(t => t.key === rawTabParam) ? rawTabParam : 'your-move'
  );

  const [sortByTab, setSortByTab] = useState<Record<string, string>>(() => {
    let stored: Record<string, string> = {};
    if (typeof window !== 'undefined') {
      try { stored = JSON.parse(localStorage.getItem(SORT_LS_KEY) || '{}'); } catch { /* ignore */ }
    }
    const merged = { ...DEFAULT_SORT_BY_TAB, ...stored };
    const urlSort = searchParams.get('sort');
    if (urlSort) merged[activeTabKey] = urlSort;
    return merged;
  });
  const sortBy = sortByTab[activeTabKey] ?? DEFAULT_SORT_BY_TAB[activeTabKey] ?? 'newest';
  function setSortForActiveTab(val: string) {
    setSortByTab(prev => {
      const next = { ...prev, [activeTabKey]: val };
      try { localStorage.setItem(SORT_LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    const p = new URLSearchParams(window.location.search);
    if (val === DEFAULT_SORT_BY_TAB[activeTabKey]) p.delete('sort'); else p.set('sort', val);
    window.history.replaceState(null, '', '/admin/inquiries?' + p.toString());
  }

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

  function detailHref(inq: Inquiry) {
    const p = new URLSearchParams();
    p.set('tab', activeTabKey);
    if (search) p.set('q', search);
    if (sortBy !== (DEFAULT_SORT_BY_TAB[activeTabKey] ?? 'newest')) p.set('sort', sortBy);
    return '/admin/inquiries/' + inq.id + '?' + p.toString();
  }

  function switchTab(key: string) {
    setActiveTabKey(key);
    // Sync tab into URL without full navigation so refresh restores it
    const p = new URLSearchParams(window.location.search);
    p.set('tab', key);
    if (!search) p.delete('q'); else p.set('q', search);
    const tabSort = sortByTab[key] ?? DEFAULT_SORT_BY_TAB[key] ?? 'newest';
    if (tabSort === DEFAULT_SORT_BY_TAB[key]) p.delete('sort'); else p.set('sort', tabSort);
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

  const matchesFilters = (inq: Inquiry) => {
    if (filterCourseType && inq.courseType !== filterCourseType) return false;
    if (filterState && inq.state.toUpperCase() !== filterState.toUpperCase()) return false;
    if (filterAgeBucket) {
      const days = daysAgo(inq.updatedAt || inq.createdAt);
      if (days <= Number(filterAgeBucket)) return false;
    }
    if (filterBadDataOnly && !hasBadEmail(inq)) return false;
    return true;
  };

  const filtered = inquiries
    .filter(i => currentTab.statuses.includes(i.status) && matchesSearch(i) && matchesFilters(i))
    .sort(sortFn);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedInquiries = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const courseTypeOptions = Array.from(new Set(inquiries.map(i => i.courseType).filter(Boolean))).sort();

  useEffect(() => { setPage(0); }, [activeTabKey, q, filterCourseType, filterState, filterAgeBucket, filterBadDataOnly]);
  useEffect(() => { setSelected(new Set()); }, [activeTabKey]);

  const canBulkSelect = !['archived', 'live'].includes(activeTabKey);

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAllOnPage() {
    setSelected(prev => {
      const pageIds = pagedInquiries.map(i => i.id);
      const allSelected = pageIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
  }

  async function runBulkAction() {
    if (!bulkPreview) return;
    setBulkRunning(true);
    setBulkResult('');
    let ok = 0, failed = 0;
    for (const id of bulkPreview.ids) {
      try {
        const r = await fetch('/api/admin/inquiries', {
          method: 'POST', headers: H(),
          body: JSON.stringify(
            bulkPreview.kind === 'send_sheet'
              ? { id, action: 'request_details' }
              : { id, action: 'set_status', newStatus: 'rejected' }
          ),
        });
        if (r.ok) ok++; else failed++;
      } catch { failed++; }
    }
    setBulkRunning(false);
    setBulkResult(`${ok} succeeded${failed > 0 ? `, ${failed} failed` : ''}.`);
    setSelected(new Set());
    await loadInquiries();
  }

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

          {/* Row 2: pipeline funnel + lenses, then filters/sort below */}
          <div className="flex items-center justify-between gap-x-6 gap-y-2 flex-wrap border-b border-line pb-3 mb-3">
            {/* Pipeline — connected funnel, teaches how an inquiry flows */}
            <div className="flex items-center gap-0.5 flex-wrap">
              {PIPELINE_KEYS.map((key, i) => {
                const tab = TABS.find(t => t.key === key)!;
                const count = countFor(tab);
                const active = key === activeTabKey;
                return (
                  <div key={key} className="flex items-center">
                    <button
                      onClick={() => switchTab(key)}
                      title={tab.description}
                      className={
                        'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ' + (
                          active ? 'border-pine text-pine'
                          : count === 0 ? 'border-transparent text-ink-faint/60 hover:text-ink-muted'
                          : 'border-transparent text-ink-muted hover:text-ink'
                        )
                      }
                    >
                      {tab.label}
                      <span className={
                        'text-[10px] font-medium rounded-full px-1.5 py-0.5 min-w-[18px] text-center ' + (
                          active ? 'bg-pine/15 text-pine'
                          : count > 0 ? 'bg-line-strong text-ink-muted' : 'text-ink-faint'
                        )
                      }>
                        {count}
                      </span>
                    </button>
                    {i < PIPELINE_KEYS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-ink-faint shrink-0"/>}
                  </div>
                );
              })}
            </div>

            {/* Lenses — cross-cutting views, visually separated */}
            <div className="flex items-center gap-1 pl-4 border-l border-line-soft">
              {LENS_KEYS.map(key => {
                const tab = TABS.find(t => t.key === key)!;
                const count = countFor(tab);
                const active = key === activeTabKey;
                const yourMoveAlert = key === 'your-move' && count > 0;
                return (
                  <button
                    key={key}
                    onClick={() => switchTab(key)}
                    title={tab.description}
                    className={
                      'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ' + (
                        active ? 'border-pine text-pine' : 'border-transparent text-ink-muted hover:text-ink'
                      )
                    }
                  >
                    {tab.label}
                    <span className={
                      'text-[10px] font-medium rounded-full px-1.5 py-0.5 min-w-[18px] text-center ' + (
                        active ? 'bg-pine/15 text-pine'
                        : yourMoveAlert ? 'bg-warn/15 text-warn'
                        : count > 0 ? 'bg-line-strong text-ink-muted' : 'text-ink-faint'
                      )
                    }>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mb-4">
            <button
              onClick={() => setFiltersOpen(v => !v)}
              className={'text-xs font-medium rounded-md px-3 py-1.5 border transition-colors ' + (
                filtersOpen || filterCourseType || filterState || filterAgeBucket || filterBadDataOnly
                  ? 'border-pine/40 text-pine bg-pine/5'
                  : 'border-line text-ink-soft hover:text-ink bg-white'
              )}
            >
              Filters
            </button>
            <select
              value={sortBy}
              onChange={e => setSortForActiveTab(e.target.value)}
              className="bg-white border border-line text-ink-soft text-xs rounded-md px-3 py-1.5 outline-none focus:border-pine/40 cursor-pointer"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
              <option value="longest_stage">Longest in stage</option>
            </select>
          </div>

          {/* Collapsible filters row */}
          {filtersOpen && (
            <div className="flex items-center gap-3 flex-wrap bg-white border border-line rounded-lg px-4 py-3 mb-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-ink-muted">Course type</span>
                <select value={filterCourseType} onChange={e => setFilterCourseType(e.target.value)}
                  className="bg-paper border border-line rounded-md px-2 py-1 outline-none focus:border-pine/40 cursor-pointer">
                  <option value="">Any</option>
                  {courseTypeOptions.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-ink-muted">State</span>
                <input value={filterState} onChange={e => setFilterState(e.target.value.slice(0, 2))}
                  placeholder="Any" className="bg-paper border border-line rounded-md px-2 py-1 w-14 outline-none focus:border-pine/40 uppercase placeholder-ink-faint" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-ink-muted">Age</span>
                <select value={filterAgeBucket} onChange={e => setFilterAgeBucket(e.target.value)}
                  className="bg-paper border border-line rounded-md px-2 py-1 outline-none focus:border-pine/40 cursor-pointer">
                  <option value="">Any</option>
                  <option value="3">&gt;3 days</option>
                  <option value="7">&gt;7 days</option>
                  <option value="14">&gt;14 days</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={filterBadDataOnly} onChange={e => setFilterBadDataOnly(e.target.checked)} />
                <span className="text-ink-muted">Bad email only</span>
              </label>
              {(filterCourseType || filterState || filterAgeBucket || filterBadDataOnly) && (
                <button
                  onClick={() => { setFilterCourseType(''); setFilterState(''); setFilterAgeBucket(''); setFilterBadDataOnly(false); }}
                  className="text-ink-faint hover:text-ink transition-colors ml-1"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Status legend — dots are never the only signal */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center gap-4 mb-3 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1.5"><StatusDot status="ok"/>Live</span>
              <span className="flex items-center gap-1.5"><StatusDot status="warn"/>New / building</span>
              <span className="flex items-center gap-1.5"><StatusDot status="neutral"/>In progress</span>
              <span className="flex items-center gap-1.5"><StatusDot status="bad"/>Rejected</span>
            </div>
          )}

          {/* Bulk action bar */}
          {canBulkSelect && selected.size > 0 && (
            <div className="flex items-center gap-3 bg-pine/5 border border-pine/20 rounded-lg px-4 py-2.5 mb-3 text-sm">
              <span className="font-medium text-ink">{selected.size} selected</span>
              {activeTabKey === 'new' && (
                <button
                  onClick={() => setBulkPreview({ kind: 'send_sheet', ids: Array.from(selected) })}
                  className="text-xs font-medium text-pine hover:text-pine-hover px-2.5 py-1 rounded-md border border-pine/30 hover:bg-pine/10 transition-colors"
                >
                  Send Sheet
                </button>
              )}
              <button
                onClick={() => setBulkPreview({ kind: 'archive', ids: Array.from(selected) })}
                className="text-xs font-medium text-bad hover:text-bad px-2.5 py-1 rounded-md border border-bad/30 hover:bg-bad/5 transition-colors"
              >
                Archive
              </button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-ink-faint hover:text-ink ml-auto transition-colors">
                Clear selection
              </button>
            </div>
          )}
          {bulkResult && (
            <div className="bg-ok/5 border border-ok/20 rounded-lg px-4 py-2.5 mb-3 text-sm text-ok flex items-center justify-between">
              {bulkResult}
              <button onClick={() => setBulkResult('')} className="text-ok/60 hover:text-ok">Dismiss</button>
            </div>
          )}

          {/* List */}
          {loading && <div className="py-20 text-center text-ink-muted text-sm">Loading...</div>}
          {!loading && filtered.length === 0 && (
            <EmptyState message={q ? 'No results — clear your search' : currentTab.description} />
          )}

          {!loading && filtered.length > 0 && (
            <div className="space-y-1.5">
              {canBulkSelect && (
                <label className="flex items-center gap-2 px-5 py-1 text-xs text-ink-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pagedInquiries.length > 0 && pagedInquiries.every(i => selected.has(i.id))}
                    onChange={toggleSelectAllOnPage}
                  />
                  Select all on this page
                </label>
              )}
              {pagedInquiries.map(inq => {
                const isArchived = currentTab.key === 'archived';
                const dot = (STATUS_DOT_MAP[inq.status] || 'neutral') as 'ok' | 'bad' | 'warn' | 'neutral';
                const days = daysAgo(inq.updatedAt || inq.createdAt);
                const stale = !isArchived && days > 7;
                const archived = isArchived ? whyArchived(inq) : null;

                return (
                  <Link
                    key={inq.id}
                    href={detailHref(inq)}
                    className="bg-white border border-line rounded-lg px-5 py-3.5 flex items-center gap-4 hover:border-pine/30 hover:bg-pine/[0.02] transition-colors"
                  >
                    {canBulkSelect && (
                      <input
                        type="checkbox"
                        checked={selected.has(inq.id)}
                        onClick={e => e.stopPropagation()}
                        onChange={() => toggleSelected(inq.id)}
                        className="shrink-0"
                      />
                    )}
                    <span title={STATUS_LABEL[inq.status] || inq.status}><StatusDot status={dot} /></span>

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
                      <div className="text-[10px] text-ink-faint truncate flex items-center gap-1.5">
                        {inq.email}
                        {hasBadEmail(inq) && (
                          <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide bg-warn/10 text-warn px-1.5 py-0.5 rounded-full">Bad email</span>
                        )}
                      </div>
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
                        onClick={e => { e.preventDefault(); e.stopPropagation(); deleteInquiry(inq.id, inq.courseName); }}
                        className="w-7 h-7 flex items-center justify-center rounded text-ink-faint hover:text-bad hover:bg-bad/5 transition-colors shrink-0"
                        title="Delete permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {!loading && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 text-xs text-ink-muted">
              <span>Page {page + 1} of {totalPages} · {filtered.length} total</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-md border border-line bg-white hover:bg-paper disabled:opacity-40 transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 rounded-md border border-line bg-white hover:bg-paper disabled:opacity-40 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action preview + confirm modal */}
      {bulkPreview && (() => {
        const targets = inquiries.filter(i => bulkPreview.ids.includes(i.id));
        const isArchive = bulkPreview.kind === 'archive';
        const canConfirm = !isArchive || bulkConfirmText.trim().toUpperCase() === 'ARCHIVE';
        return (
          <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-lg border border-line max-w-md w-full p-5">
              <div className="text-sm font-medium text-ink mb-1">
                {isArchive ? `Archive ${targets.length} inquir${targets.length === 1 ? 'y' : 'ies'}?` : `Send setup sheet to ${targets.length} contact${targets.length === 1 ? '' : 's'}?`}
              </div>
              <p className="text-xs text-ink-muted mb-3">
                {isArchive ? 'Marks each as rejected/closed. This does not delete anything.' : 'Sends the setup-sheet email to each recipient below.'}
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1 mb-4 bg-paper border border-line rounded-md p-2">
                {targets.map(t => (
                  <div key={t.id} className="text-xs text-ink-soft flex justify-between gap-2">
                    <span className="truncate">{t.courseName}</span>
                    {!isArchive && <span className="text-ink-faint shrink-0">{t.email}</span>}
                  </div>
                ))}
              </div>
              {isArchive && (
                <div className="mb-4">
                  <label className="block text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Type ARCHIVE to confirm</label>
                  <input
                    value={bulkConfirmText}
                    onChange={e => setBulkConfirmText(e.target.value)}
                    className="w-full bg-paper border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-bad/40"
                    placeholder="ARCHIVE"
                  />
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setBulkPreview(null); setBulkConfirmText(''); }}
                  className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => { await runBulkAction(); setBulkPreview(null); setBulkConfirmText(''); }}
                  disabled={!canConfirm || bulkRunning}
                  className={
                    'text-xs font-medium px-3 py-1.5 rounded-md text-white transition-colors disabled:opacity-40 ' +
                    (isArchive ? 'bg-bad hover:bg-bad/90' : 'bg-pine hover:bg-pine-hover')
                  }
                >
                  {bulkRunning ? 'Working…' : isArchive ? 'Archive' : 'Send Sheet'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
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
