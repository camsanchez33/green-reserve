'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  RefreshCw, Mail, Wrench, Power, Search, ArrowUpRight, X, Copy,
  XCircle, CheckCircle, Clock, Trash2, ChevronDown, Archive,
} from 'lucide-react';
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
interface ApproveResult { tempPassword?: string; setupLink?: string; detailsLink?: string; emailSent?: boolean; emailError?: string; }

const STATUS_DOT_MAP: Record<string, string> = {
  pending: 'warn', in_review: 'neutral', details_requested: 'neutral',
  details_submitted: 'neutral', building: 'warn', live: 'ok', rejected: 'bad',
  archived: 'neutral',
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
const ALL_STATUSES = ['pending', 'in_review', 'details_requested', 'details_submitted', 'building', 'live', 'rejected', 'archived'];

const STAGE_EXPLAIN: Record<string, string> = {
  pending: 'New inquiry — not yet reviewed.',
  in_review: 'Send the setup sheet to gather tee-sheet details, or skip ahead and build the course.',
  details_requested: 'Setup sheet emailed. Waiting for the course to respond.',
  details_submitted: 'Setup sheet submitted — review it and build the course.',
  building: 'Course is built and the operator has their login. Review and go live when ready.',
  live: 'Course is live on GreenReserve.',
  rejected: 'Inquiry was rejected.',
  archived: 'This inquiry is archived — its course was archived or permanently deleted.',
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function daysAgo(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)); }

function whyArchived(inq: Inquiry): { reason: string; date: string } {
  if (inq.status === 'live') return { reason: 'Went live', date: inq.updatedAt || inq.createdAt };
  if (inq.status === 'rejected') return { reason: 'Rejected', date: inq.updatedAt || inq.createdAt };
  // status === 'archived' — look at last event for cause
  const lastEvent = inq.events.length > 0 ? inq.events[inq.events.length - 1] : null;
  const actorName = lastEvent?.actorName || '';
  if (actorName.toLowerCase().includes('permanently deleted')) return { reason: 'Course deleted', date: lastEvent?.createdAt || inq.updatedAt || inq.createdAt };
  if (actorName.toLowerCase().includes('archived')) return { reason: 'Course archived', date: lastEvent?.createdAt || inq.updatedAt || inq.createdAt };
  return { reason: 'Archived', date: inq.updatedAt || inq.createdAt };
}

export default function InquiriesPage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [approveResults, setApproveResults] = useState<Record<string, ApproveResult>>({});
  const [noteTexts, setNoteTexts] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [activeChips, setActiveChips] = useState<Set<string>>(
    new Set(['your_move', 'new', 'in_review', 'waiting', 'building'])
  );
  const [sortBy, setSortBy] = useState('newest');
  const [stageOverride, setStageOverride] = useState('');
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

  // Auto-advance pending → in_review when detail panel opens
  useEffect(() => {
    if (!selectedId) return;
    const inq = inquiries.find(i => i.id === selectedId);
    if (!inq || inq.status !== 'pending') return;
    fetch('/api/admin/inquiries', {
      method: 'PATCH', headers: H(),
      body: JSON.stringify({ id: selectedId, action: 'mark_opened' }),
    }).then(r => { if (r.ok) loadInquiries(); }).catch(() => {});
  }, [selectedId, inquiries, H, loadInquiries]);

  const selectedInq = selectedId ? (inquiries.find(i => i.id === selectedId) ?? null) : null;

  useEffect(() => {
    if (selectedInq) setStageOverride(selectedInq.status);
  }, [selectedInq?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function inquiryAction(id: string, action: string, extraPayload: Record<string, unknown> = {}) {
    setProcessing(id);
    try {
      const r = await fetch('/api/admin/inquiries', {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ id, action, ...extraPayload }),
      });
      const text = await r.text();
      let d: Record<string, unknown> = {};
      try { d = JSON.parse(text); } catch { /* ignore */ }
      if (r.ok) {
        if (['build_course', 'resend_welcome', 'request_details', 'resend_details'].includes(action)) {
          setApproveResults(p => ({ ...p, [id]: d as unknown as ApproveResult }));
        }
        if (action === 'mark_live' && d.emailSent === false) {
          alert(`Course is live, but the orientation email failed (${d.emailError || 'unknown error'}).`);
        }
        if (action === 'add_note') {
          setInquiries(prev => prev.map(inq => inq.id === id ? { ...inq, adminNotes: d.adminNotes as string } : inq));
          setNoteTexts(p => ({ ...p, [id]: '' }));
        } else {
          await loadInquiries();
        }
      } else {
        alert(`Failed (${r.status}): ${(d.error as string) || text.slice(0, 200)}`);
      }
    } catch (e) { alert(`Error: ${e}`); }
    setProcessing(null);
  }

  async function buildAndConfigure(inq: Inquiry) {
    setProcessing(inq.id);
    try {
      const r = await fetch('/api/admin/inquiries', {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ id: inq.id, action: 'build_course' }),
      });
      const d = await r.json();
      if (!r.ok) { alert(`Failed: ${d.error || 'unknown error'}`); setProcessing(null); return; }
      setApproveResults(p => ({ ...p, [inq.id]: d as unknown as ApproveResult }));
      await loadInquiries();
      if (d.emailSent === false) alert(`Course built, but welcome email failed (${d.emailError || 'unknown error'}).`);
      const list: Inquiry[] = await fetch('/api/admin/inquiries', { headers: H() }).then(res => res.json());
      const updated = list.find(i => i.id === inq.id);
      if (updated?.builtCourseId) router.push(`/admin/courses/${updated.builtCourseId}`);
    } catch (e) { alert(`Error: ${e}`); }
    setProcessing(null);
  }

  async function deleteInquiry(id: string, name: string) {
    if (!confirm(`Permanently delete inquiry for "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/inquiries?id=${id}`, { method: 'DELETE', headers: H() });
    setInquiries(prev => prev.filter(i => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  // Split into active vs archived pools
  const activePool = inquiries.filter(i => ACTIVE_STATUSES.has(i.status));
  const archivedPool = inquiries.filter(i => ARCHIVED_STATUSES.has(i.status));

  // Active tab: chip filter + search + sort
  const activeStatuses = new Set(ACTIVE_CHIPS.filter(c => activeChips.has(c.key)).flatMap(c => c.statuses));
  const q = search.toLowerCase().trim();
  const matchesSearch = (inq: Inquiry) => !q || (
    inq.courseName.toLowerCase().includes(q) ||
    inq.contactName.toLowerCase().includes(q) ||
    inq.email.toLowerCase().includes(q) ||
    inq.city.toLowerCase().includes(q)
  );

  let filteredActive = activePool.filter(i => {
    if (activeStatuses.size > 0 && !activeStatuses.has(i.status)) return false;
    return matchesSearch(i);
  });
  let filteredArchived = archivedPool.filter(matchesSearch);

  const sortFn = (a: Inquiry, b: Inquiry) => {
    if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sortBy === 'name') return a.courseName.localeCompare(b.courseName);
    if (sortBy === 'longest_stage') return new Date(a.updatedAt || a.createdAt).getTime() - new Date(b.updatedAt || b.createdAt).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };
  filteredActive = [...filteredActive].sort(sortFn);
  filteredArchived = [...filteredArchived].sort(sortFn);

  const displayed = activeTab === 'active' ? filteredActive : filteredArchived;

  if (!adminReady) return null;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="inquiries" />
      <div
        className="ml-56 flex-1 flex flex-col min-h-screen"
        style={{ marginRight: selectedInq ? 480 : 0 }}
      >
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
                onClick={() => { setActiveTab(tab); setSelectedId(null); }}
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
                const isSelected = inq.id === selectedId;
                const dot = STATUS_DOT_MAP[inq.status] || 'neutral';
                return (
                  <div
                    key={inq.id}
                    onClick={() => setSelectedId(inq.id === selectedId ? null : inq.id)}
                    className={
                      'bg-white border rounded-lg px-5 py-3.5 flex items-center gap-4 cursor-pointer transition-colors ' +
                      (isSelected ? 'border-pine/30 bg-pine/5' : 'border-line hover:border-line-strong')
                    }
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
                      const isSelected = inq.id === selectedId;
                      const dot = STATUS_DOT_MAP[inq.status] || 'neutral';
                      const { reason, date } = whyArchived(inq);
                      return (
                        <tr
                          key={inq.id}
                          onClick={() => setSelectedId(inq.id === selectedId ? null : inq.id)}
                          className={
                            'cursor-pointer transition-colors border-b border-line last:border-b-0 ' +
                            (isSelected ? 'bg-pine/5' : (i % 2 === 0 ? 'bg-white hover:bg-paper' : 'bg-paper/50 hover:bg-paper'))
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

      {/* ── Detail panel ─────────────────────────────────────── */}
      {selectedInq && (
        <div className="fixed right-0 top-0 bottom-0 w-[480px] bg-white border-l border-line z-40 flex flex-col shadow-xl">

          {/* Panel header */}
          <div className="px-5 py-4 border-b border-line shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-[17px] font-serif font-medium text-ink leading-snug">{selectedInq.courseName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <StatusDot
                    status={STATUS_DOT_MAP[selectedInq.status] as 'ok' | 'bad' | 'warn' | 'neutral' || 'neutral'}
                    label={STATUS_LABEL[selectedInq.status] || selectedInq.status}
                  />
                  <span className="text-xs text-ink-muted">{selectedInq.city}, {selectedInq.state}</span>
                  {!ARCHIVED_STATUSES.has(selectedInq.status) && (
                    <span className="text-xs text-ink-faint">{daysAgo(selectedInq.updatedAt || selectedInq.createdAt)}d in stage</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-paper text-ink-muted hover:text-ink transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Stage explanation */}
            {STAGE_EXPLAIN[selectedInq.status] && (
              <p className="text-xs text-ink-muted mt-2">{STAGE_EXPLAIN[selectedInq.status]}</p>
            )}
            {/* Archived-specific notice */}
            {selectedInq.status === 'archived' && (() => {
              const { reason, date } = whyArchived(selectedInq);
              return (
                <div className="flex items-center gap-2 mt-2 bg-paper border border-line rounded-md px-3 py-2">
                  <Archive className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                  <span className="text-xs text-ink-muted">{reason} · {fmtDate(date)}</span>
                </div>
              );
            })()}
          </div>

          {/* Stage override (always visible) */}
          <div className="px-5 py-2.5 border-b border-line shrink-0 flex items-center gap-2">
            <ChevronDown className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <span className="text-[11px] text-ink-muted shrink-0">Move to stage:</span>
            <select
              value={stageOverride}
              onChange={e => {
                const ns = e.target.value;
                setStageOverride(ns);
                if (ns !== selectedInq.status) inquiryAction(selectedInq.id, 'set_status', { newStatus: ns });
              }}
              className="flex-1 bg-paper border border-line rounded-md px-2 py-1 text-xs text-ink outline-none focus:border-pine/40 cursor-pointer"
            >
              {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
            </select>
          </div>

          {/* Action buttons — hidden for archived inquiries */}
          {!ARCHIVED_STATUSES.has(selectedInq.status) && (
            <div className="px-5 py-3.5 border-b border-line shrink-0 flex flex-wrap gap-2">
              {selectedInq.status === 'pending' && (
                <>
                  <button
                    onClick={() => inquiryAction(selectedInq.id, 'mark_in_review')}
                    disabled={processing === selectedInq.id}
                    className="bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Clock className="w-3.5 h-3.5" />In Review
                  </button>
                  <button
                    onClick={() => { if (confirm('Reject this inquiry?')) inquiryAction(selectedInq.id, 'reject'); }}
                    disabled={processing === selectedInq.id}
                    className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />Reject
                  </button>
                </>
              )}
              {selectedInq.status === 'in_review' && (
                <>
                  <button
                    onClick={() => { if (confirm('Send ' + selectedInq.contactName + ' the setup sheet?')) inquiryAction(selectedInq.id, 'request_details'); }}
                    disabled={processing === selectedInq.id}
                    className="bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Mail className="w-3.5 h-3.5" />Send Sheet
                  </button>
                  <button
                    onClick={() => { if (confirm('Build ' + selectedInq.courseName + ' now without the sheet?')) buildAndConfigure(selectedInq); }}
                    disabled={processing === selectedInq.id}
                    className="text-ink-muted hover:text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border border-line hover:border-line-strong transition-colors"
                  >
                    <Wrench className="w-3 h-3" />Skip &amp; Build
                  </button>
                  <button
                    onClick={() => { if (confirm('Reject?')) inquiryAction(selectedInq.id, 'reject'); }}
                    disabled={processing === selectedInq.id}
                    className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />Reject
                  </button>
                </>
              )}
              {selectedInq.status === 'details_requested' && (
                <>
                  <button
                    onClick={() => { if (confirm('Resend setup-sheet link?')) inquiryAction(selectedInq.id, 'resend_details'); }}
                    disabled={processing === selectedInq.id}
                    className="bg-paper hover:bg-line border border-line text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Mail className="w-3.5 h-3.5" />Resend Sheet
                  </button>
                  <button
                    onClick={() => { if (confirm('Reject?')) inquiryAction(selectedInq.id, 'reject'); }}
                    disabled={processing === selectedInq.id}
                    className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />Reject
                  </button>
                </>
              )}
              {selectedInq.status === 'details_submitted' && (
                <>
                  <button
                    onClick={() => { if (confirm('Build ' + selectedInq.courseName + '? Creates operator account.')) buildAndConfigure(selectedInq); }}
                    disabled={processing === selectedInq.id}
                    className="bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />Build Course
                  </button>
                  <button
                    onClick={() => { if (confirm('Reject?')) inquiryAction(selectedInq.id, 'reject'); }}
                    disabled={processing === selectedInq.id}
                    className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />Reject
                  </button>
                </>
              )}
              {selectedInq.status === 'building' && (
                <>
                  {selectedInq.builtCourseId && (
                    <button
                      onClick={() => router.push('/admin/courses/' + selectedInq.builtCourseId)}
                      className="bg-paper hover:bg-line border border-line text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Wrench className="w-3.5 h-3.5" />Manage Course
                    </button>
                  )}
                  <button
                    onClick={() => { if (confirm('Resend welcome email?')) inquiryAction(selectedInq.id, 'resend_welcome'); }}
                    disabled={processing === selectedInq.id}
                    className="bg-paper hover:bg-line border border-line text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />Resend Email
                  </button>
                  <button
                    onClick={() => { if (confirm('Set ' + selectedInq.courseName + ' LIVE?')) inquiryAction(selectedInq.id, 'mark_live'); }}
                    disabled={processing === selectedInq.id}
                    className="bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Power className="w-3.5 h-3.5" />Go Live
                  </button>
                </>
              )}
              {selectedInq.status === 'building' && (
                <button
                  onClick={() => deleteInquiry(selectedInq.id, selectedInq.courseName)}
                  className="w-8 h-8 flex items-center justify-center text-ink-muted hover:text-bad hover:bg-bad/5 rounded-md transition-colors ml-auto"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Permanently delete archived inquiry */}
          {selectedInq.status === 'archived' && (
            <div className="px-5 py-3 border-b border-line shrink-0 flex justify-end">
              <button
                onClick={() => deleteInquiry(selectedInq.id, selectedInq.courseName)}
                className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-bad hover:bg-bad/5 px-3 py-1.5 rounded-md border border-line hover:border-bad/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />Delete inquiry permanently
              </button>
            </div>
          )}

          {/* Approve result */}
          {approveResults[selectedInq.id] && (() => {
            const res = approveResults[selectedInq.id];
            const isDetails = !!res.detailsLink;
            const rows: [string, string][] = isDetails
              ? [['Setup Sheet Link', res.detailsLink as string]]
              : [['Temp Password', res.tempPassword || ''], ['Setup Link', res.setupLink || '']];
            const failed = res.emailSent === false;
            return (
              <div className={'px-5 py-3.5 border-b shrink-0 ' + (failed ? 'bg-bad/5 border-bad/20' : 'bg-ok/5 border-ok/20')}>
                <div className={'text-xs font-medium mb-2 ' + (failed ? 'text-bad' : 'text-ok')}>
                  {failed
                    ? 'Email failed (' + (res.emailError || 'unknown') + '). Share manually:'
                    : (isDetails ? 'Setup sheet sent.' : 'Course built, welcome email sent.')}
                </div>
                <div className="space-y-1.5">
                  {rows.map(([label, val]) => (
                    <div key={label} className="flex items-center gap-3 bg-white rounded-md px-3 py-2 border border-line">
                      <span className="text-xs text-ink-muted w-28 shrink-0">{label}</span>
                      <span className="text-xs text-ink font-mono flex-1 truncate">{val}</span>
                      <button onClick={() => navigator.clipboard.writeText(val)} className="text-ink-muted hover:text-pine transition-colors">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">

            {/* Wizard quick-launch (active pipeline only) */}
            {!selectedInq.builtCourseId && !ARCHIVED_STATUSES.has(selectedInq.status) && !['building'].includes(selectedInq.status) && (() => {
              const params = new URLSearchParams({
                name: selectedInq.courseName || '', city: selectedInq.city || '',
                state: selectedInq.state || '', zip: selectedInq.zipCode || '',
                address: selectedInq.address || '', website: selectedInq.website || '',
                type: selectedInq.courseType || 'public', contactName: selectedInq.contactName || '',
                contactEmail: selectedInq.email || '', inquiryId: selectedInq.id,
              });
              return (
                <div className="mx-5 mt-4 flex items-center justify-between bg-pine/5 border border-pine/20 rounded-md px-4 py-3">
                  <div>
                    <div className="text-xs font-medium text-pine">Build from this inquiry</div>
                    <div className="text-[10px] text-pine/60 mt-0.5">Opens wizard pre-filled with submitted data</div>
                  </div>
                  <button
                    onClick={() => router.push('/admin/create?' + params.toString())}
                    className="flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover bg-pine/10 hover:bg-pine/20 border border-pine/20 px-3 py-1.5 rounded-md transition-colors shrink-0"
                  >
                    Open Wizard <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })()}

            {/* Course link for live inquiries */}
            {selectedInq.status === 'live' && selectedInq.builtCourseId && (
              <div className="mx-5 mt-4">
                <button
                  onClick={() => router.push('/admin/courses/' + selectedInq.builtCourseId)}
                  className="flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover bg-pine/5 hover:bg-pine/10 border border-pine/20 px-3 py-2 rounded-md transition-colors"
                >
                  <Wrench className="w-3.5 h-3.5" />Manage course <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Contact */}
            <div className="px-5 py-4 border-b border-line">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Contact</div>
              <div className="text-sm font-medium text-ink mb-0.5">
                {selectedInq.contactName}{selectedInq.contactTitle ? ' · ' + selectedInq.contactTitle : ''}
              </div>
              <a href={'mailto:' + selectedInq.email} className="text-sm text-pine hover:underline block">{selectedInq.email}</a>
              {selectedInq.phone && <div className="text-sm text-ink-muted mt-0.5">{selectedInq.phone}</div>}
            </div>

            {/* Details */}
            <div className="px-5 py-4 border-b border-line">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Details</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['Course type', selectedInq.courseType],
                  ['Booking method', selectedInq.currentBookingMethod || '—'],
                  ['Tee times/day', String(selectedInq.teeTimesPerDay || '—')],
                  ['Green fees', selectedInq.greenFeeRange || '—'],
                  ['City / State', selectedInq.city + ', ' + selectedInq.state],
                  ['Website', selectedInq.website || '—'],
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label} className="bg-paper rounded-md px-3 py-2 border border-line">
                    <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">{label}</div>
                    <div className="text-ink font-medium text-sm">{val}</div>
                  </div>
                ))}
                {(selectedInq.hasMemberPricing || selectedInq.hasResidentPricing || selectedInq.hasCaddies) && (
                  <div className="flex gap-2 col-span-2 flex-wrap">
                    {selectedInq.hasMemberPricing && <span className="text-[11px] px-2 py-0.5 rounded bg-paper text-ink-muted border border-line">Members</span>}
                    {selectedInq.hasResidentPricing && <span className="text-[11px] px-2 py-0.5 rounded bg-paper text-ink-muted border border-line">Residents</span>}
                    {selectedInq.hasCaddies && <span className="text-[11px] px-2 py-0.5 rounded bg-paper text-ink-muted border border-line">Caddies</span>}
                  </div>
                )}
                {selectedInq.lookingFor && selectedInq.lookingFor.length > 0 && (
                  <div className="col-span-2 bg-paper rounded-md px-3 py-2 border border-line">
                    <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">Looking for</div>
                    <div className="text-ink font-medium text-sm">{selectedInq.lookingFor.join(', ')}</div>
                  </div>
                )}
                {selectedInq.additionalNotes && (
                  <div className="col-span-2 bg-paper rounded-md px-3 py-2 border border-line">
                    <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">Additional notes</div>
                    <div className="text-ink text-sm">{selectedInq.additionalNotes}</div>
                  </div>
                )}
                {selectedInq.pricingNotes && (
                  <div className="col-span-2 bg-paper rounded-md px-3 py-2 border border-line">
                    <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">Pricing notes</div>
                    <div className="text-ink text-sm">{selectedInq.pricingNotes}</div>
                  </div>
                )}
              </div>
            </div>

            {/* What they need (needsJson) */}
            {selectedInq.needsJson && (() => {
              let n: Record<string, unknown> = {};
              try { n = JSON.parse(selectedInq.needsJson || ''); } catch { /* ignore */ }
              const entries = Object.entries(n).filter(([, v]) => v !== '' && v !== null);
              if (entries.length === 0) return null;
              const NEEDS_LABELS: Record<string, string> = {
                residentRates: 'Resident rates',
                hasMemberships: 'Memberships / season passes',
                roundsPerMonth: 'Rounds per month',
                publicTeeTimes: 'Non-member tee times',
                memberCount: 'Member count',
                outsideOutings: 'Outside outings',
                memberBookingToday: 'Current booking method',
                chargesMembersPerRound: 'Charges per round',
              };
              const NEEDS_VALUES: Record<string, string> = {
                yes: 'Yes', no: 'No',
                yes_regularly: 'Yes, regularly', limited: 'Limited windows', no_members_only: 'No, members only',
                under_100: 'Under 100', '100_300': '100–300', '300_plus': '300+',
                under_500: 'Under 500', '500_1500': '500–1,500', '1500_3000': '1,500–3,000', '3000_plus': '3,000+',
                pro_shop_phone: 'Pro shop / phone', signup_sheet: 'Sign-up sheet',
                booking_software: 'Booking software', other: 'Other',
              };
              return (
                <div className="px-5 py-4 border-b border-line">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-warn mb-2">Branch Answers</div>
                  <div className="grid grid-cols-2 gap-2">
                    {entries.map(([k, v]) => (
                      <div key={k} className="bg-warn/5 border border-warn/20 rounded-md px-3 py-2">
                        <div className="text-[10px] text-warn/80 mb-0.5">{NEEDS_LABELS[k] || k}</div>
                        <div className="text-warn text-sm font-medium">{NEEDS_VALUES[String(v)] || String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Setup sheet (detailsJson) */}
            {selectedInq.detailsJson && (() => {
              let d: Record<string, unknown> = {};
              try { d = JSON.parse(selectedInq.detailsJson || ''); } catch { /* ignore */ }
              if (Object.keys(d).length === 0) return null;
              const sch = d.schedule as Record<string, unknown> | undefined;
              const rest = Object.entries(d).filter(([k, v]) =>
                k !== 'schedule' && v !== '' && v !== null && !(Array.isArray(v) && v.length === 0)
              );
              return (
                <div className="px-5 py-4 border-b border-line space-y-3">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ok">Setup Sheet Submitted</div>
                  {sch && (sch.greenFeeWeekday || sch.greenFeeWeekend) && (
                    <div className="bg-ok/5 border border-ok/20 rounded-md p-3">
                      <div className="text-ok font-medium text-sm mb-1">Proposed Tee Sheet</div>
                      <div className="text-ink text-sm">
                        {Array.isArray(sch.daysOfWeek) && (sch.daysOfWeek as number[]).length > 0
                          ? (sch.daysOfWeek as number[]).map(dd => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dd]).join(', ')
                          : 'Every day'}{' · '}{String(sch.startTime)}–{String(sch.endTime)} every {String(sch.intervalMinutes)}min
                      </div>
                      <div className="text-ink-muted text-xs mt-1">
                        {'WD $' + String(sch.greenFeeWeekday || 0) + ' / WE $' + String(sch.greenFeeWeekend || 0) +
                          ' · Cart $' + String(sch.cartFee || 0) +
                          (sch.memberRateWeekday ? ' · Member $' + String(sch.memberRateWeekday) : '') +
                          (sch.walkingAllowed ? ' · Walking' : '')}
                      </div>
                    </div>
                  )}
                  {rest.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      {rest.map(([k, v]) => (
                        <div key={k} className="bg-paper border border-line rounded-md px-3 py-2">
                          <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">{k}</div>
                          <div className="text-ink text-sm">{Array.isArray(v) ? v.join(', ') : String(v)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* History */}
            {selectedInq.events && selectedInq.events.length > 0 && (
              <div className="px-5 py-4 border-b border-line">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">History</div>
                <div className="space-y-2.5">
                  {selectedInq.events.map(ev => (
                    <div key={ev.id} className="flex items-start gap-2.5 text-xs">
                      <div className={'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ' + (ev.trigger === 'system' ? 'bg-ink-faint' : 'bg-pine/60')} />
                      <div>
                        <span className="text-ink">{STATUS_LABEL[ev.fromStatus] || ev.fromStatus}</span>
                        <span className="text-ink-muted mx-1">→</span>
                        <span className="text-ink font-medium">{STATUS_LABEL[ev.toStatus] || ev.toStatus}</span>
                        <span className="text-ink-faint ml-1.5">
                          {ev.trigger === 'admin' && ev.actorName ? 'by ' + ev.actorName : ev.actorName || 'auto'}
                        </span>
                        <div className="text-ink-faint text-[10px] mt-0.5">{fmtDate(ev.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Admin notes */}
            <div className="px-5 py-4">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Internal Notes</div>
              {selectedInq.adminNotes && (
                <pre className="text-xs text-ink-soft bg-paper border border-line rounded-md px-4 py-3 mb-3 whitespace-pre-wrap font-sans">
                  {selectedInq.adminNotes}
                </pre>
              )}
              <div className="flex gap-2">
                <textarea
                  value={noteTexts[selectedInq.id] || ''}
                  onChange={e => setNoteTexts(p => ({ ...p, [selectedInq.id]: e.target.value }))}
                  placeholder="Add a note..."
                  rows={2}
                  className="flex-1 bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 resize-none"
                />
                <button
                  onClick={() => inquiryAction(selectedInq.id, 'add_note', { note: noteTexts[selectedInq.id] || '' })}
                  disabled={!noteTexts[selectedInq.id]?.trim() || processing === selectedInq.id}
                  className="px-4 py-2 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-xs font-medium rounded-md transition-colors self-start"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
