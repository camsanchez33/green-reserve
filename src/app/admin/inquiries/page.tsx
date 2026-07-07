'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Copy,
  RefreshCw, Mail, Trash2, Wrench, Power, Search, ArrowUpRight, X,
} from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

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

const STATUS_DOT_MAP: Record<string, string> = {
  pending: 'warn', in_review: 'neutral', details_requested: 'neutral',
  details_submitted: 'neutral', building: 'warn', live: 'ok', rejected: 'bad',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', in_review: 'In Review', details_requested: 'Sheet Sent',
  details_submitted: 'Sheet In', building: 'Building', live: 'Live', rejected: 'Rejected',
};

const BOARD_COLS = [
  { key: 'pending', label: 'Pending', statuses: ['pending'] },
  { key: 'in_review', label: 'In Review', statuses: ['in_review'] },
  { key: 'details_requested', label: 'Sheet Sent', statuses: ['details_requested'] },
  { key: 'details_submitted', label: 'Sheet In', statuses: ['details_submitted'] },
  { key: 'building', label: 'Building', statuses: ['building'] },
];

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function daysAgo(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)); }

function InquiryCard({ inq, isSelected, isDragging, onSelect, onDragStart, onDragEnd }: {
  inq: Inquiry; isSelected: boolean; isDragging: boolean;
  onSelect: () => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const stageDays = daysAgo(inq.updatedAt || inq.createdAt);
  const stale = stageDays > 7;
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', inq.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={
        'rounded-md border p-3 mb-2 cursor-pointer transition-colors select-none ' +
        (isDragging ? 'opacity-40 ' : '') +
        (isSelected ? 'bg-pine/5 border-pine/30' : 'bg-white border-line hover:border-line-strong')
      }
    >
      <div className="font-medium text-ink text-[13px] leading-snug mb-1 truncate">{inq.courseName}</div>
      <div className="text-xs text-ink-muted mb-1 truncate">
        {inq.contactName}{inq.contactTitle ? ' · ' + inq.contactTitle : ''}
      </div>
      <div className="text-xs text-ink-faint mb-2">
        {inq.city}, {inq.state} · <span className="capitalize">{inq.courseType}</span>
      </div>
      {inq.lookingFor && inq.lookingFor.length > 0 && (
        <div className="text-[10px] text-ink-faint mb-2 truncate">
          {inq.lookingFor.slice(0, 3).join(' · ')}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-ink-faint">{fmtDate(inq.createdAt)}</span>
        <span className={
          'text-[10px] font-medium px-1.5 py-0.5 rounded border ' +
          (stale ? 'bg-bad/10 text-bad border-bad/20' : 'bg-paper text-ink-muted border-line')
        }>{stageDays}d</span>
      </div>
    </div>
  );
}

export default function InquiriesPage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [approveResults, setApproveResults] = useState<Record<string, ApproveResult>>({});
  const [noteTexts, setNoteTexts] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [search, setSearch] = useState('');

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

  async function inquiryAction(id: string, action: string, extraPayload: Record<string, unknown> = {}) {
    setProcessing(id);
    try {
      const r = await fetch('/api/admin/inquiries', {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ id, action, ...extraPayload }),
      });
      const text = await r.text();
      let d: Record<string, unknown> = {};
      try { d = JSON.parse(text); } catch { /* not json */ }
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

  async function deleteInquiry(id: string, name: string) {
    if (!confirm(`Permanently delete inquiry for "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/inquiries?id=${id}`, { method: 'DELETE', headers: H() });
    setInquiries(prev => prev.filter(i => i.id !== id));
    if (selectedId === id) setSelectedId(null);
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

  async function handleDrop(targetColKey: string) {
    if (!dragId) return;
    const inq = inquiries.find(i => i.id === dragId);
    if (!inq) { setDragId(null); return; }
    const STATUS_MAP: Record<string, string> = {
      pending: 'pending', in_review: 'in_review',
      details_requested: 'details_requested', details_submitted: 'details_submitted',
      building: 'building', archive: 'rejected',
    };
    const newStatus = STATUS_MAP[targetColKey];
    if (!newStatus || newStatus === inq.status) { setDragId(null); return; }
    if (newStatus === 'rejected' && !confirm(`Archive "${inq.courseName}" as rejected?`)) {
      setDragId(null); return;
    }
    await inquiryAction(inq.id, 'set_status', { newStatus });
    setDragId(null);
  }

  const q = search.toLowerCase().trim();
  const matchSearch = (inq: Inquiry) =>
    !q ||
    inq.courseName.toLowerCase().includes(q) ||
    inq.contactName.toLowerCase().includes(q) ||
    inq.email.toLowerCase().includes(q) ||
    inq.city.toLowerCase().includes(q);

  const selectedInq = selectedId ? (inquiries.find(i => i.id === selectedId) ?? null) : null;
  const archiveCards = inquiries.filter(i => ['live', 'rejected'].includes(i.status) && matchSearch(i));

  if (!adminReady) return null;

  return (
    <div className="bg-paper flex" style={{ height: '100vh', overflow: 'hidden', marginRight: selectedInq ? 480 : 0 }}>
      <AdminSidebar active="inquiries" pendingInquiries={pendingCount} />
      <div className="ml-56 flex-1 flex flex-col" style={{ height: '100vh', overflow: 'hidden' }}>

        {/* Header */}
        <div className="px-8 py-5 border-b border-line bg-white shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Course Inquiries</h1>
              <p className="text-sm text-ink-soft mt-0.5">
                {inquiries.filter(i => i.status === 'pending').length} pending · {inquiries.filter(i => i.status === 'live').length} live
              </p>
            </div>
            <button
              onClick={loadInquiries}
              disabled={loading}
              className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-paper border border-transparent hover:border-line transition-colors disabled:opacity-50"
            >
              <RefreshCw className={'w-4 h-4' + (loading ? ' animate-spin' : '')} />Refresh
            </button>
          </div>
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, email, city..."
              className="w-full bg-paper border border-line rounded-md pl-8 pr-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40"
            />
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 flex gap-3 px-8 py-5 overflow-x-auto overflow-y-hidden items-start">
          {BOARD_COLS.map(col => {
            const colCards = inquiries.filter(i => col.statuses.includes(i.status) && matchSearch(i));
            const isTarget = dragOverCol === col.key;
            return (
              <div
                key={col.key}
                onDragOver={e => { e.preventDefault(); setDragOverCol(col.key); }}
                onDrop={() => { handleDrop(col.key); setDragOverCol(null); }}
                onDragLeave={() => setDragOverCol(null)}
                className={'w-64 shrink-0 flex flex-col rounded-lg border transition-colors ' + (isTarget ? 'border-pine/50 bg-pine/5' : 'border-line bg-paper/50')}
                style={{ maxHeight: 'calc(100vh - 190px)' }}
              >
                <div className="px-3 py-2.5 flex items-center justify-between border-b border-line shrink-0">
                  <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">{col.label}</span>
                  <span className="text-xs font-medium text-ink-muted bg-white rounded px-1.5 py-0.5 border border-line">{colCards.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {colCards.map(inq => (
                    <InquiryCard
                      key={inq.id}
                      inq={inq}
                      isSelected={selectedId === inq.id}
                      isDragging={dragId === inq.id}
                      onSelect={() => setSelectedId(selectedId === inq.id ? null : inq.id)}
                      onDragStart={() => setDragId(inq.id)}
                      onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                    />
                  ))}
                  {colCards.length === 0 && (
                    <div className="text-center py-8 text-[11px] text-ink-faint">
                      {isTarget ? 'Drop here' : (q ? 'No matches' : 'Empty')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Archive column */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOverCol('archive'); }}
            onDrop={() => { handleDrop('archive'); setDragOverCol(null); }}
            onDragLeave={() => setDragOverCol(null)}
            className={'w-64 shrink-0 flex flex-col rounded-lg border transition-colors ' + (dragOverCol === 'archive' ? 'border-bad/40 bg-bad/5' : 'border-line bg-paper/50')}
            style={{ maxHeight: 'calc(100vh - 190px)' }}
          >
            <button
              onClick={() => setArchiveExpanded(v => !v)}
              className="px-3 py-2.5 flex items-center justify-between border-b border-line shrink-0 w-full text-left"
            >
              <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted font-medium">Archive</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-ink-muted bg-white rounded px-1.5 py-0.5 border border-line">{archiveCards.length}</span>
                {archiveExpanded ? <ChevronUp className="w-3.5 h-3.5 text-ink-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-ink-muted" />}
              </div>
            </button>
            {archiveExpanded ? (
              <div className="flex-1 overflow-y-auto p-2">
                {archiveCards.map(inq => (
                  <InquiryCard
                    key={inq.id}
                    inq={inq}
                    isSelected={selectedId === inq.id}
                    isDragging={false}
                    onSelect={() => setSelectedId(selectedId === inq.id ? null : inq.id)}
                    onDragStart={() => {}}
                    onDragEnd={() => {}}
                  />
                ))}
                {archiveCards.length === 0 && (
                  <div className="text-center py-8 text-[11px] text-ink-faint">{q ? 'No matches' : 'Empty'}</div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-[11px] text-ink-faint">
                {dragOverCol === 'archive' ? 'Drop to archive (reject)' : 'Click to expand'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedInq && (
        <div className="fixed right-0 top-0 bottom-0 w-[480px] bg-white border-l border-line z-40 flex flex-col shadow-xl">

          {/* Panel header */}
          <div className="px-5 py-4 border-b border-line shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-[17px] font-serif font-medium text-ink leading-snug">{selectedInq.courseName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <StatusDot status={STATUS_DOT_MAP[selectedInq.status] || 'neutral'} label={STATUS_LABEL[selectedInq.status] || selectedInq.status} />
                  <span className="text-xs text-ink-muted">{selectedInq.city}, {selectedInq.state}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-paper text-ink-muted hover:text-ink transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-5 py-3.5 border-b border-line shrink-0 flex flex-wrap gap-2">
            {selectedInq.status === 'pending' && (
              <>
                <button
                  onClick={() => inquiryAction(selectedInq.id, 'mark_in_review')}
                  disabled={processing === selectedInq.id}
                  className="bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                ><Clock className="w-3.5 h-3.5" />In Review</button>
                <button
                  onClick={() => { if (confirm('Reject this inquiry?')) inquiryAction(selectedInq.id, 'reject'); }}
                  disabled={processing === selectedInq.id}
                  className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                ><XCircle className="w-3.5 h-3.5" />Reject</button>
              </>
            )}
            {selectedInq.status === 'in_review' && (
              <>
                <button
                  onClick={() => { if (confirm('Send ' + selectedInq.contactName + ' the setup sheet?')) inquiryAction(selectedInq.id, 'request_details'); }}
                  disabled={processing === selectedInq.id}
                  className="bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                ><Mail className="w-3.5 h-3.5" />Send Sheet</button>
                <button
                  onClick={() => { if (confirm('Build ' + selectedInq.courseName + ' now without the sheet?')) buildAndConfigure(selectedInq); }}
                  disabled={processing === selectedInq.id}
                  className="text-ink-muted hover:text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border border-line hover:border-line-strong transition-colors"
                ><Wrench className="w-3 h-3" />Skip &amp; Build</button>
                <button
                  onClick={() => { if (confirm('Reject?')) inquiryAction(selectedInq.id, 'reject'); }}
                  disabled={processing === selectedInq.id}
                  className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                ><XCircle className="w-3.5 h-3.5" />Reject</button>
              </>
            )}
            {selectedInq.status === 'details_requested' && (
              <>
                <button
                  onClick={() => { if (confirm('Resend setup-sheet link?')) inquiryAction(selectedInq.id, 'resend_details'); }}
                  disabled={processing === selectedInq.id}
                  className="bg-paper hover:bg-line border border-line text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                ><Mail className="w-3.5 h-3.5" />Resend Sheet</button>
                <button
                  onClick={() => { if (confirm('Reject?')) inquiryAction(selectedInq.id, 'reject'); }}
                  disabled={processing === selectedInq.id}
                  className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                ><XCircle className="w-3.5 h-3.5" />Reject</button>
              </>
            )}
            {selectedInq.status === 'details_submitted' && (
              <>
                <button
                  onClick={() => { if (confirm('Build ' + selectedInq.courseName + '? Creates operator account.')) buildAndConfigure(selectedInq); }}
                  disabled={processing === selectedInq.id}
                  className="bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                ><CheckCircle className="w-3.5 h-3.5" />Build Course</button>
                <button
                  onClick={() => { if (confirm('Reject?')) inquiryAction(selectedInq.id, 'reject'); }}
                  disabled={processing === selectedInq.id}
                  className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                ><XCircle className="w-3.5 h-3.5" />Reject</button>
              </>
            )}
            {selectedInq.status === 'building' && (
              <>
                {selectedInq.builtCourseId && (
                  <button
                    onClick={() => router.push(`/admin/courses/${selectedInq.builtCourseId}`)}
                    className="bg-paper hover:bg-line border border-line text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                  ><Wrench className="w-3.5 h-3.5" />Manage Course</button>
                )}
                <button
                  onClick={() => { if (confirm('Resend welcome email?')) inquiryAction(selectedInq.id, 'resend_welcome'); }}
                  disabled={processing === selectedInq.id}
                  className="bg-paper hover:bg-line border border-line text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
                ><Mail className="w-3.5 h-3.5" />Resend Email</button>
                <button
                  onClick={() => { if (confirm('Set ' + selectedInq.courseName + ' LIVE?')) inquiryAction(selectedInq.id, 'mark_live'); }}
                  disabled={processing === selectedInq.id}
                  className="bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                ><Power className="w-3.5 h-3.5" />Go Live</button>
              </>
            )}
            {selectedInq.status === 'live' && selectedInq.builtCourseId && (
              <button
                onClick={() => router.push(`/admin/courses/${selectedInq.builtCourseId}`)}
                className="bg-paper hover:bg-line border border-line text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
              ><Wrench className="w-3.5 h-3.5" />Manage</button>
            )}
            {['building', 'live', 'rejected'].includes(selectedInq.status) && (
              <button
                onClick={() => deleteInquiry(selectedInq.id, selectedInq.courseName)}
                className="w-8 h-8 flex items-center justify-center text-ink-muted hover:text-bad hover:bg-bad/5 rounded-md transition-colors ml-auto"
                title="Delete"
              ><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>

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
                    ? `Email failed (${res.emailError || 'unknown'}). Share manually:`
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

            {/* Wizard link */}
            {!selectedInq.builtCourseId && !['building', 'live', 'rejected'].includes(selectedInq.status) && (() => {
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
                  >Open Wizard <ArrowUpRight className="w-3.5 h-3.5" /></button>
                </div>
              );
            })()}

            {/* Contact */}
            <div className="px-5 py-4 border-b border-line">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Contact</div>
              <div className="text-sm font-medium text-ink mb-0.5">
                {selectedInq.contactName}{selectedInq.contactTitle ? ' · ' + selectedInq.contactTitle : ''}
              </div>
              <a href={'mailto:' + selectedInq.email} className="text-sm text-pine hover:underline block">{selectedInq.email}</a>
              {selectedInq.phone && <div className="text-sm text-ink-muted mt-0.5">{selectedInq.phone}</div>}
            </div>

            {/* Fields */}
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

            {/* needsJson */}
            {selectedInq.needsJson && (() => {
              let n: Record<string, unknown> = {};
              try { n = JSON.parse(selectedInq.needsJson || ''); } catch { /* ignore */ }
              const entries = Object.entries(n).filter(([, v]) => v !== '' && v !== null);
              if (entries.length === 0) return null;
              return (
                <div className="px-5 py-4 border-b border-line">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-warn mb-2">What They Need</div>
                  <div className="grid grid-cols-2 gap-2">
                    {entries.map(([k, v]) => (
                      <div key={k} className="bg-warn/5 border border-warn/20 rounded-md px-3 py-2">
                        <div className="text-[10px] text-warn/80 mb-0.5">{k}</div>
                        <div className="text-warn text-sm font-medium">{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* detailsJson (setup sheet, read-only) */}
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

            {/* Admin notes */}
            <div className="px-5 py-4">
              <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Internal Notes</div>
              {selectedInq.adminNotes && (
                <pre className="text-xs text-ink-soft bg-paper border border-line rounded-md px-4 py-3 mb-3 whitespace-pre-wrap font-sans">{selectedInq.adminNotes}</pre>
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
                >Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
