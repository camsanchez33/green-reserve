'use client';

// MP-12 (ADMIN_V4 V4-9): split out of admin/courses/[id]/page.tsx, which had
// grown to 2,700 lines and 52 useState in one component. Moved verbatim; state
// and handlers come from useCourseDetail() via useCourse(). Every piece of state and every handler the page had.

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useResource } from '@/lib/use-resource';
import { formatMoney as fmtMoney } from '@/lib/format';
import { TabName, CourseDetail, TeeSlot, TxRow, TierRow, MemberRow, ScheduleRow, ScheduleFormState, EMPTY_SCHEDULE } from './shared';

export function useCourseDetail() {
  const { id: courseId } = useParams() as { id: string };

  const router = useRouter();

  // MP-11a: the layout resolved the session; a page never re-checks it.
  const adminReady = true;

  const [detail, setDetail] = useState<CourseDetail | null>(null);

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState('');

  const [tab, setTab] = useState<TabName>('overview');

  // CS-3: ?checkin=1 (from the courses sheet's Schedule link) opens the card.
  const [checkinFocus, setCheckinFocus] = useState<{ n: number } | null>(null);

  const [verifyBusy, setVerifyBusy] = useState(false);

  const [verifyMsg, setVerifyMsg] = useState('');

  // Setup / policy form
  const [setupForm, setSetupForm] = useState<Record<string, unknown>>({});

  const [setupSaving, setSetupSaving] = useState(false);

  // '' | 'saving' | 'saved' | an error sentence
  const [phoneState, setPhoneState] = useState('');

  const [setupMsg, setSetupMsg] = useState('');

  // Operate: schedules
  // MP-11b: loaders that used to be `if (r.ok) set...` with no else — a 403 or
  // a 500 rendered as an empty tee sheet / no schedules / no messages.
  const sched = useResource<ScheduleRow[]>('schedules');

  const schedules = sched.data ?? [];

  const [newSchedule, setNewSchedule] = useState<ScheduleFormState>(EMPTY_SCHEDULE);

  const [showAddSched, setShowAddSched] = useState(false);

  const [schedSaving, setSchedSaving] = useState(false);

  const [schedMsg, setSchedMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [editSched, setEditSched] = useState<{ id: string; form: ScheduleFormState } | null>(null);

  const [editSaving, setEditSaving] = useState(false);

  const [editError, setEditError] = useState('');

  // Operate: tee sheet. MP-5d — every mutation reports pending + failure
  // inline; block/cancel used to swallow errors and manual booking alert()ed.
  const [tsDate, setTsDate] = useState(() => new Date().toISOString().split('T')[0]);

  const ts = useResource<TeeSlot[]>('the tee sheet');

  const tsSlots = ts.data ?? [];

  const tsLoading = ts.loading;

  const [slotBusy, setSlotBusy] = useState<string | null>(null);

  const [opNote, setOpNote] = useState<{ ok: boolean; text: string } | null>(null);

  const [manualSlot, setManualSlot] = useState<string | null>(null);

  const [manualForm, setManualForm] = useState({ name: '', email: '', phone: '', players: 1 });

  const [manualSaving, setManualSaving] = useState(false);

  const [manualError, setManualError] = useState('');

  // Money tab
  const [txItems, setTxItems] = useState<TxRow[]>([]);

  // MP-6b: refund a paid round from here. There was no refund anywhere.
  const [refundTarget, setRefundTarget] = useState<TxRow | null>(null);

  const [refundAmount, setRefundAmount] = useState('');

  const [refundReason, setRefundReason] = useState('');

  const [refundBusy, setRefundBusy] = useState(false);

  const [refundError, setRefundError] = useState('');

  const [refundNote, setRefundNote] = useState('');

  const [txLoading, setTxLoading] = useState(false);

  const [txError, setTxError] = useState('');

  const [txPage, setTxPage] = useState(1);

  const [txPages, setTxPages] = useState(1);

  const [txTotal, setTxTotal] = useState(0);

  const [txFrom, setTxFrom] = useState('');

  const [txTo, setTxTo] = useState('');

  const [txSearch, setTxSearch] = useState('');

  // Operate: members (read-only card)
  const [membersData, setMembersData] = useState<{ tiers: TierRow[]; members: MemberRow[] } | null>(null);

  const [membersError, setMembersError] = useState('');

  const [schedDeleteTarget, setSchedDeleteTarget] = useState<string | null>(null);

  const [schedDeleteBusy, setSchedDeleteBusy] = useState(false);

  const [schedDeleteError, setSchedDeleteError] = useState('');

  const [membersLoading, setMembersLoading] = useState(false);

  // Resend staff login — lives on the Overview contact rail (the Staff tab's
  // one real action; MP-5d retired the tab).
  const [resendingId, setResendingId] = useState<string | null>(null);

  const [resendMsg, setResendMsg] = useState('');

  // Preview email
  const [sendingPreview, setSendingPreview] = useState(false);

  const [previewMsg, setPreviewMsg] = useState('');

  const [showPreviewConfirm, setShowPreviewConfirm] = useState(false);

  const [requestingReReview, setRequestingReReview] = useState(false);

  // Messages tab
  const thr = useResource<{ id: string; messages: { id: string; senderType: string; senderName: string; body: string; readAt: string | null; isBroadcast: boolean; createdAt: string }[] }>('this conversation');

  const msgThread = thr.data;

  const msgLoading = thr.loading;

  const [msgError, setMsgError] = useState('');

  const [msgCompose, setMsgCompose] = useState('');

  const [msgSending, setMsgSending] = useState(false);

  // A-05 item 2: header menu + preflight-aware live toggle
  const [dangerOpen, setDangerOpen] = useState(false);

  const [archiveBusy, setArchiveBusy] = useState(false);

  const [liveToggleBusy, setLiveToggleBusy] = useState(false);

  // MP-5b: the server refuses to close a course over standing bookings unless
  // the caller has seen the count. The 409 carries the impact, so this prompt
  // never has to guess the numbers — or go and fetch them separately.
  const [closurePrompt, setClosurePrompt] = useState<{
    action: 'offline' | 'archive';
    impact: { bookings: number; players: number; golfers: number; nextDate: string | null; withMoney: number };
  } | null>(null);

  const [closureBusy, setClosureBusy] = useState(false);

  const [closureError, setClosureError] = useState('');

  const [liveBlockReason, setLiveBlockReason] = useState('');

  const [liveBlockMissing, setLiveBlockMissing] = useState<'agreement' | 'stripe' | null>(null);

  const [reminderNudgeBusy, setReminderNudgeBusy] = useState(false);

  const [reminderNudgeSent, setReminderNudgeSent] = useState(false);

  const [reminderNudgeError, setReminderNudgeError] = useState('');

  // A-05 item 5: Records tab (was Documents)
  const [docsData, setDocsData] = useState<{
    agreements?: { signed: number; total: number; missing: string[]; documents: { document: string; version: string; title: string; signed: boolean }[] };
    acceptances?: { id: string; document: string; title: string; version: string; signerName: string; signerTitle: string; signerEmail: string; acceptedAt: string; ip: string; legacy: boolean; pdfUrl: string | null }[];
    approval: { status: string; approvedAt: string | null };
    stripeAgreementDate: string | null;
    bookingTermsVersion: string;
    agreementVersion: string;
    agreement: { version: string; acceptedBy: string; at: string } | null;
    documents: { name: string; url: string; by: string; at: string }[];
    notes: { text: string; by: string; at: string }[];
  } | null>(null);

  const [docsLoading, setDocsLoading] = useState(false);

  const [noteDraft, setNoteDraft] = useState('');

  const [noteSaving, setNoteSaving] = useState(false);

  const [docUploading, setDocUploading] = useState(false);

  const [docsError, setDocsError] = useState('');

  // A-05 item 4b: auto-chase reminders kill switch
  const [remindersBusy, setRemindersBusy] = useState(false);

  const [remindersError, setRemindersError] = useState('');

  const H = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  const loadSchedules = useCallback(
    () => sched.load(`/api/admin/schedule?courseId=${courseId}`),
    [courseId, sched.load]);

  const loadTeeSheet = useCallback(
    (date: string) => ts.load(`/api/admin/tee-sheet?courseId=${courseId}&date=${date}`, { clear: true }),
    [courseId, ts.load]);

  const loadTransactions = useCallback(async (p: number, f: string, t: string, s: string) => {
    setTxLoading(true);
    const params = new URLSearchParams({ courseId, page: String(p) });
    if (f) params.set('from', f);
    if (t) params.set('to', t);
    if (s) params.set('search', s);
    // MP-10: this swallowed every failure — a 403 or a dropped connection
    // rendered as "No transactions found". Same fix the members loader got.
    setTxError('');
    try {
      const r = await fetch(`/api/admin/transactions?${params}`, { headers: H() });
      if (r.ok) {
        const d = await r.json();
        setTxItems(d.items);
        setTxPage(d.page);
        setTxPages(d.pages);
        setTxTotal(d.total);
      } else {
        setTxItems([]);
        setTxError(r.status === 403 ? 'Transactions require support access.'
          : r.status === 401 ? 'Your session ended — sign in again.'
          : 'Could not load transactions. Try again.');
      }
    } catch {
      setTxItems([]);
      setTxError('Network error loading transactions. Check your connection and try again.');
    }
    setTxLoading(false);
  }, [courseId, H]);

  // MP-5a: this swallowed every failure — no catch, no else. A 403 or a
  // dropped connection left membersData null, and the empty state then told
  // the reader to "click Load above", a button this tab has never had. The
  // documents loader right below always did this correctly; copy it.
  const loadMembers = useCallback(async () => {
    setMembersLoading(true); setMembersError('');
    try {
      const r = await fetch(`/api/admin/course-members?courseId=${courseId}`, { headers: H() });
      if (r.ok) setMembersData(await r.json());
      else {
        const e = await r.json().catch(() => ({}));
        setMembersError(e.error || (r.status === 403 ? 'Members require manager access.' : 'Could not load members.'));
      }
    } catch {
      setMembersError('Network error loading members. Check your connection.');
    }
    setMembersLoading(false);
  }, [courseId, H]);

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true); setDocsError('');
    const r = await fetch(`/api/admin/course-documents?courseId=${courseId}`, { headers: H() });
    if (r.ok) setDocsData(await r.json());
    else { const e = await r.json().catch(() => ({})); setDocsError(e.error || 'Failed to load documents'); }
    setDocsLoading(false);
  }, [courseId, H]);

  const loadCourseThread = useCallback(async () => {
    await thr.load(`/api/admin/messages?courseId=${courseId}`);
    // Mark operator messages as read — best effort, never user-facing state.
    await fetch('/api/admin/messages', { method: 'PATCH', headers: H(), body: JSON.stringify({ courseId }) }).catch(() => {});
  }, [courseId, H, thr.load]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await fetch(`/api/admin/course-detail?courseId=${courseId}`, { headers: H() });
      if (r.ok) {
        const d = await r.json();
        setDetail(d);
        setSetupForm(d.course);
      } else {
        const e = await r.json().catch(() => ({}));
        setLoadError(e.error || `Failed to load course (${r.status})`);
      }
    } catch {
      setLoadError('Network error — check your connection and try again.');
    }
    setLoading(false);
  }, [courseId, H]);

  useEffect(() => {
    if (adminReady) loadDetail();
  }, [adminReady, loadDetail]);

  useEffect(() => {
    if (!detail) return;
    if (new URLSearchParams(window.location.search).get('checkin') === '1') setCheckinFocus({ n: Date.now() });
  }, [detail?.course.id]);

  // eslint-disable-line react-hooks/exhaustive-deps

  // CS-3 Setup card: the one action that completes the "verified" step —
  // marks the operator verified (the existing verify-operator action).
  async function markVerified() {
    if (!detail?.course.operator?.email) return;
    setVerifyBusy(true); setVerifyMsg('');
    try {
      const r = await fetch('/api/admin/verify-operator', { method: 'POST', headers: H(), body: JSON.stringify({ email: detail.course.operator.email }) });
      if (r.ok) { setVerifyMsg('Marked verified.'); loadDetail(); }
      else { const d = await r.json().catch(() => ({})); setVerifyMsg('Error: ' + (d.error || 'could not mark verified')); }
    } catch { setVerifyMsg('Error: network — nothing was changed.'); }
    setVerifyBusy(false);
  }

  // A-05 item 2 — preflight-aware: server enforces the SAME two absolute
  // checks (go-live-preflight.ts / course-timeline.ts) the inquiries
  // mark_live action does — Stripe + Operator Agreement, no override,
  // ever (STRIPE RULE FINAL / AGREEMENT = GO-LIVE GATE). A blocked "Set
  // live" surfaces the exact reason and a one-click reminder instead of
  // silently no-op'ing or offering a way around it.
  async function toggleActive(active: boolean, cancelBookings = false) {
    setLiveToggleBusy(true); setLiveBlockReason(''); setLiveBlockMissing(null); setClosureError('');
    // Review (no-silent-failures): a dropped connection threw past the busy
    // reset and left the button on "Working…" forever. try/finally, like
    // sendGoLiveReminder two functions down.
    try {
      const r = await fetch('/api/admin/course-detail', {
        method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, active, cancelBookings }),
      });
      if (r.ok) {
        setClosurePrompt(null);
        const d = await r.json().catch(() => ({}));
        // Never let a bounced operator notice pass as a clean close.
        if (active === false && d.operatorNotified === false) {
          setLiveBlockReason('Course is offline, but the notice to the operator did not send — tell them yourself.');
        }
        setDetail(dd => dd ? { ...dd, course: { ...dd.course, active } } : dd);
        loadDetail();
        return;
      }
      const d = await r.json().catch(() => ({}));
      // MP-5b: golfers are holding tee times. Say how many, and make cancelling
      // them a decision rather than a side effect.
      if (r.status === 409 && d.needsBookingDecision && d.impact) {
        setClosurePrompt({ action: 'offline', impact: d.impact });
        return;
      }
      if (closurePrompt) { setClosureError(d.error || 'Failed to take the course offline.'); return; }
      setLiveBlockReason(d.error || 'Failed to update — try again.');
      setLiveBlockMissing(d.missing === 'agreement' || d.missing === 'stripe' ? d.missing : null);
    } catch {
      if (closurePrompt) setClosureError('Network error — nothing was changed. Check your connection and try again.');
      else setLiveBlockReason('Network error — nothing was changed. Check your connection and try again.');
    } finally {
      setLiveToggleBusy(false);
    }
  }

  async function sendGoLiveReminder(missing: 'agreement' | 'stripe') {
    setReminderNudgeBusy(true); setReminderNudgeError('');
    try {
      const r = await fetch('/api/admin/send-golive-reminder', {
        method: 'POST', headers: H(), body: JSON.stringify({ courseId, missing }),
      });
      if (r.ok) setReminderNudgeSent(true);
      else { const d = await r.json().catch(() => ({})); setReminderNudgeError(d.error || 'The reminder did not send — try again.'); }
    } catch {
      setReminderNudgeError('Network error — the reminder was not sent.');
    }
    setReminderNudgeBusy(false);
  }

  // MP-0 review blocker B1 (no-silent-failures): this used to fire and forget
  // — no res.ok check, no catch, no pending state — and wrote the local state
  // regardless, so a 401/403/500 flipped the star and the menu label for a
  // write that never persisted, reverting on the next load with no
  // explanation. Mirrors toggleActive above: busy flag, real error surface,
  // local state only on success.

  // MP-5b: was a bare browser confirm that named no consequence, then an
  // alert() on failure. Archiving is now gated on the same booking decision as
  // taking a course offline.
  async function archiveCourse(cancelBookings = false) {
    if (!detail) return;
    setArchiveBusy(true); setClosureError('');
    try {
      const r = await fetch('/api/admin/archive-course', {
        method: 'POST', headers: H(), body: JSON.stringify({ courseId, action: 'archive', cancelBookings }),
      });
      if (r.ok) { router.push('/admin/courses'); return; }
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.needsBookingDecision && d.impact) {
        setClosurePrompt({ action: 'archive', impact: d.impact });
        return;
      }
      if (closurePrompt) { setClosureError(d.error || 'Archive failed.'); return; }
      setClosureError('');
      setLiveBlockReason(d.error ? `Archive failed: ${d.error}` : 'Archive failed — try again.');
    } catch {
      if (closurePrompt) setClosureError('Archive failed: network error — nothing was changed.');
      else setLiveBlockReason('Archive failed: network error — nothing was changed. Check your connection and try again.');
    } finally {
      setArchiveBusy(false);
    }
  }

  async function restoreCourse() {
    setArchiveBusy(true);
    try {
      const r = await fetch('/api/admin/archive-course', {
        method: 'POST', headers: H(), body: JSON.stringify({ courseId, action: 'restore' }),
      });
      if (r.ok) loadDetail();
      else { const d = await r.json().catch(() => ({})); setLiveBlockReason(`Restore failed: ${d.error || 'try again'}`); }
    } catch {
      setLiveBlockReason('Restore failed: network error — nothing was changed. Check your connection and try again.');
    } finally {
      setArchiveBusy(false);
    }
  }

  // A-05 item 4b — kill switch, logged to the course timeline.
  async function toggleRemindersPaused(paused: boolean) {
    setRemindersBusy(true); setRemindersError('');
    try {
      const r = await fetch('/api/admin/course-reminders', {
        method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, paused }),
      });
      if (r.ok) loadDetail();
      else { const d = await r.json().catch(() => ({})); setRemindersError(d.error || 'Could not change the reminder setting — nothing was saved.'); }
    } catch {
      setRemindersError('Network error — nothing was saved.');
    }
    setRemindersBusy(false);
  }

  async function addClientNote() {
    if (!noteDraft.trim()) return;
    setNoteSaving(true); setDocsError('');
    try {
      const r = await fetch('/api/admin/course-documents', {
        method: 'POST', headers: H(), body: JSON.stringify({ courseId, kind: 'note', text: noteDraft.trim() }),
      });
      if (r.ok) { setNoteDraft(''); loadDocuments(); }
      else { const d = await r.json().catch(() => ({})); setDocsError(d.error || 'Could not save the note — nothing was changed.'); }
    } catch {
      setDocsError('Network error — the note was not saved. Check your connection and try again.');
    } finally {
      setNoteSaving(false);
    }
  }

  async function uploadDocument(file: File) {
    setDocUploading(true); setDocsError('');
    const form = new FormData();
    form.append('file', file);
    form.append('courseId', courseId);
    try {
      const r = await fetch('/api/admin/course-documents/upload', { method: 'POST', body: form });
      if (r.ok) loadDocuments();
      else { const d = await r.json().catch(() => ({})); setDocsError(d.error || 'Upload failed'); }
    } catch {
      setDocsError('Network error — the file was not uploaded. Check your connection and try again.');
    } finally {
      setDocUploading(false);
    }
  }

  async function saveSetup() {
    setSetupSaving(true); setSetupMsg('');
    try {
      const r = await fetch('/api/admin/course-settings', {
        method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, ...setupForm }),
      });
      setSetupMsg(r.ok ? 'saved' : 'error');
      if (r.ok) loadDetail();
    } catch {
      setSetupMsg('error');
    } finally {
      setSetupSaving(false);
    }
  }

  // Review (no-silent-failures): the phone blur-save had no else, no busy
  // state and no catch — a refused or dropped save looked accepted until the
  // next reload quietly reverted it.
  async function savePhone(phone: string) {
    setPhoneState('saving');
    try {
      const r = await fetch('/api/admin/course-settings', {
        method: 'PATCH', headers: H(), body: JSON.stringify({ courseId, phone }),
      });
      if (r.ok) { setPhoneState('saved'); loadDetail(); setTimeout(() => setPhoneState(''), 2000); }
      else { const d = await r.json().catch(() => ({})); setPhoneState(d.error || 'Phone was not saved — try again.'); }
    } catch {
      setPhoneState('Network error — phone was not saved.');
    }
  }

  // MP-5d: Operate loads all three of its panels at once. Transactions'
  // "View" jumps here with a date, so the date is a parameter.
  function openOperate(date = tsDate) {
    setTab('operate'); setTsDate(date); setOpNote(null);
    loadTeeSheet(date); loadSchedules(); loadMembers();
  }

  // '' in a member-rate field means "no member rate" — the wire wants null.
  function schedulePayload(f: ScheduleFormState) {
    return { ...f, productId: f.productId || null, memberRateWeekday: f.memberRateWeekday || null, memberRateWeekend: f.memberRateWeekend || null };
  }

  async function addSchedule() {
    if (newSchedule.startTime >= newSchedule.endTime) { setSchedMsg({ ok: false, text: 'Last tee must be after first tee.' }); return; }
    setSchedSaving(true); setSchedMsg(null);
    try {
      const r = await fetch('/api/admin/schedule', {
        method: 'POST', headers: H(), body: JSON.stringify({ courseId, ...schedulePayload(newSchedule) }),
      });
      if (r.ok) {
        setSchedMsg({ ok: true, text: 'Schedule saved — tee times generated for the next 8 days.' });
        setShowAddSched(false); setNewSchedule(EMPTY_SCHEDULE);
        loadSchedules(); loadTeeSheet(tsDate);
      } else {
        const e = await r.json().catch(() => ({}));
        setSchedMsg({ ok: false, text: e.error || 'Could not save the schedule — nothing was changed.' });
      }
    } catch {
      setSchedMsg({ ok: false, text: 'Network error — nothing was saved.' });
    }
    setSchedSaving(false);
  }

  function beginScheduleEdit(sch: ScheduleRow) {
    setEditError(''); setShowAddSched(false); setSchedMsg(null);
    setEditSched({
      id: sch.id,
      form: {
        productId: sch.productId ?? '',
        daysOfWeek: sch.daysOfWeek, startTime: sch.startTime, endTime: sch.endTime,
        intervalMinutes: sch.intervalMinutes, greenFeeWeekday: sch.greenFeeWeekday, greenFeeWeekend: sch.greenFeeWeekend,
        memberRateWeekday: sch.memberRateWeekday != null ? String(sch.memberRateWeekday) : '',
        memberRateWeekend: sch.memberRateWeekend != null ? String(sch.memberRateWeekend) : '',
        cartFee: sch.cartFee, walkingAllowed: sch.walkingAllowed,
      },
    });
  }

  async function saveScheduleEdit() {
    if (!editSched) return;
    if (editSched.form.startTime >= editSched.form.endTime) { setEditError('Last tee must be after first tee.'); return; }
    setEditSaving(true); setEditError('');
    try {
      const r = await fetch('/api/admin/schedule', {
        method: 'PATCH', headers: H(), body: JSON.stringify({ id: editSched.id, ...schedulePayload(editSched.form) }),
      });
      if (r.ok) {
        setEditSched(null);
        setSchedMsg({ ok: true, text: 'Schedule updated — open tee times were rebuilt to match. Booked times were left alone.' });
        loadSchedules(); loadTeeSheet(tsDate);
      } else {
        const e = await r.json().catch(() => ({}));
        setEditError(e.error || 'Could not save — nothing was changed.');
      }
    } catch {
      setEditError('Network error — nothing was changed.');
    }
    setEditSaving(false);
  }

  // MP-5a: fired straight off the trash icon with no confirm and no failure
  // path — a mis-click removed a course's entire bookable window, and a failed
  // delete looked exactly like a successful one.
  async function deleteSchedule(id: string) {
    setSchedDeleteBusy(true); setSchedDeleteError('');
    try {
      const r = await fetch('/api/admin/schedule', { method: 'DELETE', headers: H(), body: JSON.stringify({ id }) });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setSchedDeleteError(e.error || 'Could not delete that schedule. Nothing was changed.');
        setSchedDeleteBusy(false);
        return;
      }
      setSchedDeleteTarget(null);
      loadSchedules();
      loadTeeSheet(tsDate);
    } catch {
      setSchedDeleteError('Network error — nothing was changed.');
    }
    setSchedDeleteBusy(false);
  }

  async function blockSlot(teeTimeId: string, block: boolean) {
    setSlotBusy(teeTimeId); setOpNote(null);
    try {
      const r = await fetch('/api/admin/tee-sheet', {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ action: block ? 'block' : 'unblock', teeTimeId }),
      });
      if (r.ok) await loadTeeSheet(tsDate);
      else {
        const e = await r.json().catch(() => ({}));
        setOpNote({ ok: false, text: e.error || `Could not ${block ? 'block' : 'unblock'} that time — nothing was changed.` });
      }
    } catch {
      setOpNote({ ok: false, text: 'Network error — the tee sheet was not changed.' });
    }
    setSlotBusy(null);
  }

  async function cancelBooking(bookingId: string, teeTimeId: string) {
    if (!confirm('Cancel this booking? The golfer will be emailed.')) return;
    setSlotBusy(teeTimeId); setOpNote(null);
    try {
      const r = await fetch('/api/admin/tee-sheet', {
        method: 'PATCH', headers: H(), body: JSON.stringify({ action: 'cancel_booking', bookingId }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        await loadTeeSheet(tsDate);
        // The shared cancellation service applies the course's own late policy;
        // say so when it did, rather than letting a charge pass silently.
        setOpNote(d.feeCharged
          ? { ok: false, text: 'Booking cancelled. It was inside the course\'s cancellation window, so the late fee was charged to the golfer\'s card.' }
          : { ok: true, text: 'Booking cancelled — the golfer has been emailed.' });
      } else {
        setOpNote({ ok: false, text: d.error || 'Could not cancel that booking — nothing was changed.' });
      }
    } catch {
      setOpNote({ ok: false, text: 'Network error — the booking was not cancelled.' });
    }
    setSlotBusy(null);
  }

  async function addManualBooking() {
    if (!manualSlot) return;
    setManualSaving(true); setManualError('');
    try {
      const r = await fetch('/api/admin/tee-sheet', {
        method: 'POST', headers: H(), body: JSON.stringify({ teeTimeId: manualSlot, ...manualForm }),
      });
      if (r.ok) {
        setManualSlot(null);
        setManualForm({ name: '', email: '', phone: '', players: 1 });
        loadTeeSheet(tsDate);
      } else {
        const d = await r.json().catch(() => ({}));
        setManualError(d.error || 'Could not add the booking — nothing was changed.');
      }
    } catch {
      setManualError('Network error — nothing was booked.');
    }
    setManualSaving(false);
  }

  // MP-11b: the send lived twice (Ctrl+Enter and the button), both ending in
  // alert(). One function, one inline error above the composer.
  async function sendCourseMessage() {
    if (!msgCompose.trim() || msgSending) return;
    setMsgSending(true); setMsgError('');
    try {
      const r = await fetch('/api/admin/messages', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ courseId, body: msgCompose.trim() }),
      });
      if (r.ok) { setMsgCompose(''); await loadCourseThread(); }
      else { const d = await r.json().catch(() => ({})); setMsgError(d.error || 'The message did not send — try again.'); }
    } catch {
      setMsgError('Network error — the message was not sent.');
    }
    setMsgSending(false);
  }

  async function submitRefund() {
    if (!refundTarget) return;
    const dollars = refundAmount.trim() === '' ? null : Number(refundAmount);
    if (dollars !== null && (!Number.isFinite(dollars) || dollars <= 0)) { setRefundError('Enter an amount in dollars, or leave it blank for a full refund.'); return; }
    if (!refundReason.trim()) { setRefundError('A reason is required — the golfer sees it in their email.'); return; }
    setRefundBusy(true); setRefundError('');
    try {
      const r = await fetch('/api/admin/refund', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ bookingId: refundTarget.id, amountCents: dollars === null ? undefined : Math.round(dollars * 100), reason: refundReason.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setRefundError(d.error || `Refund failed (${r.status}). Nothing was refunded.`); return; }
      setRefundNote(`Refunded ${fmtMoney(d.amountCents / 100)} to ${refundTarget.golferName}${d.full ? '' : ' (partial)'}${d.emailSent ? ' — they have been emailed.' : ' — the email did NOT send; tell them yourself.'}`);
      setRefundTarget(null); setRefundAmount(''); setRefundReason('');
      loadTransactions(txPage, txFrom, txTo, txSearch);
    } catch {
      setRefundError('Network error — the refund may or may not have gone through. Check Stripe before retrying.');
    } finally {
      setRefundBusy(false);
    }
  }

  // Review (no-silent-failures): these three used to fetch without a
  // try/catch, so a dropped connection left the button on "Sending…" forever.
  async function resendSetup(staffId: string, staffName: string) {
    setResendingId(staffId); setResendMsg('');
    try {
    const r = await fetch('/api/admin/resend-staff-setup', {
      method: 'POST', headers: H(), body: JSON.stringify({ staffId }),
    });
    const d = r.ok ? null : await r.json().catch(() => ({}));
    setResendMsg(r.ok ? `Login email sent to ${staffName}` : `Error: ${d?.error || `the email was not sent (${r.status}) — try again.`}`);
    } catch {
      setResendMsg('Error: network — the email was not sent. Try again.');
    } finally {
      setResendingId(null);
    }
  }

  async function sendCoursePreview() {
    if (!detail?.course.operator?.email) return;
    setSendingPreview(true); setPreviewMsg('');
    try {
      const r = await fetch('/api/preview/send', {
        method: 'POST', headers: H(), body: JSON.stringify({ courseId }),
      });
      const d = await r.json().catch(() => ({}));
      setPreviewMsg(r.ok ? `Preview + dashboard access sent to ${detail.course.operator.email}` : ('Error: ' + (d.error || `Failed (${r.status})`)));
      if (r.ok) loadDetail();
    } catch {
      setPreviewMsg('Error: network — nothing was sent. Try again.');
    } finally {
      setSendingPreview(false);
    }
  }

  async function requestReReview() {
    setRequestingReReview(true); setPreviewMsg('');
    try {
      const r = await fetch('/api/admin/request-re-review', {
        method: 'POST', headers: H(), body: JSON.stringify({ courseId }),
      });
      const d = await r.json().catch(() => ({}));
      setPreviewMsg(r.ok ? 'Re-review requested — Send Preview is available again.' : ('Error: ' + (d.error || `Failed (${r.status})`)));
      if (r.ok) loadDetail();
    } catch {
      setPreviewMsg('Error: network — nothing was changed. Try again.');
    } finally {
      setRequestingReReview(false);
    }
  }

  const c = detail?.course;

  return {
    courseId,
    router,
    adminReady,
    detail,
    setDetail,
    loading,
    setLoading,
    loadError,
    setLoadError,
    tab,
    setTab,
    checkinFocus,
    setCheckinFocus,
    verifyBusy,
    setVerifyBusy,
    verifyMsg,
    setVerifyMsg,
    setupForm,
    setSetupForm,
    setupSaving,
    setSetupSaving,
    phoneState,
    setPhoneState,
    setupMsg,
    setSetupMsg,
    sched,
    schedules,
    newSchedule,
    setNewSchedule,
    showAddSched,
    setShowAddSched,
    schedSaving,
    setSchedSaving,
    schedMsg,
    setSchedMsg,
    editSched,
    setEditSched,
    editSaving,
    setEditSaving,
    editError,
    setEditError,
    tsDate,
    setTsDate,
    ts,
    tsSlots,
    tsLoading,
    slotBusy,
    setSlotBusy,
    opNote,
    setOpNote,
    manualSlot,
    setManualSlot,
    manualForm,
    setManualForm,
    manualSaving,
    setManualSaving,
    manualError,
    setManualError,
    txItems,
    setTxItems,
    refundTarget,
    setRefundTarget,
    refundAmount,
    setRefundAmount,
    refundReason,
    setRefundReason,
    refundBusy,
    setRefundBusy,
    refundError,
    setRefundError,
    refundNote,
    setRefundNote,
    txLoading,
    setTxLoading,
    txError,
    setTxError,
    txPage,
    setTxPage,
    txPages,
    setTxPages,
    txTotal,
    setTxTotal,
    txFrom,
    setTxFrom,
    txTo,
    setTxTo,
    txSearch,
    setTxSearch,
    membersData,
    setMembersData,
    membersError,
    setMembersError,
    schedDeleteTarget,
    setSchedDeleteTarget,
    schedDeleteBusy,
    setSchedDeleteBusy,
    schedDeleteError,
    setSchedDeleteError,
    membersLoading,
    setMembersLoading,
    resendingId,
    setResendingId,
    resendMsg,
    setResendMsg,
    sendingPreview,
    setSendingPreview,
    previewMsg,
    setPreviewMsg,
    showPreviewConfirm,
    setShowPreviewConfirm,
    requestingReReview,
    setRequestingReReview,
    thr,
    msgThread,
    msgLoading,
    msgError,
    setMsgError,
    msgCompose,
    setMsgCompose,
    msgSending,
    setMsgSending,
    dangerOpen,
    setDangerOpen,
    archiveBusy,
    setArchiveBusy,
    liveToggleBusy,
    setLiveToggleBusy,
    closurePrompt,
    setClosurePrompt,
    closureBusy,
    setClosureBusy,
    closureError,
    setClosureError,
    liveBlockReason,
    setLiveBlockReason,
    liveBlockMissing,
    setLiveBlockMissing,
    reminderNudgeBusy,
    setReminderNudgeBusy,
    reminderNudgeSent,
    setReminderNudgeSent,
    reminderNudgeError,
    setReminderNudgeError,
    docsData,
    setDocsData,
    docsLoading,
    setDocsLoading,
    noteDraft,
    setNoteDraft,
    noteSaving,
    setNoteSaving,
    docUploading,
    setDocUploading,
    docsError,
    setDocsError,
    remindersBusy,
    setRemindersBusy,
    remindersError,
    setRemindersError,
    H,
    loadSchedules,
    loadTeeSheet,
    loadTransactions,
    loadMembers,
    loadDocuments,
    loadCourseThread,
    loadDetail,
    markVerified,
    toggleActive,
    sendGoLiveReminder,
    archiveCourse,
    restoreCourse,
    toggleRemindersPaused,
    addClientNote,
    uploadDocument,
    saveSetup,
    savePhone,
    openOperate,
    schedulePayload,
    addSchedule,
    beginScheduleEdit,
    saveScheduleEdit,
    deleteSchedule,
    blockSlot,
    cancelBooking,
    addManualBooking,
    sendCourseMessage,
    submitRefund,
    resendSetup,
    sendCoursePreview,
    requestReReview,
    c,
  };
}

export type CourseDetailState = ReturnType<typeof useCourseDetail>;
