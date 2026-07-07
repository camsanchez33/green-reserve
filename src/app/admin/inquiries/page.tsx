'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Copy,
  RefreshCw, Mail, Trash2, Wrench, Power, Search, ArrowUpRight,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface Inquiry {
  id: string; contactName: string; contactTitle: string; email: string; phone: string;
  courseName: string; address: string; city: string; state: string; zipCode: string;
  website: string; courseType: string; currentBookingMethod: string; teeTimesPerDay: number | null;
  greenFeeRange: string; hasResidentPricing: boolean; hasMemberPricing: boolean;
  hasCaddies: boolean; pricingNotes: string; lookingFor: string[]; additionalNotes: string;
  status: string; adminNotes: string; builtCourseId: string | null; createdAt: string;
  updatedAt?: string;
  detailsToken?: string | null; detailsJson?: string; needsJson?: string;
}
interface ApproveResult { tempPassword?: string; setupLink?: string; detailsLink?: string; emailSent?: boolean; emailError?: string; }

type SortOrder = 'newest' | 'oldest' | 'longest';

const STATUS_PIPELINE = [
  { key: 'pending',           label: 'Pending',    color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  { key: 'in_review',         label: 'In Review',  color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/30' },
  { key: 'details_requested', label: 'Sheet Sent', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30' },
  { key: 'details_submitted', label: 'Sheet In',   color: 'text-teal-400',   bg: 'bg-teal-500/10 border-teal-500/30' },
  { key: 'building',          label: 'Building',   color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
  { key: 'live',              label: 'Live',        color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30' },
  { key: 'rejected',          label: 'Rejected',   color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30' },
];
const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
  in_review: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
  details_requested: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40',
  details_submitted: 'bg-teal-500/20 text-teal-300 border border-teal-500/40',
  building: 'bg-orange-500/20 text-orange-300 border border-orange-500/40',
  live: 'bg-green-500/20 text-green-300 border border-green-500/40',
  rejected: 'bg-red-500/20 text-red-300 border border-red-500/40',
  approved: 'bg-green-500/20 text-green-300 border border-green-500/40',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', in_review: 'In Review',
  details_requested: 'Sheet Sent', details_submitted: 'Sheet In',
  building: 'Building', live: 'Live', rejected: 'Rejected', approved: 'Approved',
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function daysAgo(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
}

function PipelineBar({ inquiries, selectedStatuses, onToggle }: {
  inquiries: { status: string }[];
  selectedStatuses: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-2 mb-5">
      {STATUS_PIPELINE.map(s => {
        const count = inquiries.filter(i => i.status === s.key).length;
        const isSelected = selectedStatuses.has(s.key);
        const hasItems = count > 0;
        const borderCls = isSelected ? 'border-2' : 'border';
        let wrapCls = `rounded-lg ${borderCls} px-2 py-2.5 text-center cursor-pointer transition-all select-none `;
        if (isSelected || hasItems) {
          wrapCls += s.bg;
          if (!isSelected) wrapCls += ' hover:opacity-90';
        } else {
          wrapCls += 'bg-gray-900 border-gray-800 opacity-40 hover:opacity-60';
        }
        const numCls = 'text-xl font-black ' + (hasItems || isSelected ? s.color : 'text-gray-700');
        const labelCls = 'text-[10px] font-semibold uppercase tracking-wide mt-0.5 ' + (hasItems || isSelected ? s.color : 'text-gray-700');
        return (
          <button key={s.key} onClick={() => onToggle(s.key)} className={wrapCls}>
            <div className={numCls}>{count}</div>
            <div className={labelCls}>{s.label}</div>
          </button>
        );
      })}
    </div>
  );
}

function InquiryToggle({ view, onSwitch, activeCount, pastCount }: {
  view: 'active' | 'past'; onSwitch: (v: 'active' | 'past') => void; activeCount: number; pastCount: number;
}) {
  const btnCls = (v: 'active' | 'past') => 'px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors ' + (view === v ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-white');
  return (
    <div className="flex gap-1 bg-gray-800/50 border border-gray-800 rounded-lg p-1 w-fit">
      <button onClick={() => onSwitch('active')} className={btnCls('active')}>Active ({activeCount})</button>
      <button onClick={() => onSwitch('past')} className={btnCls('past')}>Past ({pastCount})</button>
    </div>
  );
}

export default function InquiriesPage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approveResults, setApproveResults] = useState<Record<string, ApproveResult>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [noteTexts, setNoteTexts] = useState<Record<string, string>>({});
  const [inquiryView, setInquiryView] = useState<'active' | 'past'>('active');
  const [search, setSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

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
    if (!adminReady) return;
    loadInquiries();
    fetch('/api/admin/stats').then(r => r.json()).then(d => {
      if (d.pendingInquiries != null) setPendingCount(d.pendingInquiries);
    }).catch(() => {});
  }, [adminReady, loadInquiries]);

  function toggleStatusFilter(key: string) {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function inquiryAction(id: string, action: string, extraPayload: Record<string, unknown> = {}) {
    setProcessing(id);
    try {
      const r = await fetch('/api/admin/inquiries', { method: 'PATCH', headers: H(), body: JSON.stringify({ id, action, ...extraPayload }) });
      const text = await r.text();
      let d: Record<string, unknown> = {};
      try { d = JSON.parse(text); } catch { /* not json */ }
      if (r.ok) {
        if (['build_course', 'resend_welcome', 'request_details', 'resend_details'].includes(action)) setApproveResults(p => ({ ...p, [id]: d as unknown as ApproveResult }));
        if (action === 'mark_live' && d.emailSent === false) alert(`Course is live, but the orientation email failed to send (${d.emailError || 'unknown error'}). You may want to follow up directly.`);
        if (action === 'add_note') {
          setInquiries(prev => prev.map(inq => inq.id === id ? { ...inq, adminNotes: d.adminNotes as string } : inq));
          setNoteTexts(p => ({ ...p, [id]: '' }));
        } else { loadInquiries(); }
      } else { alert(`Failed (${r.status}): ${(d.error as string) || text.slice(0, 200)}`); }
    } catch (e) { alert(`Error: ${e}`); }
    setProcessing(null);
  }

  async function deleteInquiry(id: string, name: string) {
    if (!confirm(`Permanently delete inquiry for "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/inquiries?id=${id}`, { method: 'DELETE', headers: H() });
    setInquiries(prev => prev.filter(i => i.id !== id));
  }

  async function buildAndConfigure(inq: Inquiry) {
    setProcessing(inq.id);
    try {
      const r = await fetch('/api/admin/inquiries', { method: 'PATCH', headers: H(), body: JSON.stringify({ id: inq.id, action: 'build_course' }) });
      const d = await r.json();
      if (!r.ok) { alert(`Failed: ${d.error || 'unknown error'}`); setProcessing(null); return; }
      setApproveResults(p => ({ ...p, [inq.id]: d as unknown as ApproveResult }));
      await loadInquiries();
      if (d.emailSent === false) alert(`Course built, but the welcome email failed to send (${d.emailError || 'unknown error'}).`);
      const list = await fetch('/api/admin/inquiries', { headers: H() }).then(res => res.json());
      const updated = (list as Inquiry[]).find(i => i.id === inq.id);
      if (updated?.builtCourseId) {
        router.push(`/admin/courses?courseId=${updated.builtCourseId}&tab=setup&courseType=${encodeURIComponent(inq.courseType)}`);
      }
    } catch (e) { alert(`Error: ${e}`); }
    setProcessing(null);
  }

  if (!adminReady) return null;

  const activeInqs = inquiries.filter(i => ['pending','in_review','details_requested','details_submitted'].includes(i.status));
  const pastInqs = inquiries.filter(i => ['building','live','rejected'].includes(i.status));
  const baseList = inquiryView === 'active' ? activeInqs : pastInqs;

  const q = search.toLowerCase().trim();
  let visibleInqs = statusFilters.size > 0 ? baseList.filter(i => statusFilters.has(i.status)) : baseList;
  if (q) {
    visibleInqs = visibleInqs.filter(i =>
      i.courseName.toLowerCase().includes(q) ||
      i.contactName.toLowerCase().includes(q) ||
      i.email.toLowerCase().includes(q) ||
      i.city.toLowerCase().includes(q)
    );
  }
  if (sortOrder === 'oldest') {
    visibleInqs = [...visibleInqs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } else if (sortOrder === 'longest') {
    visibleInqs = [...visibleInqs].sort((a, b) => new Date(a.updatedAt || a.createdAt).getTime() - new Date(b.updatedAt || b.createdAt).getTime());
  } else {
    visibleInqs = [...visibleInqs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const hasFilters = q.length > 0 || statusFilters.size > 0;
  const emptyMsg = hasFilters
    ? 'No inquiries match your filters'
    : inquiryView === 'active' ? 'No active inquiries — all caught up' : 'No past inquiries yet';

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar active="inquiries" pendingInquiries={pendingCount} />
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-6xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-black text-white">Course Inquiries</h1>
              <div className="text-sm text-gray-500 mt-0.5">Manage the pipeline from interest to live</div>
            </div>
            <button onClick={loadInquiries} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white px-3 py-2 rounded-lg hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-colors">
              <RefreshCw className="w-4 h-4"/>Refresh
            </button>
          </div>

          <PipelineBar inquiries={inquiries} selectedStatuses={statusFilters} onToggle={toggleStatusFilter}/>

          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <InquiryToggle
              view={inquiryView}
              onSwitch={v => { setInquiryView(v); setStatusFilters(new Set()); }}
              activeCount={activeInqs.length}
              pastCount={pastInqs.length}
            />

            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none"/>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, email, city..."
                className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-700"
              />
            </div>

            <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
              {(['newest', 'oldest', 'longest'] as SortOrder[]).map(s => (
                <button key={s} onClick={() => setSortOrder(s)}
                  className={'px-3 py-1 rounded-md text-xs font-semibold transition-colors ' + (sortOrder === s ? 'bg-gray-700 text-white' : 'text-gray-600 hover:text-gray-300')}>
                  {s === 'longest' ? 'Longest in stage' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {hasFilters && (
              <button onClick={() => { setStatusFilters(new Set()); setSearch(''); }}
                className="text-xs text-gray-600 hover:text-gray-300 px-2.5 py-1.5 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
                Clear filters
              </button>
            )}
          </div>

          {loading && <div className="text-gray-600 py-20 text-center text-sm">Loading...</div>}

          <div className="space-y-3">
            {visibleInqs.map(inq => {
              const stageDays = daysAgo(inq.updatedAt || inq.createdAt);
              const staleStage = stageDays > 7;
              const showWizard = !inq.builtCourseId && !['building','live','rejected'].includes(inq.status);
              const wizardUrl = `/admin/create?${new URLSearchParams({ name: inq.courseName||'', city: inq.city||'', state: inq.state||'', zip: inq.zipCode||'', address: inq.address||'', website: inq.website||'', type: inq.courseType||'public', contactName: inq.contactName||'', contactEmail: inq.email||'', inquiryId: inq.id }).toString()}`;
              return (
                <div key={inq.id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden hover:border-gray-700 transition-colors">
                  <div className="px-5 py-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                        <span className="font-bold text-white">{inq.courseName}</span>
                        <span className={'text-xs px-2.5 py-0.5 rounded-full font-semibold ' + (STATUS_BADGE[inq.status] || 'bg-gray-800 text-gray-400')}>{STATUS_LABEL[inq.status] || inq.status}</span>
                        <span className={'text-xs px-2 py-0.5 rounded-md font-medium border ' + (staleStage ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-gray-800/80 text-gray-500 border-gray-700')}>
                          {stageDays}d in stage
                        </span>
                        {inq.hasMemberPricing && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Members</span>}
                        {inq.hasResidentPricing && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">Residents</span>}
                        {inq.hasCaddies && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Caddies</span>}
                      </div>
                      <div className="text-sm text-gray-400">
                        {inq.contactName}{inq.contactTitle ? ' · ' + inq.contactTitle : ''} · <a href={'mailto:' + inq.email} className="hover:text-blue-400 transition-colors">{inq.email}</a>
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{inq.city}, {inq.state}</span>
                        <span>·</span>
                        <span className="capitalize">{inq.courseType}</span>
                        <span>·</span>
                        <span>{fmtDate(inq.createdAt)}</span>
                        {inq.greenFeeRange && <><span>·</span><span>Fees: {inq.greenFeeRange}</span></>}
                        {inq.lookingFor && inq.lookingFor.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-gray-500">
                              {inq.lookingFor.slice(0, 3).join(', ')}{inq.lookingFor.length > 3 ? ` +${inq.lookingFor.length - 3} more` : ''}
                            </span>
                          </>
                        )}
                      </div>
                      {inq.adminNotes && (
                        <div className="mt-2 text-xs text-gray-500 bg-gray-800/50 rounded-lg px-3 py-1.5 border border-gray-700/50">
                          {inq.adminNotes.split('\n')[0].slice(0, 100) + (inq.adminNotes.length > 100 ? '...' : '')}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {inq.status === 'pending' && <>
                        <button onClick={() => inquiryAction(inq.id, 'mark_in_review')} disabled={processing === inq.id} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"><Clock className="w-3.5 h-3.5"/>In Review</button>
                        <button onClick={() => { if (confirm('Reject this inquiry?')) inquiryAction(inq.id, 'reject'); }} disabled={processing === inq.id} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><XCircle className="w-3.5 h-3.5"/>Reject</button>
                      </>}
                      {inq.status === 'in_review' && <>
                        <button onClick={() => { if (confirm('Send ' + inq.contactName + ' the setup sheet?')) inquiryAction(inq.id, 'request_details'); }} disabled={processing === inq.id} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"><Mail className="w-3.5 h-3.5"/>Send Setup Sheet</button>
                        <button onClick={() => { if (confirm('Reject?')) inquiryAction(inq.id, 'reject'); }} disabled={processing === inq.id} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><XCircle className="w-3.5 h-3.5"/>Reject</button>
                        <button onClick={() => { if (confirm('Build ' + inq.courseName + ' now and configure yourself?')) buildAndConfigure(inq); }} disabled={processing === inq.id} className="text-gray-500 hover:text-gray-300 px-2 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 border border-gray-700 hover:border-gray-600 transition-colors"><Wrench className="w-3 h-3"/>Skip &amp; Build</button>
                      </>}
                      {inq.status === 'details_requested' && <>
                        <button onClick={() => { if (confirm('Resend setup-sheet link to ' + inq.contactName + '?')) inquiryAction(inq.id, 'resend_details'); }} disabled={processing === inq.id} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"><Mail className="w-3.5 h-3.5"/>Resend Sheet</button>
                        <button onClick={() => { if (confirm('Reject?')) inquiryAction(inq.id, 'reject'); }} disabled={processing === inq.id} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><XCircle className="w-3.5 h-3.5"/>Reject</button>
                      </>}
                      {inq.status === 'details_submitted' && <>
                        <button onClick={() => { if (confirm('Build ' + inq.courseName + '? Creates operator account and opens Setup.')) buildAndConfigure(inq); }} disabled={processing === inq.id} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"><CheckCircle className="w-3.5 h-3.5"/>Build Course</button>
                        <button onClick={() => { if (confirm('Reject?')) inquiryAction(inq.id, 'reject'); }} disabled={processing === inq.id} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><XCircle className="w-3.5 h-3.5"/>Reject</button>
                      </>}
                      {inq.status === 'building' && <>
                        {inq.builtCourseId && <button onClick={() => router.push(`/admin/courses?courseId=${inq.builtCourseId}&tab=setup`)} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><Wrench className="w-3.5 h-3.5"/>Manage Setup</button>}
                        <button onClick={() => { if (confirm('Resend welcome email to ' + inq.contactName + '?')) inquiryAction(inq.id, 'resend_welcome'); }} disabled={processing === inq.id} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><Mail className="w-3.5 h-3.5"/>Resend Email</button>
                        <button onClick={() => { if (confirm('Set ' + inq.courseName + ' LIVE?')) inquiryAction(inq.id, 'mark_live'); }} disabled={processing === inq.id} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"><Power className="w-3.5 h-3.5"/>Go Live</button>
                      </>}
                      {inq.status === 'live' && inq.builtCourseId && (
                        <button onClick={() => router.push(`/admin/courses?courseId=${inq.builtCourseId}&tab=setup`)} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"><Wrench className="w-3.5 h-3.5"/>Manage</button>
                      )}
                      {['building', 'live', 'rejected'].includes(inq.status) && (
                        <button onClick={() => deleteInquiry(inq.id, inq.courseName)} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5"/></button>
                      )}
                      <button onClick={() => setExpanded(expanded === inq.id ? null : inq.id)} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors">
                        {expanded === inq.id ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                      </button>
                    </div>
                  </div>

                  {approveResults[inq.id] && (() => {
                    const res = approveResults[inq.id];
                    const isDetails = !!res.detailsLink;
                    const rows: [string, string][] = isDetails
                      ? [['Setup Sheet Link', res.detailsLink as string]]
                      : [['Temp Password', res.tempPassword || ''], ['Setup Link', res.setupLink || '']];
                    const failed = res.emailSent === false;
                    const bannerCls = 'px-5 pb-4 border-t ' + (failed ? 'bg-red-500/5 border-red-500/20' : 'bg-emerald-500/5 border-emerald-500/20');
                    const msgCls = 'text-xs font-semibold mb-2 mt-3 ' + (failed ? 'text-red-400' : 'text-emerald-400');
                    const msg = failed
                      ? ('Warning: ' + (isDetails ? 'Setup-sheet email failed' : 'Welcome email failed') + ' (' + (res.emailError || 'unknown') + '). Share manually:')
                      : ('Done: ' + (isDetails ? 'Setup-sheet sent.' : 'Course built - welcome email sent.'));
                    return (
                      <div className={bannerCls}>
                        <div className={msgCls}>{msg}</div>
                        <div className="space-y-1.5">
                          {rows.map(([label, val]) => (
                            <div key={label} className="flex items-center gap-3 bg-gray-900 rounded-lg px-3 py-2 border border-gray-800">
                              <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
                              <span className="text-xs text-gray-200 font-mono flex-1 truncate">{val}</span>
                              <button onClick={() => navigator.clipboard.writeText(val)} className="text-gray-600 hover:text-emerald-400 transition-colors" title="Copy"><Copy className="w-3.5 h-3.5"/></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {expanded === inq.id && (
                    <div className="px-5 pb-5 border-t border-gray-800 pt-4 space-y-4">
                      {showWizard && (
                        <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3">
                          <div>
                            <div className="text-xs font-semibold text-blue-300">Build course from this inquiry</div>
                            <div className="text-[10px] text-blue-400/60 mt-0.5">Opens the wizard pre-filled with this inquiry's data</div>
                          </div>
                          <button onClick={() => router.push(wizardUrl)}
                            className="flex items-center gap-1.5 text-xs font-bold text-blue-300 hover:text-white bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                            Open Wizard <ArrowUpRight className="w-3.5 h-3.5"/>
                          </button>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2.5 text-sm">
                        {([
                          ['Phone', inq.phone],
                          ['Website', inq.website || '—'],
                          ['Booking method', inq.currentBookingMethod || '—'],
                          ['Tee times/day', String(inq.teeTimesPerDay || '—')],
                          ['Green fees', inq.greenFeeRange || '—'],
                        ] as [string,string][]).map(([label, val]) => (
                          <div key={label} className="bg-gray-800/50 rounded-lg px-3 py-2">
                            <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                            <div className="text-gray-200 font-medium text-sm">{val}</div>
                          </div>
                        ))}
                        {inq.lookingFor?.length > 0 && (
                          <div className="col-span-2 bg-gray-800/50 rounded-lg px-3 py-2">
                            <div className="text-xs text-gray-500 mb-0.5">Looking for</div>
                            <div className="text-gray-200 font-medium text-sm">{inq.lookingFor.join(', ')}</div>
                          </div>
                        )}
                        {inq.additionalNotes && (
                          <div className="col-span-2 bg-gray-800/50 rounded-lg px-3 py-2">
                            <div className="text-xs text-gray-500 mb-0.5">Additional notes</div>
                            <div className="text-gray-200 text-sm">{inq.additionalNotes}</div>
                          </div>
                        )}
                        {inq.pricingNotes && (
                          <div className="col-span-2 bg-gray-800/50 rounded-lg px-3 py-2">
                            <div className="text-xs text-gray-500 mb-0.5">Pricing notes</div>
                            <div className="text-gray-200 text-sm">{inq.pricingNotes}</div>
                          </div>
                        )}
                      </div>

                      {inq.needsJson && (() => {
                        let n: Record<string, unknown> = {};
                        try { n = JSON.parse(inq.needsJson || ''); } catch { /* ignore */ }
                        if (Object.keys(n).length === 0) return null;
                        return (
                          <div className="border-t border-gray-800 pt-4">
                            <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">What They Need</div>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(n).map(([k, v]) => (
                                <div key={k} className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                                  <div className="text-xs text-amber-600 mb-0.5">{k}</div>
                                  <div className="text-amber-200 text-sm font-medium">{String(v)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {inq.detailsJson && (() => {
                        let d: Record<string, unknown> = {};
                        try { d = JSON.parse(inq.detailsJson || ''); } catch { /* ignore */ }
                        if (Object.keys(d).length === 0) return null;
                        const sch = d.schedule as Record<string, unknown> | undefined;
                        const rest = Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'schedule'));
                        return (
                          <div className="border-t border-gray-800 pt-4 space-y-3">
                            <div className="text-xs font-semibold text-teal-400 uppercase tracking-wide">Setup Sheet Submitted</div>
                            {sch && (sch.greenFeeWeekday || sch.greenFeeWeekend) && (
                              <div className="bg-teal-500/10 border border-teal-500/20 rounded-lg p-4">
                                <div className="text-teal-300 font-semibold text-sm mb-2">Proposed Tee Sheet</div>
                                <div className="text-gray-300 text-sm">
                                  {Array.isArray(sch.daysOfWeek) && (sch.daysOfWeek as number[]).length > 0
                                    ? (sch.daysOfWeek as number[]).map(dd => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dd]).join(', ')
                                    : 'Every day'} {' · '} {String(sch.startTime)}{'–'}{String(sch.endTime)} every {String(sch.intervalMinutes)}min
                                </div>
                                <div className="text-gray-500 text-xs mt-1">
                                  {'WD $' + String(sch.greenFeeWeekday||0) + ' / WE $' + String(sch.greenFeeWeekend||0) + ' · Cart $' + String(sch.cartFee||0) + (sch.memberRateWeekday ? ' · Member $' + String(sch.memberRateWeekday) : '') + (sch.residentRateWeekday ? ' · Resident $' + String(sch.residentRateWeekday) : '') + (sch.walkingAllowed ? ' · Walking' : '')}
                                </div>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(rest).filter(([, v]) => v !== '' && v !== null && !(Array.isArray(v) && v.length === 0)).map(([k, v]) => (
                                <div key={k} className="bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2">
                                  <div className="text-xs text-gray-500 mb-0.5">{k}</div>
                                  <div className="text-gray-200 text-sm">{Array.isArray(v) ? v.join(', ') : String(v)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="border-t border-gray-800 pt-4">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Internal Notes</div>
                        {inq.adminNotes && (
                          <pre className="text-xs text-gray-400 bg-gray-800/50 border border-gray-700/50 rounded-lg px-4 py-3 mb-3 whitespace-pre-wrap font-sans">{inq.adminNotes}</pre>
                        )}
                        <div className="flex gap-2">
                          <textarea value={noteTexts[inq.id] || ''} onChange={e => setNoteTexts(p => ({ ...p, [inq.id]: e.target.value }))} placeholder="Add a note..." rows={2}
                            className="flex-1 bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none placeholder-gray-600"/>
                          <button onClick={() => inquiryAction(inq.id, 'add_note', { note: noteTexts[inq.id] || '' })} disabled={!noteTexts[inq.id]?.trim() || processing === inq.id}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors self-start">Save</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visibleInqs.length === 0 && (
              <div className="text-gray-600 text-center py-20 text-sm">{emptyMsg}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
