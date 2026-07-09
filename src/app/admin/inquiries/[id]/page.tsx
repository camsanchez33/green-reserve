'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Mail, Wrench, Power, CheckCircle, Clock, Trash2, ChevronDown,
  XCircle, ArrowUpRight, Copy, Archive, Pencil, Save, RefreshCw,
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
interface ApproveResult {
  tempPassword?: string; setupLink?: string; detailsLink?: string;
  emailSent?: boolean; emailError?: string;
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
  const lastEvent = inq.events.length > 0 ? inq.events[inq.events.length - 1] : null;
  const actorName = lastEvent?.actorName || '';
  if (actorName.toLowerCase().includes('permanently deleted')) return { reason: 'Course deleted', date: lastEvent?.createdAt || inq.updatedAt || inq.createdAt };
  if (actorName.toLowerCase().includes('archived')) return { reason: 'Course archived', date: lastEvent?.createdAt || inq.updatedAt || inq.createdAt };
  return { reason: 'Archived', date: inq.updatedAt || inq.createdAt };
}

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10 focus:outline-none transition-colors';

const NEEDS_LABELS: Record<string, string> = {
  residentRates: 'Resident rates', hasMemberships: 'Memberships / season passes',
  roundsPerMonth: 'Rounds per month', publicTeeTimes: 'Non-member tee times',
  memberCount: 'Member count', outsideOutings: 'Outside outings',
  memberBookingToday: 'Current booking method', chargesMembersPerRound: 'Charges per round',
};
const NEEDS_VALUES: Record<string, string> = {
  yes: 'Yes', no: 'No', yes_regularly: 'Yes, regularly', limited: 'Limited windows',
  no_members_only: 'No, members only', under_100: 'Under 100', '100_300': '100–300',
  '300_plus': '300+', under_500: 'Under 500', '500_1500': '500–1,500',
  '1500_3000': '1,500–3,000', '3000_plus': '3,000+',
  pro_shop_phone: 'Pro shop / phone', signup_sheet: 'Sign-up sheet',
  booking_software: 'Booking software', other: 'Other',
};
const DETAIL_LABELS: Record<string, string> = {
  holes: 'Holes', par: 'Par', seasonOpen: 'Season opens', seasonClose: 'Season closes',
  firstTeeTime: 'First tee', lastTeeTime: 'Last tee', intervalMinutes: 'Interval',
  greenFeeWeekday: 'Weekday fee', greenFeeWeekend: 'Weekend fee', cartFee: 'Cart fee',
  twilightFee: 'Twilight fee', walkingAllowed: 'Walking',
  residentWeekday: 'Resident WD', residentWeekend: 'Resident WE', residentVerification: 'Residency check',
  starterTierName: 'Tier name', starterTierFee: 'Tier fee',
  memberAdvanceDays: 'Member advance', protectedTimes: 'Protected times',
  publicGreenFee: 'Public fee', publicWindow: 'Public window',
  memberRate: 'Member rate', outingsVolume: 'Outings frequency',
  cancellationHours: 'Cancel window', lateFee: 'Late cancel fee',
  facilities: 'Facilities', restaurantType: 'Restaurant',
  website: 'Website', description: 'Description', additionalNotes: 'Notes',
};

function InquiryDetailInner() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const searchParams = useSearchParams();

  const backTab = searchParams.get('tab') || 'active';
  const backSearch = searchParams.get('q') || '';
  const backSort = searchParams.get('sort') || '';
  const backUrl = '/admin/inquiries' + (backTab || backSearch || backSort
    ? '?' + new URLSearchParams(
        Object.fromEntries([
          backTab && ['tab', backTab],
          backSearch && ['q', backSearch],
          backSort && ['sort', backSort],
        ].filter(Boolean) as [string, string][])
      ).toString()
    : '');

  const [adminReady, setAdminReady] = useState(false);
  const [inq, setInq] = useState<Inquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'contact' | 'answers' | 'sheet' | 'activity'>('contact');
  const [editContact, setEditContact] = useState(false);
  const [contactEdits, setContactEdits] = useState<Record<string, string>>({});
  const [stageOverride, setStageOverride] = useState('');
  const [noteText, setNoteText] = useState('');
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(null);

  const H = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  const loadInquiry = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/admin/inquiries?id=${params.id}`, { headers: H() });
    if (r.ok) {
      const data = await r.json();
      setInq(data);
      setStageOverride(data.status);
    } else {
      router.push('/admin/inquiries');
    }
    setLoading(false);
  }, [params.id, H, router]);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push('/admin/login'); return; }
      setAdminReady(true);
    }).catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    if (adminReady) loadInquiry();
  }, [adminReady, loadInquiry]);

  // Auto-advance pending → in_review when page loads
  useEffect(() => {
    if (!inq || inq.status !== 'pending') return;
    fetch('/api/admin/inquiries', {
      method: 'PATCH', headers: H(),
      body: JSON.stringify({ id: inq.id, action: 'mark_opened' }),
    }).then(r => { if (r.ok) loadInquiry(); }).catch(() => {});
  }, [inq?.id, inq?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function action(act: string, extra: Record<string, unknown> = {}) {
    setProcessing(true);
    try {
      const r = await fetch('/api/admin/inquiries', {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ id: params.id, action: act, ...extra }),
      });
      const text = await r.text();
      let d: Record<string, unknown> = {};
      try { d = JSON.parse(text); } catch { /* ignore */ }
      if (r.ok) {
        if (['build_course', 'resend_welcome', 'request_details', 'resend_details'].includes(act)) {
          setApproveResult(d as ApproveResult);
        }
        if (act === 'mark_live' && d.emailSent === false) {
          alert(`Course is live, but the orientation email failed (${d.emailError || 'unknown error'}).`);
        }
        if (act === 'add_note') {
          setNoteText('');
        }
        await loadInquiry();
      } else {
        alert(`Failed (${r.status}): ${(d.error as string) || text.slice(0, 200)}`);
      }
    } catch (e) { alert(`Error: ${e}`); }
    setProcessing(false);
  }

  async function createDraftCourse() {
    setProcessing(true);
    try {
      const r = await fetch('/api/admin/inquiries', {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ id: params.id, action: 'create_draft_course' }),
      });
      const d = await r.json();
      if (!r.ok) { alert(`Failed: ${d.error || 'unknown error'}`); setProcessing(false); return; }
      if (d.courseId) router.push(`/admin/courses/${d.courseId}`);
    } catch (e) { alert(`Error: ${e}`); }
    setProcessing(false);
  }

  async function deleteInquiry() {
    if (!inq) return;
    if (!confirm(`Permanently delete inquiry for "${inq.courseName}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/inquiries?id=${inq.id}`, { method: 'DELETE', headers: H() });
    router.push(backUrl);
  }

  async function saveContact() {
    setProcessing(true);
    try {
      const r = await fetch('/api/admin/inquiries', {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ id: params.id, action: 'update_contact', ...contactEdits }),
      });
      if (r.ok) { setEditContact(false); await loadInquiry(); }
      else { alert('Could not save — please try again'); }
    } catch (e) { alert('Error: ' + e); }
    setProcessing(false);
  }

  if (!adminReady || loading) return null;
  if (!inq) return null;

  const isArchived = ARCHIVED_STATUSES.has(inq.status);
  const dot = (STATUS_DOT_MAP[inq.status] || 'neutral') as 'ok' | 'bad' | 'warn' | 'neutral';
  const days = daysAgo(inq.updatedAt || inq.createdAt);

  const wizardParams = new URLSearchParams({
    name: inq.courseName || '', city: inq.city || '', state: inq.state || '',
    zip: inq.zipCode || '', address: inq.address || '', website: inq.website || '',
    type: inq.courseType || 'public', contactName: inq.contactName || '',
    contactEmail: inq.email || '', inquiryId: inq.id,
  });

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="inquiries" />
      <div className="ml-56 flex-1 flex flex-col min-h-screen">

        {/* Page header */}
        <div className="px-8 py-6 border-b border-line bg-white shrink-0">
          {/* Back link */}
          <button
            onClick={() => router.push(backUrl)}
            className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink mb-4 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to inquiries
          </button>

          <div className="flex items-start gap-4">
            {/* Title area */}
            <div className="flex-1 min-w-0">
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink leading-snug">{inq.courseName}</h1>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <StatusDot status={dot} label={STATUS_LABEL[inq.status] || inq.status} />
                <span className="text-sm text-ink-muted">{inq.city}, {inq.state}</span>
                {!isArchived && (
                  <span className="text-sm text-ink-faint">{days}d in stage</span>
                )}
                {isArchived && inq.status !== 'live' && inq.status !== 'rejected' && (() => {
                  const { reason, date } = whyArchived(inq);
                  return (
                    <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <Archive className="w-3.5 h-3.5" />{reason} · {fmtDate(date)}
                    </span>
                  );
                })()}
              </div>
              {STAGE_EXPLAIN[inq.status] && (
                <p className="text-xs text-ink-muted mt-2 max-w-xl">{STAGE_EXPLAIN[inq.status]}</p>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
              {/* Stage move */}
              {!isArchived && (
                <div className="flex items-center gap-1.5 border border-line rounded-md px-2.5 py-1.5 bg-paper">
                  <ChevronDown className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                  <select
                    value={stageOverride}
                    onChange={e => {
                      const ns = e.target.value;
                      setStageOverride(ns);
                      if (ns !== inq.status) action('set_status', { newStatus: ns });
                    }}
                    className="bg-transparent text-xs text-ink outline-none cursor-pointer pr-1"
                  >
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
                  </select>
                </div>
              )}

              {/* Refresh */}
              <button
                onClick={loadInquiry}
                disabled={loading}
                className="w-8 h-8 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-paper border border-line transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {/* Status-specific primary actions */}
              {inq.status === 'pending' && (
                <>
                  <button onClick={() => action('mark_in_review')} disabled={processing}
                    className="bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50">
                    <Clock className="w-3.5 h-3.5" />In Review
                  </button>
                  <button onClick={() => { if (confirm('Reject this inquiry?')) action('reject'); }} disabled={processing}
                    className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors">
                    <XCircle className="w-3.5 h-3.5" />Reject
                  </button>
                </>
              )}
              {inq.status === 'in_review' && (
                <>
                  <button onClick={() => { if (confirm('Send ' + inq.contactName + ' the setup sheet?')) action('request_details'); }} disabled={processing}
                    className="bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50">
                    <Mail className="w-3.5 h-3.5" />Send Sheet
                  </button>
                  <button onClick={() => { if (confirm('Build ' + inq.courseName + ' now without the sheet?')) action('build_course'); }} disabled={processing}
                    className="text-ink-muted hover:text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border border-line hover:border-line-strong transition-colors">
                    <Wrench className="w-3 h-3" />Skip &amp; Build
                  </button>
                  <button onClick={() => { if (confirm('Reject?')) action('reject'); }} disabled={processing}
                    className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors">
                    <XCircle className="w-3.5 h-3.5" />Reject
                  </button>
                </>
              )}
              {inq.status === 'details_requested' && (
                <>
                  <button onClick={() => { if (confirm('Resend setup-sheet link?')) action('resend_details'); }} disabled={processing}
                    className="bg-paper hover:bg-line border border-line text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50">
                    <Mail className="w-3.5 h-3.5" />Resend Sheet
                  </button>
                  <button onClick={() => { if (confirm('Reject?')) action('reject'); }} disabled={processing}
                    className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors">
                    <XCircle className="w-3.5 h-3.5" />Reject
                  </button>
                </>
              )}
              {inq.status === 'details_submitted' && (
                <>
                  <button onClick={() => { if (confirm('Create draft course for ' + inq.courseName + '? No email will be sent.')) createDraftCourse(); }} disabled={processing}
                    className="bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50">
                    <CheckCircle className="w-3.5 h-3.5" />Create Draft Course
                  </button>
                  <button onClick={() => { if (confirm('Reject?')) action('reject'); }} disabled={processing}
                    className="bg-bad/5 hover:bg-bad/10 text-bad border border-bad/20 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors">
                    <XCircle className="w-3.5 h-3.5" />Reject
                  </button>
                </>
              )}
              {inq.status === 'building' && (
                <>
                  {inq.builtCourseId && (
                    <button onClick={() => router.push('/admin/courses/' + inq.builtCourseId)}
                      className="bg-paper hover:bg-line border border-line text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors">
                      <Wrench className="w-3.5 h-3.5" />Manage Course
                    </button>
                  )}
                  <button onClick={() => { if (confirm('Send login email with a new temp password to ' + inq.contactName + '?')) action('resend_welcome'); }} disabled={processing}
                    className="bg-paper hover:bg-line border border-line text-ink px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors">
                    <Mail className="w-3.5 h-3.5" />Send Login Email
                  </button>
                  <button onClick={() => { if (confirm('Set ' + inq.courseName + ' LIVE?')) action('mark_live'); }} disabled={processing}
                    className="bg-pine hover:bg-pine-hover text-white px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50">
                    <Power className="w-3.5 h-3.5" />Go Live
                  </button>
                  <button onClick={deleteInquiry} title="Delete inquiry"
                    className="w-8 h-8 flex items-center justify-center text-ink-muted hover:text-bad hover:bg-bad/5 rounded-md border border-line transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {inq.status === 'live' && inq.builtCourseId && (
                <button onClick={() => router.push('/admin/courses/' + inq.builtCourseId)}
                  className="flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover bg-pine/5 hover:bg-pine/10 border border-pine/20 px-3 py-2 rounded-md transition-colors">
                  <Wrench className="w-3.5 h-3.5" />Manage course <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
              {inq.status === 'archived' && (
                <button onClick={deleteInquiry}
                  className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-bad hover:bg-bad/5 px-3 py-1.5 rounded-md border border-line hover:border-bad/20 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />Delete permanently
                </button>
              )}
            </div>
          </div>

          {/* Approve result */}
          {approveResult && (() => {
            const isDetails = !!approveResult.detailsLink;
            const rows: [string, string][] = isDetails
              ? [['Setup Sheet Link', approveResult.detailsLink as string]]
              : [['Temp Password', approveResult.tempPassword || ''], ['Setup Link', approveResult.setupLink || '']];
            const failed = approveResult.emailSent === false;
            return (
              <div className={'mt-4 rounded-md px-4 py-3 ' + (failed ? 'bg-bad/5 border border-bad/20' : 'bg-ok/5 border border-ok/20')}>
                <div className={'text-xs font-medium mb-2 ' + (failed ? 'text-bad' : 'text-ok')}>
                  {failed
                    ? 'Email failed (' + (approveResult.emailError || 'unknown') + '). Share manually:'
                    : (isDetails ? 'Setup sheet sent.' : 'Course built, welcome email sent.')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {rows.filter(([, v]) => v).map(([label, val]) => (
                    <div key={label} className="flex items-center gap-2 bg-white rounded-md px-3 py-2 border border-line">
                      <span className="text-xs text-ink-muted shrink-0">{label}:</span>
                      <span className="text-xs text-ink font-mono">{val}</span>
                      <button onClick={() => navigator.clipboard.writeText(val)} className="text-ink-muted hover:text-pine transition-colors ml-1">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Tab nav */}
        <div className="border-b border-line bg-white shrink-0 px-8">
          <div className="flex gap-0">
            {(['contact', 'answers', 'sheet', 'activity'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={'px-4 py-3 text-sm font-medium border-b-2 transition-colors ' + (
                  activeTab === t ? 'border-pine text-pine' : 'border-transparent text-ink-muted hover:text-ink'
                )}>
                {t === 'contact' ? 'Contact' : t === 'answers' ? 'Answers' : t === 'sheet' ? 'Sheet' : 'Activity'}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 px-8 py-7">

          {/* ── Contact tab ─────────────────────────────────────────────── */}
          {activeTab === 'contact' && (
            <div className="max-w-3xl">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Contact Info</div>
                {!editContact ? (
                  <button onClick={() => {
                    setContactEdits({
                      contactName: inq.contactName || '', email: inq.email || '',
                      phone: inq.phone || '', courseName: inq.courseName || '',
                      city: inq.city || '', state: inq.state || '',
                    });
                    setEditContact(true);
                  }} className="flex items-center gap-1 text-xs text-ink-muted hover:text-pine transition-colors">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditContact(false)} className="text-xs text-ink-muted hover:text-ink transition-colors">Cancel</button>
                    <button onClick={saveContact} disabled={processing}
                      className="flex items-center gap-1 text-xs bg-pine text-white px-2.5 py-1 rounded-md hover:bg-pine-hover disabled:opacity-50 transition-colors">
                      <Save className="w-3 h-3" /> Save
                    </button>
                  </div>
                )}
              </div>

              {editContact ? (
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ['contactName', 'Contact name'], ['email', 'Email'], ['phone', 'Phone'],
                    ['courseName', 'Course name'], ['city', 'City'], ['state', 'State'],
                  ] as [string, string][]).map(([field, label]) => (
                    <div key={field}>
                      <label className="block text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">{label}</label>
                      <input value={contactEdits[field] ?? ''} onChange={e => setContactEdits(p => ({ ...p, [field]: e.target.value }))}
                        className={iCls} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white border border-line rounded-lg p-5">
                    <div className="text-base font-medium text-ink">{inq.contactName}{inq.contactTitle ? ' · ' + inq.contactTitle : ''}</div>
                    <a href={'mailto:' + inq.email} className="text-sm text-pine hover:underline block mt-1">{inq.email}</a>
                    {inq.phone && <div className="text-sm text-ink-muted mt-0.5">{inq.phone}</div>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-line rounded-lg px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">City / State</div>
                      <div className="text-ink font-medium">{inq.city}, {inq.state}</div>
                    </div>
                    <div className="bg-white border border-line rounded-lg px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Course type</div>
                      <div className="text-ink font-medium capitalize">{inq.courseType}</div>
                    </div>
                    {inq.website && (
                      <div className="col-span-2 bg-white border border-line rounded-lg px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Website</div>
                        <a href={inq.website} target="_blank" rel="noreferrer" className="text-pine hover:underline text-sm">{inq.website}</a>
                      </div>
                    )}
                    {inq.address && (
                      <div className="col-span-2 bg-white border border-line rounded-lg px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Address</div>
                        <div className="text-ink text-sm">{inq.address}{inq.zipCode ? ', ' + inq.zipCode : ''}</div>
                      </div>
                    )}
                    <div className="col-span-2 bg-white border border-line rounded-lg px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Submitted</div>
                      <div className="text-ink text-sm">{fmtDate(inq.createdAt)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Answers tab ─────────────────────────────────────────────── */}
          {activeTab === 'answers' && (
            <div className="max-w-3xl space-y-5">
              {(() => {
                const rows: [string, string][] = [];
                if (inq.currentBookingMethod) rows.push(['Current booking', inq.currentBookingMethod]);
                if (inq.teeTimesPerDay) rows.push(['Tee times/day', String(inq.teeTimesPerDay)]);
                if (inq.greenFeeRange) rows.push(['Green fees', inq.greenFeeRange]);
                return rows.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {rows.map(([label, val]) => (
                      <div key={label} className="bg-white border border-line rounded-lg px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">{label}</div>
                        <div className="text-ink font-medium">{val}</div>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
              {(inq.hasMemberPricing || inq.hasResidentPricing || inq.hasCaddies) && (
                <div className="flex gap-2 flex-wrap">
                  {inq.hasMemberPricing && <span className="text-[11px] px-2.5 py-1 rounded-md bg-white text-ink-muted border border-line">Members</span>}
                  {inq.hasResidentPricing && <span className="text-[11px] px-2.5 py-1 rounded-md bg-white text-ink-muted border border-line">Residents</span>}
                  {inq.hasCaddies && <span className="text-[11px] px-2.5 py-1 rounded-md bg-white text-ink-muted border border-line">Caddies</span>}
                </div>
              )}
              {inq.lookingFor && inq.lookingFor.length > 0 && (
                <div className="bg-white border border-line rounded-lg px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Looking for</div>
                  <div className="text-ink font-medium">{inq.lookingFor.join(', ')}</div>
                </div>
              )}
              {inq.additionalNotes && (
                <div className="bg-white border border-line rounded-lg px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Additional notes</div>
                  <div className="text-ink text-sm">{inq.additionalNotes}</div>
                </div>
              )}
              {inq.pricingNotes && (
                <div className="bg-white border border-line rounded-lg px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Pricing notes</div>
                  <div className="text-ink text-sm">{inq.pricingNotes}</div>
                </div>
              )}
              {inq.needsJson && (() => {
                let n: Record<string, unknown> = {};
                try { n = JSON.parse(inq.needsJson || ''); } catch { /* ignore */ }
                const entries = Object.entries(n).filter(([, v]) => v !== '' && v !== null);
                if (entries.length === 0) return null;
                return (
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.06em] text-warn mb-2">Branch Answers</div>
                    <div className="grid grid-cols-2 gap-3">
                      {entries.map(([k, v]) => (
                        <div key={k} className="bg-warn/5 border border-warn/20 rounded-lg px-4 py-3">
                          <div className="text-[10px] text-warn/80 mb-0.5">{NEEDS_LABELS[k] || k}</div>
                          <div className="text-warn font-medium">{NEEDS_VALUES[String(v)] || String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {!inq.currentBookingMethod && !inq.teeTimesPerDay && !inq.greenFeeRange &&
               !inq.hasMemberPricing && !inq.hasResidentPricing && !inq.hasCaddies &&
               (!inq.lookingFor || inq.lookingFor.length === 0) &&
               !inq.additionalNotes && !inq.pricingNotes &&
               (!inq.needsJson || inq.needsJson === '{}' || inq.needsJson === '') && (
                <p className="text-sm text-ink-faint text-center py-10">No inquiry answers on record.</p>
              )}
            </div>
          )}

          {/* ── Sheet tab ───────────────────────────────────────────────── */}
          {activeTab === 'sheet' && (
            <div className="max-w-3xl space-y-5">
              {/* Manual build (in person) link — subtle, in sheet tab */}
              {!inq.builtCourseId && !isArchived && inq.status !== 'building' && (
                <div className="flex items-center justify-between bg-paper border border-line rounded-lg px-4 py-3">
                  <div>
                    <div className="text-xs font-medium text-ink-muted">Manual build (in person)</div>
                    <div className="text-[10px] text-ink-faint mt-0.5">Opens pre-fill wizard for in-person setup sessions</div>
                  </div>
                  <button onClick={() => router.push('/admin/create?' + wizardParams.toString())}
                    className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink bg-white hover:bg-paper border border-line px-3 py-1.5 rounded-md transition-colors shrink-0">
                    Open Wizard <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {inq.detailsJson ? (() => {
                let d: Record<string, unknown> = {};
                try { d = JSON.parse(inq.detailsJson || ''); } catch { /* ignore */ }
                if (Object.keys(d).length === 0) return <p className="text-sm text-ink-faint text-center py-10">Sheet submitted but empty.</p>;

                const sch = d.schedule as Record<string, unknown> | undefined;
                const wdFee = (d.greenFeeWeekday ?? sch?.greenFeeWeekday) as string | undefined;
                const weFee = (d.greenFeeWeekend ?? sch?.greenFeeWeekend) as string | undefined;
                const firstTee = (d.firstTeeTime ?? sch?.startTime) as string | undefined;
                const lastTee = (d.lastTeeTime ?? sch?.endTime) as string | undefined;
                const intervalMin = (d.intervalMinutes ?? sch?.intervalMinutes) as string | undefined;
                const cartFee = (d.cartFee ?? sch?.cartFee) as string | undefined;
                const dayNums = (d.daysOpen ?? sch?.daysOfWeek) as number[] | undefined;
                const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const skipKeys = new Set(['schedule', 'daysOpen', 'daysOfWeek', 'greenFeeWeekday', 'greenFeeWeekend', 'firstTeeTime', 'lastTeeTime', 'intervalMinutes', 'cartFee']);
                const rest = Object.entries(d).filter(([k, v]) =>
                  !skipKeys.has(k) && v !== '' && v !== null && !(Array.isArray(v) && v.length === 0)
                );
                const checks = [
                  { label: 'Weekday green fee', ok: !!(d.greenFeeWeekday || sch?.greenFeeWeekday) },
                  { label: 'Weekend green fee', ok: !!(d.greenFeeWeekend || sch?.greenFeeWeekend) },
                  { label: 'First tee time', ok: !!(d.firstTeeTime || sch?.startTime) },
                  { label: 'Last tee time', ok: !!(d.lastTeeTime || sch?.endTime) },
                  { label: 'Cancellation policy', ok: !!(d.cancellationHours || d.cancellationPolicy) },
                  { label: 'Course description', ok: !!(d.description) },
                ];
                const allGood = checks.every(c => c.ok);
                return (
                  <>
                    {(wdFee || firstTee) && (
                      <div className="bg-ok/5 border border-ok/20 rounded-lg p-4">
                        <div className="text-ok font-medium text-xs mb-1.5 uppercase tracking-[0.05em]">Tee Sheet</div>
                        {firstTee && lastTee && (
                          <div className="text-ink text-sm">
                            {Array.isArray(dayNums) && dayNums.length > 0 ? dayNums.map(dd => DAYS_SHORT[dd]).join(', ') : 'Every day'}
                            {' · '}{firstTee}–{lastTee} every {intervalMin || '?'}min
                          </div>
                        )}
                        {(wdFee || weFee) && (
                          <div className="text-ink-muted text-xs mt-1">
                            WD ${wdFee || '—'} / WE ${weFee || '—'}{cartFee ? ` · Cart $${cartFee}` : ''}
                          </div>
                        )}
                      </div>
                    )}
                    {rest.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {rest.map(([k, v]) => (
                          <div key={k} className="bg-white border border-line rounded-lg px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-0.5">{DETAIL_LABELS[k] || k}</div>
                            <div className="text-ink text-sm">{Array.isArray(v) ? (v as string[]).join(', ') : String(v)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="bg-white border border-line rounded-lg p-4">
                      <div className={'text-[11px] uppercase tracking-[0.06em] mb-3 ' + (allGood ? 'text-ok' : 'text-warn')}>
                        {allGood ? 'Ready to Build' : 'Build Checklist'}
                      </div>
                      <div className="space-y-2">
                        {checks.map(c => (
                          <div key={c.label} className="flex items-center gap-2 text-sm">
                            <div className={'w-1.5 h-1.5 rounded-full shrink-0 ' + (c.ok ? 'bg-ok' : 'bg-warn')} />
                            <span className={c.ok ? 'text-ink' : 'text-warn'}>{c.label}</span>
                            {!c.ok && <span className="text-ink-faint text-xs">missing</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })() : (
                <p className="text-sm text-ink-faint text-center py-10">No sheet submitted yet.</p>
              )}
            </div>
          )}

          {/* ── Activity tab ────────────────────────────────────────────── */}
          {activeTab === 'activity' && (
            <div className="max-w-3xl space-y-6">
              {inq.events && inq.events.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">History</div>
                  <div className="bg-white border border-line rounded-lg divide-y divide-line">
                    {inq.events.map(ev => (
                      <div key={ev.id} className="px-4 py-3 flex items-start gap-3">
                        <div className={'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ' + (ev.trigger === 'system' ? 'bg-ink-faint' : 'bg-pine/60')} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink">
                            {ev.fromStatus === 'contact_updated' ? 'Contact info updated' : (
                              <>
                                <span>{STATUS_LABEL[ev.fromStatus] || ev.fromStatus}</span>
                                <span className="text-ink-muted mx-1.5">→</span>
                                <span className="font-medium">{STATUS_LABEL[ev.toStatus] || ev.toStatus}</span>
                              </>
                            )}
                          </div>
                          <div className="text-xs text-ink-faint mt-0.5">
                            {ev.trigger === 'admin' && ev.actorName ? 'by ' + ev.actorName : ev.actorName || 'auto'}
                            {' · '}{fmtDate(ev.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-3">Internal Notes</div>
                {inq.adminNotes && (
                  <pre className="text-sm text-ink-soft bg-white border border-line rounded-lg px-4 py-3 mb-3 whitespace-pre-wrap font-sans">
                    {inq.adminNotes}
                  </pre>
                )}
                <div className="flex gap-2">
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Add a note..."
                    rows={3}
                    className="flex-1 bg-white border border-line rounded-md px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 resize-none"
                  />
                  <button
                    onClick={() => action('add_note', { note: noteText })}
                    disabled={!noteText.trim() || processing}
                    className="px-4 py-2 bg-pine hover:bg-pine-hover disabled:opacity-40 text-white text-xs font-medium rounded-md transition-colors self-start"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default function InquiryDetailPage() {
  return (
    <Suspense fallback={null}>
      <InquiryDetailInner />
    </Suspense>
  );
}
