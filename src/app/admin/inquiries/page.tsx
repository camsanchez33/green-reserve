'use client';
import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, Search, Trash2, ChevronRight, ArchiveRestore, RotateCcw } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { EmptyState } from '@/components/EmptyState';
import {
  FUNNEL_SEGMENTS, ARCHIVED_STATUSES, ACTIVE_STATUSES, ALIVE_STATUSES, KNOWN_STATUSES,
  STATUS_DOT_MAP, STATUS_LABEL, stageEnteredAt, daysSince, queueSignal, compareQueue,
  type QueueSignal,
} from '@/lib/inquiry-status';

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
  // MP-3 growth columns, put to work in MP-4c.
  source?: string | null; closedReason?: string | null;
  snoozeUntil?: string | null; nextFollowUpAt?: string | null;
  detailsToken?: string | null; detailsJson?: string; needsJson?: string;
  events: InquiryStatusEvent[];
}

// MP-4b: this page is a WORK QUEUE, not a CRM browser. It used to be three UIs
// stapled together — a queue, a tabbed record browser with four filters and
// four sorts with per-tab memory, and a records console — five control layers
// over one row of data, at a volume where none of them earned their keep.
//
// Now: the funnel strip on top narrows the queue (click a stage, click it
// again to clear); the body is the ranked queue, split by whose move it is so
// nothing an inquiry is waiting on is invisible; "All" and "Closed" are footer
// links, not peers of the work.
//
// The `?tab=` param keeps its old name and its old values on purpose — the
// Overview deep-links (?tab=new, ?tab=sheet-sent, ?tab=building, ?tab=live)
// and any bookmark keep working. 'your-move' and '' both mean the whole queue.
const SEGMENT_KEYS = FUNNEL_SEGMENTS.map(s => s.key) as string[];
const VIEW_ALL = 'all';
const VIEW_CLOSED = 'archived';

const SEGMENT_HINT: Record<string, string> = {
  'new': 'Just submitted — not yet reviewed.',
  'in-review': "You're evaluating these.",
  'sheet-sent': 'Setup sheet sent — waiting on the course.',
  'sheet-in': 'Sheet is back — review and build.',
  'building': 'Draft created — being built and reviewed before go-live.',
  'live': 'Converted wins — successfully launched.',
};

const PAGE_SIZE = 50;
// A section that runs longer than this is a signal in itself — show the top
// slice and say how many are behind it rather than rendering a wall.
const SECTION_CAP = 50;

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
// MP-4a: time in the CURRENT stage, derived from the event ledger. This used
// to read updatedAt, which any write bumps — saving an admin note on a
// three-week-old stalled inquiry made it read "0d" and dropped it out of the
// stale filter and the longest-in-stage sort.
const stageStart = (inq: Inquiry) => stageEnteredAt(inq.status, inq.createdAt, inq.events);
const stageDays = (inq: Inquiry) => daysSince(stageStart(inq));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasBadEmail = (inq: Inquiry) => !!inq.email && !EMAIL_RE.test(inq.email.trim());
const segmentOf = (status: string) => SEGMENT_KEYS.find(k => {
  const seg = FUNNEL_SEGMENTS.find(s => s.key === k)!;
  return (seg.statuses as readonly string[]).includes(status);
}) || null;

function whyArchived(inq: Inquiry): { reason: string; date: string } {
  if (inq.status === 'live') return { reason: 'Went live', date: stageStart(inq).toISOString() };
  // MP-4c: Reject captures a reason now, so "why do we lose leads" has an
  // answer on the row instead of only in someone's memory.
  if (inq.status === 'rejected') {
    return { reason: inq.closedReason ? `Rejected · ${inq.closedReason}` : 'Rejected', date: stageStart(inq).toISOString() };
  }
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
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [backfillRan, setBackfillRan] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPreview, setBulkPreview] = useState<{ kind: 'send_sheet' | 'archive'; ids: string[] } | null>(null);
  const [bulkConfirmText, setBulkConfirmText] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reconcileRan, setReconcileRan] = useState(false);
  const [reconcileResult, setReconcileResult] = useState('');

  const rawTab = searchParams.get('tab') || '';
  const [tab, setTab] = useState(
    rawTab === VIEW_ALL || rawTab === VIEW_CLOSED || SEGMENT_KEYS.includes(rawTab) ? rawTab : ''
  );
  const view: 'queue' | 'all' | 'closed' =
    tab === VIEW_ALL ? 'all' : tab === VIEW_CLOSED ? 'closed' : 'queue';
  const stage = view === 'queue' && SEGMENT_KEYS.includes(tab) ? tab : null;

  const H = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  // MP-2b: inquiries became SUPPORT_PLUS in MP-2, and this had no else branch —
  // a viewer saw an empty pipeline and was told nothing.
  const loadInquiries = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/inquiries', { headers: H() });
      if (r.ok) { setInquiries(await r.json()); setLoadError(''); }
      else {
        setInquiries([]);
        setLoadError(r.status === 403 ? 'Inquiries require support access.'
          : r.status === 401 ? 'Your session ended — sign in again.'
          : 'Could not load inquiries. Try again.');
      }
    } catch {
      setInquiries([]);
      setLoadError('Network error loading inquiries. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [H]);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login?reason=session_ended'); return; }
      setAdminReady(true);
    }).catch(() => router.push('/admin/login?reason=session_ended'));
  }, [router]);

  useEffect(() => {
    if (adminReady) loadInquiries();
  }, [adminReady, loadInquiries]);

  // One-time backfill on first visit to Closed
  useEffect(() => {
    if (view !== 'closed' || backfillRan || !adminReady) return;
    setBackfillRan(true);
    fetch('/api/admin/backfill-orphaned-inquiries', { method: 'POST', headers: H() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.fixed > 0) loadInquiries(); })
      .catch(() => {});
  }, [view, backfillRan, adminReady, H, loadInquiries]);

  // One-time LIFECYCLE PARITY LAW reconciliation sweep (RUN_QUEUE item 6.6)
  // — also triggered by the first visit to Closed, prints exactly what it
  // changed (never a silent rewrite of history).
  useEffect(() => {
    if (view !== 'closed' || reconcileRan || !adminReady) return;
    setReconcileRan(true);
    fetch('/api/admin/reconcile-lifecycle-pairs', { method: 'POST', headers: H() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.fixed > 0) {
          setReconcileResult(`Reconciled ${d.fixed} out-of-parity pair${d.fixed === 1 ? '' : 's'}: ${d.changes.map((c: { action: string }) => c.action).join('; ')}`);
          loadInquiries();
        }
      })
      .catch(() => {});
  }, [view, reconcileRan, adminReady, H, loadInquiries]);

  // DELETION DOCTRINE (RUN_QUEUE): only reachable for UNBUILT inquiries
  // (gated at the call site below) — the server refuses regardless if this
  // is ever somehow called on a built one (lifecycle.ts). Typed confirm
  // required: trimmed + case-insensitive, matching what the server itself
  // compares against, so this can never disagree with the API about what
  // "matches."
  async function deleteInquiry(id: string, name: string, confirmText: string) {
    setDeleteError('');
    setDeleteBusy(true);
    try {
      const r = await fetch('/api/admin/inquiries?id=' + id + '&confirmName=' + encodeURIComponent(confirmText), { method: 'DELETE', headers: H() });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setDeleteError(`Delete failed for "${name}": ${d.error || 'unknown error'}`);
        setDeleteBusy(false);
        return;
      }
      // Optimistic removal ONLY after a confirmed success — no-silent-failures:
      // a failed delete (e.g. name mismatch) must never make the row silently
      // vanish from this view while it is still in the DB.
      setInquiries(prev => prev.filter(i => i.id !== id));
      setDeleteTarget(null);
      setDeleteConfirmText('');
    } catch {
      setDeleteError(`Delete failed for "${name}": network error`);
    }
    setDeleteBusy(false);
  }

  // A-02d: Closed's only actions are Restore and Permanently delete — both
  // route through the same lifecycle service the courses tab uses (LIFECYCLE
  // PARITY LAW), never a one-sided status flip.
  async function restoreInquiry(inq: Inquiry) {
    setDeleteError('');
    try {
      await doRestore(inq);
    } catch {
      setDeleteError(`Restore failed for "${inq.courseName}": network error — nothing was changed. Check your connection and try again.`);
    }
  }

  async function doRestore(inq: Inquiry) {
    if (inq.builtCourseId) {
      const r = await fetch('/api/admin/archive-course', {
        method: 'POST', headers: H(), body: JSON.stringify({ courseId: inq.builtCourseId, action: 'restore' }),
      });
      if (r.ok) { await loadInquiries(); return; }
      const d = await r.json().catch(() => ({}));
      setDeleteError(`Restore failed for "${inq.courseName}": ${d.error || 'unknown error'}`);
      return;
    }
    // No linked course (rejected before ever building) — reopen the inquiry
    // itself. The dedicated 'restore' action computes the target stage
    // server-side from the event ledger, so the client never guesses it.
    const r = await fetch('/api/admin/inquiries', {
      method: 'POST', headers: H(), body: JSON.stringify({ id: inq.id, action: 'restore' }),
    });
    if (r.ok) { await loadInquiries(); return; }
    const d = await r.json().catch(() => ({}));
    setDeleteError(`Restore failed for "${inq.courseName}": ${d.error || 'unknown error'}`);
  }

  function detailHref(inq: Inquiry) {
    const p = new URLSearchParams();
    if (tab) p.set('tab', tab);
    if (search) p.set('q', search);
    const qs = p.toString();
    return '/admin/inquiries/' + inq.id + (qs ? '?' + qs : '');
  }

  function goTo(nextTab: string) {
    setTab(nextTab);
    setPage(0);
    setSelected(new Set());
    const p = new URLSearchParams();
    if (nextTab) p.set('tab', nextTab);
    if (search) p.set('q', search);
    const qs = p.toString();
    window.history.replaceState(null, '', '/admin/inquiries' + (qs ? '?' + qs : ''));
  }

  // One signal per inquiry per render pass, from one `now` — two rows must
  // never be ranked against different clocks.
  const signals = useMemo(() => {
    const now = new Date();
    const m = new Map<string, QueueSignal>();
    for (const i of inquiries) m.set(i.id, queueSignal(i, now));
    return m;
  }, [inquiries]);
  const sig = (inq: Inquiry) => signals.get(inq.id) as QueueSignal;

  const q = search.toLowerCase().trim();
  const matchesSearch = (inq: Inquiry) => !q || (
    inq.courseName.toLowerCase().includes(q) ||
    inq.contactName.toLowerCase().includes(q) ||
    inq.email.toLowerCase().includes(q) ||
    inq.city.toLowerCase().includes(q)
  );
  const newestFirst = (a: Inquiry, b: Inquiry) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const byQueue = (a: Inquiry, b: Inquiry) => compareQueue(sig(a), sig(b));

  const visible = inquiries.filter(matchesSearch);

  // The queue body. With no stage selected it is the whole active pipeline
  // (live is a destination, not work); with one selected it narrows to that
  // stage — including Live, which has no "move" and so renders flat.
  const queueBase = visible.filter(i => stage
    ? segmentOf(i.status) === stage
    : (ACTIVE_STATUSES as readonly string[]).includes(i.status));
  const secYours = queueBase.filter(i => sig(i).yourMove).sort(byQueue);
  const secThem = queueBase.filter(i => !sig(i).yourMove && sig(i).waitingOn === 'them').sort(byQueue);
  const secSoon = queueBase.filter(i => !sig(i).yourMove && sig(i).waitingOn === 'us').sort(byQueue);
  const secSnoozed = queueBase.filter(i => sig(i).waitingOn === 'snoozed').sort(byQueue);
  const liveRows = stage === 'live' ? [...queueBase].sort(newestFirst) : [];

  const allRows = visible.filter(i => (ALIVE_STATUSES as readonly string[]).includes(i.status)).sort(newestFirst);
  const closedRows = visible.filter(i => (ARCHIVED_STATUSES as readonly string[]).includes(i.status)).sort(newestFirst);
  const flatRows = view === 'all' ? allRows : view === 'closed' ? closedRows : [];
  const totalPages = Math.max(1, Math.ceil(flatRows.length / PAGE_SIZE));
  const pagedFlat = flatRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [q]);

  const countForSegment = (key: string) => inquiries.filter(i => segmentOf(i.status) === key).length;
  const activeCount = inquiries.filter(i => (ACTIVE_STATUSES as readonly string[]).includes(i.status)).length;
  const needsYouCount = inquiries.filter(i => signals.get(i.id)?.yourMove).length;
  const liveAllTimeCount = inquiries.filter(i => i.status === 'live').length;
  const closedCount = inquiries.filter(i => (ARCHIVED_STATUSES as readonly string[]).includes(i.status)).length;
  const aliveCount = inquiries.filter(i => (ALIVE_STATUSES as readonly string[]).includes(i.status)).length;

  // A-02c/A-02d INVARIANT: every inquiry maps to exactly one funnel segment
  // (or is closed). If a future status is added and forgotten, this catches it
  // loudly instead of inquiries silently vanishing from the pipeline the way
  // "Sheet In" once did.
  const unmappedCount = inquiries.filter(i => !(KNOWN_STATUSES as readonly string[]).includes(i.status)).length;
  const funnelSum = SEGMENT_KEYS.reduce((sum, key) => sum + countForSegment(key), 0);
  const invariantBroken = unmappedCount > 0
    || funnelSum !== activeCount + liveAllTimeCount
    || aliveCount !== funnelSum
    || unmappedCount + aliveCount + closedCount !== inquiries.length;

  // Bulk lives with the work. Closed is a graveyard (row actions only) and the
  // All browse mixes live courses in, where a mis-aimed Archive is expensive.
  const canBulkSelect = view === 'queue' && stage !== 'live';
  const selectedRows = inquiries.filter(i => selected.has(i.id));
  const canSendSheet = selectedRows.length > 0 && selectedRows.every(i => i.status === 'pending');

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runBulkAction() {
    if (!bulkPreview) return;
    setBulkRunning(true);
    setBulkResult('');
    let ok = 0, failed = 0;
    const skipped: string[] = [];
    for (const id of bulkPreview.ids) {
      try {
        // A-02d: "archive" is pair-aware — an inquiry with a built course goes
        // through the LIFECYCLE PARITY LAW (archivePair, via
        // /api/admin/archive-course) so the course comes offline too; a
        // course-less inquiry has nothing to archive, so it is rejected
        // instead (the same "close it out" outcome the copy promises).
        const target = inquiries.find(i => i.id === id);
        const r = bulkPreview.kind === 'send_sheet'
          ? await fetch('/api/admin/inquiries', { method: 'POST', headers: H(), body: JSON.stringify({ id, action: 'request_details' }) })
          : target?.builtCourseId
            ? await fetch('/api/admin/archive-course', { method: 'POST', headers: H(), body: JSON.stringify({ courseId: target.builtCourseId, action: 'archive' }) })
            : await fetch('/api/admin/inquiries', { method: 'POST', headers: H(), body: JSON.stringify({ id, action: 'reject' }) });
        if (r.ok) { ok++; continue; }
        failed++;
        // MP-5b: archiving a course with standing bookings is refused rather
        // than done silently. "1 failed" with no reason would send the founder
        // hunting; name the course and say what to do instead.
        const d = await r.json().catch(() => ({}));
        if (d.needsBookingDecision) skipped.push(target?.courseName || id);
      } catch { failed++; }
    }
    setBulkRunning(false);
    const skippedNote = skipped.length > 0
      ? ` ${skipped.join(', ')} still ${skipped.length === 1 ? 'has' : 'have'} upcoming bookings — archive ${skipped.length === 1 ? 'it' : 'them'} from the course page, where you can cancel and notify the golfers.`
      : '';
    setBulkResult(`${ok} succeeded${failed > 0 ? `, ${failed} failed` : ''}.${skippedNote}`);
    setSelected(new Set());
    await loadInquiries();
  }

  if (!adminReady) return null;

  const renderRow = (inq: Inquiry, mode: 'queue' | 'flat' | 'closed') => {
    const dot = (STATUS_DOT_MAP[inq.status] || 'neutral') as 'ok' | 'bad' | 'warn' | 'neutral';
    const s = sig(inq);
    const days = stageDays(inq);
    const overdue = mode === 'queue' && s.pressureDays > 0;
    const closed = mode === 'closed' ? whyArchived(inq) : null;
    const selectable = canBulkSelect && mode === 'queue';

    return (
      <Link
        key={inq.id}
        href={detailHref(inq)}
        className="bg-white border border-line rounded-lg px-5 py-3.5 flex items-center gap-4 hover:border-pine/30 hover:bg-pine/[0.02] transition-colors"
      >
        {selectable && (
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
        <div className="w-48 shrink-0 min-w-0">
          <div className="text-sm font-medium text-ink truncate flex items-center gap-1.5">
            <span className="truncate">{inq.courseName}</span>
            {s.resubmits > 0 && (
              <span title="Submitted the interest form again while already in the pipeline" className="shrink-0">
                <RotateCcw className="w-3 h-3 text-warn" />
              </span>
            )}
          </div>
          <div className="text-xs text-ink-muted truncate">{inq.city}, {inq.state}</div>
        </div>

        {/* Why it is here (queue) or who it is (browse) */}
        <div className="flex-1 min-w-0">
          {mode === 'queue' && (
            <div className="text-xs text-ink-soft truncate">{s.reason}</div>
          )}
          {mode !== 'queue' && (
            <div className="text-xs text-ink-soft truncate">
              {inq.contactName}{inq.contactTitle ? ' · ' + inq.contactTitle : ''}
            </div>
          )}
          <div className="text-[10px] text-ink-faint truncate flex items-center gap-1.5">
            {inq.email}
            {hasBadEmail(inq) && (
              <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide bg-warn/10 text-warn px-1.5 py-0.5 rounded-full">Bad email</span>
            )}
          </div>
        </div>

        {/* Stage + days-in-stage, or why/how it closed */}
        <div className="shrink-0 text-right hidden lg:block min-w-[110px]">
          {closed && (
            <>
              <div className="text-xs text-ink-soft">{closed.reason}</div>
              <div className="text-[10px] text-ink-faint">{fmtDate(closed.date)}</div>
            </>
          )}
          {!closed && (
            <>
              <div className="text-xs text-ink-soft">{STATUS_LABEL[inq.status] || inq.status}</div>
              <div className={'text-[10px] font-medium ' + (overdue ? 'text-bad' : 'text-ink-faint')}>{days}d in stage</div>
            </>
          )}
        </div>

        {/* Submitted date */}
        <div className="shrink-0 text-xs text-ink-faint hidden xl:block w-24 text-right">
          {fmtDate(inq.createdAt)}
        </div>

        {/* Closed view: Restore, and Permanently delete ONLY for inquiries that
            never became a course (DELETION DOCTRINE) — built ones are
            archive-only. */}
        {mode === 'closed' && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); restoreInquiry(inq); }}
              className="w-7 h-7 flex items-center justify-center rounded text-ink-faint hover:text-ok hover:bg-ok/5 transition-colors"
              title="Restore"
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
            </button>
            {!inq.builtCourseId && (
              <button
                onClick={e => { e.preventDefault(); e.stopPropagation(); setDeleteTarget({ id: inq.id, name: inq.courseName }); setDeleteConfirmText(''); }}
                className="w-7 h-7 flex items-center justify-center rounded text-ink-faint hover:text-bad hover:bg-bad/5 transition-colors"
                title="Delete permanently"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </Link>
    );
  };

  const renderSection = (title: string, hint: string, rows: Inquiry[]) => {
    if (rows.length === 0) return null;
    const shown = rows.slice(0, SECTION_CAP);
    const allShownSelected = shown.every(i => selected.has(i.id));
    const toggleSection = () => setSelected(prev => {
      const next = new Set(prev);
      if (allShownSelected) shown.forEach(i => next.delete(i.id));
      else shown.forEach(i => next.add(i.id));
      return next;
    });
    return (
      <div key={title}>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{title}</span>
          <span className="text-[11px] text-ink-faint">{rows.length} · {hint}</span>
          {canBulkSelect && (
            <button onClick={toggleSection} className="ml-auto text-[11px] text-ink-faint hover:text-ink transition-colors">
              {allShownSelected ? 'Clear' : 'Select all'}
            </button>
          )}
        </div>
        <div className="space-y-1.5">{shown.map(r => renderRow(r, 'queue'))}</div>
        {rows.length > SECTION_CAP && (
          <p className="mt-2 text-[11px] text-ink-faint">
            Showing the top {SECTION_CAP} of {rows.length} — narrow it with search or a stage.
          </p>
        )}
      </div>
    );
  };

  const queueEmpty = secYours.length === 0 && secThem.length === 0 && secSoon.length === 0 && secSnoozed.length === 0;
  const stageLabel = stage ? (FUNNEL_SEGMENTS.find(s => s.key === stage)?.label || stage) : '';

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="inquiries" />
      <div className="admin-content flex-1 flex flex-col min-h-screen">
        <div className="px-8 py-7">

          {/* Title + pipeline summary, search + refresh */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Inquiries</h1>
              <p className="text-sm text-ink-soft mt-0.5">
                {activeCount} active · {needsYouCount} needs you · {liveAllTimeCount} live all-time · {closedCount} closed
              </p>
              {invariantBroken && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-white bg-bad rounded-md px-2 py-1">
                  {unmappedCount > 0
                    ? `${unmappedCount} inquir${unmappedCount === 1 ? 'y' : 'ies'} unmapped — status not recognized by the funnel`
                    : 'Counts don’t add up — alive + closed should equal the total, but doesn’t'}
                </p>
              )}
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

          {/* Funnel strip — a filter, not a tab bar. The body below is always
              the queue; clicking a stage narrows it, clicking it again clears. */}
          <div className="flex items-center gap-0.5 flex-wrap border-b border-line pb-3 mb-4">
            {SEGMENT_KEYS.map((key, i) => {
              const seg = FUNNEL_SEGMENTS.find(s => s.key === key)!;
              const count = countForSegment(key);
              const active = key === stage;
              const idle = count === 0 ? 'border-transparent text-ink-faint/60 hover:text-ink-muted' : 'border-transparent text-ink-muted hover:text-ink';
              return (
                <div key={key} className="flex items-center">
                  <button
                    onClick={() => goTo(active ? '' : key)}
                    title={SEGMENT_HINT[key]}
                    className={
                      'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ' +
                      (active ? 'border-pine text-pine' : idle)
                    }
                  >
                    {seg.label}
                    <span className={
                      'text-[10px] font-medium rounded-full px-1.5 py-0.5 min-w-[18px] text-center ' + (
                        active ? 'bg-pine/15 text-pine'
                        : count > 0 ? 'bg-line-strong text-ink-muted' : 'text-ink-faint'
                      )
                    }>
                      {count}
                    </span>
                  </button>
                  {i < SEGMENT_KEYS.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-ink-faint shrink-0"/>}
                </div>
              );
            })}
            {stage && (
              <button onClick={() => goTo('')} className="ml-3 text-xs text-ink-faint hover:text-ink transition-colors">
                Clear stage
              </button>
            )}
          </div>

          {/* Bulk action bar */}
          {canBulkSelect && selected.size > 0 && (
            <div className="flex items-center gap-3 bg-pine/5 border border-pine/20 rounded-lg px-4 py-2.5 mb-3 text-sm">
              <span className="font-medium text-ink">{selected.size} selected</span>
              {canSendSheet && (
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
          {deleteError && (
            <div className="bg-bad/5 border border-bad/20 rounded-lg px-4 py-2.5 mb-3 text-sm text-bad flex items-center justify-between">
              {deleteError}
              <button onClick={() => setDeleteError('')} className="text-bad/60 hover:text-bad">Dismiss</button>
            </div>
          )}
          {reconcileResult && (
            <div className="bg-warn/5 border border-warn/20 rounded-lg px-4 py-2.5 mb-3 text-sm text-warn flex items-center justify-between gap-3">
              <span>{reconcileResult}</span>
              <button onClick={() => setReconcileResult('')} className="text-warn/60 hover:text-warn shrink-0">Dismiss</button>
            </div>
          )}

          {loading && <div className="py-20 text-center text-ink-muted text-sm">Loading...</div>}
          {!loading && loadError && (
            <div className="rounded-lg border border-bad/20 bg-bad/5 px-5 py-6 text-center">
              <p className="text-sm text-bad mb-3">{loadError}</p>
              <button onClick={() => loadInquiries()} className="text-xs font-medium text-ink-soft hover:text-ink px-3 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">Retry</button>
            </div>
          )}

          {/* THE QUEUE — ranked, split by whose move it is. Every active
              inquiry lands in exactly one of these three, so none can be
              invisible the way waiting-on-them ones used to be. */}
          {!loading && !loadError && view === 'queue' && stage !== 'live' && (
            <div className="space-y-6">
              {renderSection('Your move', 'needs you now — most overdue first', secYours)}
              {renderSection('Waiting on the course', 'sent, not answered yet', secThem)}
              {renderSection('No action due yet', 'yours to work, still inside its window', secSoon)}
              {renderSection('Snoozed', 'deliberately parked — they come back on their date', secSnoozed)}
              {queueEmpty && (
                <EmptyState message={q ? 'No results — clear your search' : stage ? `Nothing in ${stageLabel}.` : 'Queue is clear — nothing is waiting.'} />
              )}
            </div>
          )}

          {/* Live is a destination, not work — no move to rank. */}
          {!loading && !loadError && view === 'queue' && stage === 'live' && (
            <div className="space-y-1.5">
              {liveRows.length === 0 && <EmptyState message={q ? 'No results — clear your search' : 'No courses have gone live yet.'} />}
              {liveRows.map(r => renderRow(r, 'flat'))}
            </div>
          )}

          {!loading && !loadError && view === 'all' && (
            <div className="space-y-1.5">
              {pagedFlat.length === 0 && <EmptyState message={q ? 'No results — clear your search' : 'No inquiries yet.'} />}
              {pagedFlat.map(r => renderRow(r, 'flat'))}
            </div>
          )}

          {/* A-02d: Closed is a managed graveyard, not a dump — grouped
              Rejected vs Archived so the two very different "how it ended"
              stories never blur together. */}
          {!loading && !loadError && view === 'closed' && (() => {
            const rejectedRows = pagedFlat.filter(i => i.status === 'rejected');
            const archivedOnly = pagedFlat.filter(i => i.status === 'archived');
            if (pagedFlat.length === 0) {
              return <EmptyState message={q ? 'No results — clear your search' : 'Nothing closed out yet.'} />;
            }
            return (
              <div className="space-y-5">
                {rejectedRows.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Rejected ({rejectedRows.length})</div>
                    <div className="space-y-1.5">{rejectedRows.map(r => renderRow(r, 'closed'))}</div>
                  </div>
                )}
                {archivedOnly.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2">Archived ({archivedOnly.length})</div>
                    <div className="space-y-1.5">{archivedOnly.map(r => renderRow(r, 'closed'))}</div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Pagination — only the flat browse views paginate; the queue is
              capped per section instead. */}
          {!loading && view !== 'queue' && flatRows.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 text-xs text-ink-muted">
              <span>Page {page + 1} of {totalPages} · {flatRows.length} total</span>
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

          {/* Records, demoted out of the work. */}
          {!loading && (
            <div className="mt-8 pt-4 border-t border-line-soft flex items-center gap-4 text-xs">
              {view !== 'queue' && (
                <button onClick={() => goTo('')} className="text-pine hover:text-pine-hover font-medium transition-colors">
                  Back to the queue
                </button>
              )}
              <button
                onClick={() => goTo(VIEW_ALL)}
                className={'transition-colors ' + (view === 'all' ? 'text-ink font-medium' : 'text-ink-muted hover:text-ink')}
              >
                All active ({aliveCount})
              </button>
              <button
                onClick={() => goTo(VIEW_CLOSED)}
                className={'transition-colors ' + (view === 'closed' ? 'text-ink font-medium' : 'text-ink-muted hover:text-ink')}
              >
                Closed ({closedCount})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action preview + confirm modal */}
      {bulkPreview && (() => {
        const targets = inquiries.filter(i => bulkPreview.ids.includes(i.id));
        const isArchive = bulkPreview.kind === 'archive';
        const withCourse = targets.filter(t => !!t.builtCourseId).length;
        const canConfirm = !isArchive || bulkConfirmText.trim().toUpperCase() === 'ARCHIVE';
        return (
          <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-lg border border-line max-w-md w-full p-5">
              <div className="text-sm font-medium text-ink mb-1">
                {isArchive ? `Archive ${targets.length} inquir${targets.length === 1 ? 'y' : 'ies'}?` : `Send setup sheet to ${targets.length} contact${targets.length === 1 ? '' : 's'}?`}
              </div>
              <p className="text-xs text-ink-muted mb-3">
                {isArchive
                  ? (withCourse > 0
                    ? `Closes each out. ${withCourse} of these have a built course — archiving takes that course offline too (restorable). The rest have no course yet, so they're marked rejected. Nothing is deleted, and no email is sent. A course with upcoming golfer bookings is skipped here — close it from its own page, where you can cancel and notify them.`
                    : 'Marks each as rejected/closed. Nothing is deleted, and no email is sent — reject an inquiry on its own page if the course should be told.')
                  : 'Sends the setup-sheet email to each recipient below.'}
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1 mb-4 bg-paper border border-line rounded-md p-2">
                {targets.map(t => (
                  <div key={t.id} className="text-xs text-ink-soft flex justify-between gap-2">
                    <span className="truncate">{t.courseName}</span>
                    {isArchive && t.builtCourseId && <span className="text-warn shrink-0">+ course</span>}
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

      {/* Permanently delete — unbuilt inquiries only (DELETION DOCTRINE).
          Typed confirm, trimmed + case-insensitive, matching the server. */}
      {deleteTarget && (() => {
        const matches = deleteConfirmText.trim().toLowerCase() === deleteTarget.name.trim().toLowerCase();
        return (
          <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-lg border border-line max-w-md w-full p-5">
              <div className="text-sm font-medium text-ink mb-1">Permanently delete &quot;{deleteTarget.name}&quot;?</div>
              <p className="text-xs text-ink-muted mb-3">This cannot be undone — the inquiry and its history are gone for good.</p>
              <label className="block text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Type &quot;{deleteTarget.name}&quot; to confirm</label>
              <input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                className="w-full bg-paper border border-bad/30 rounded-md px-3 py-2 text-sm outline-none focus:border-bad/50 mb-4"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}
                  className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteInquiry(deleteTarget.id, deleteTarget.name, deleteConfirmText)}
                  disabled={!matches || deleteBusy}
                  className="text-xs font-medium px-3 py-1.5 rounded-md text-white bg-bad hover:bg-bad/90 transition-colors disabled:opacity-40"
                >
                  {deleteBusy ? 'Deleting…' : 'Delete permanently'}
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
