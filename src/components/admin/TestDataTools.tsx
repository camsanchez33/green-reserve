'use client';
// TEST-1 (Cam 2026-10-22): the owner's two tools from src/lib/data-reset.ts —
// the launch wipe (Systems) and a test course's mark and reset (course page).
// Both show what they will clear before anything happens; the routes ask for
// the second step and a reason through adminFetch.
import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT } from '@/components/ui/field';

type WipePreview = { open: boolean; closesAt: string; confirmWords: string; wiped: Record<string, number>; kept: Record<string, number> };

// The handful of numbers worth reading before the wipe; every table is still cleared.
const WIPE_SUMMARY: [string, string][] = [
  ['Course', 'courses'], ['CourseOperator', 'course logins'], ['GolferAccount', 'golfer accounts'], ['Booking', 'bookings'],
  ['CourseInquiry', 'inquiries'], ['Call', 'calls'], ['MessageThread', 'conversations'], ['Announcement', 'announcements'],
];

export function LaunchWipeCard() {
  const [preview, setPreview] = useState<WipePreview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    const r = await adminFetch<WipePreview>('/api/admin/data-reset', { subject: 'the test data counts' });
    if (!r.ok) { setLoadError(r.message); return; }
    setPreview(r.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function wipe() {
    if (!preview) return;
    setBusy(true); setError('');
    const r = await adminFetch<{ cleared: Record<string, number> }>('/api/admin/data-reset', {
      method: 'POST', body: JSON.stringify({ confirm: typed }), action: 'save', subject: 'the wipe',
    });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setDone(Object.values(r.data.cleared).reduce((a, b) => a + b, 0));
    setConfirming(false); setTyped('');
    load();
  }

  if (loadError) return (
    <div role="alert" className="text-[13.5px] text-bad">{loadError} <button type="button" onClick={load} className="underline">Try again</button></div>
  );
  if (!preview) return <p className="text-[13.5px] text-ink-muted">Counting test data…</p>;

  const total = Object.values(preview.wiped).reduce((a, b) => a + b, 0);
  const closes = new Date(preview.closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  return (
    <div className="flex flex-col gap-3 text-[14px]">
      <p className="text-ink-soft">
        Every course, golfer, booking, inquiry, conversation and announcement on the site is test data until launch. This clears all of it in one go, so the site starts clean.
        Kept: admin logins, goals, expenses, company documents, agreement versions and the audit record. Stripe is not touched — refund any real test charge there.
        Available until {closes}, then it switches off for good.
      </p>
      {done !== null && <p role="status" className="text-ok"><StatusDot status="ok" label="" /> Cleared {done.toLocaleString()} records.</p>}
      <div className="border border-line rounded-lg divide-y divide-line-soft">
        {WIPE_SUMMARY.map(([t, label]) => (
          <div key={t} className="flex justify-between px-4 py-2.5"><span className="text-ink-soft">{label}</span><span className="text-ink font-medium tabular-nums">{(preview.wiped[t] ?? 0).toLocaleString()}</span></div>
        ))}
        <div className="flex justify-between px-4 py-2.5"><span className="text-ink-soft">every record it clears, all tables</span><span className="text-ink font-semibold tabular-nums">{total.toLocaleString()}</span></div>
      </div>
      {!preview.open ? (
        <p className="text-ink-muted"><StatusDot status="neutral" label="" /> Closed — real courses are on the site. Reset a single test course from its page instead.</p>
      ) : !confirming ? (
        <div><button type="button" onClick={() => { setConfirming(true); setError(''); }} disabled={total === 0}
          className="border border-bad/40 text-bad hover:bg-bad/5 disabled:opacity-50 text-[13px] font-medium px-4 py-2 rounded-md transition-colors">Clear all test data…</button></div>
      ) : (
        <div className="bg-paper rounded-lg p-4 flex flex-col gap-3">
          <p className="text-ink">This deletes {total.toLocaleString()} records and cannot be undone from here (only a database restore brings them back). Type <strong>{preview.confirmWords}</strong> to confirm.</p>
          <input value={typed} onChange={e => setTyped(e.target.value)} aria-label="Confirmation words" className={`${INPUT_COMPACT} max-w-xs`} autoComplete="off" />
          {error && <p role="alert" className="text-bad text-[13.5px]">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={wipe} disabled={busy || typed !== preview.confirmWords}
              className="bg-bad hover:opacity-90 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 rounded-md">{busy ? 'Clearing…' : 'Clear all test data'}</button>
            <button type="button" onClick={() => { setConfirming(false); setTyped(''); setError(''); }} disabled={busy}
              className="text-[13px] text-ink-soft px-3 py-2">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

type CoursePreview = { courseId: string; name: string; isTest: boolean; activity: Record<string, number> };
const ACTIVITY_LABELS: [string, string][] = [
  ['bookings', 'bookings'], ['members', 'members'], ['residents', 'residents'], ['shopSales', 'shop sales'],
  ['events', 'events'], ['threads', 'conversations'], ['alerts', 'problems'], ['sent', 'emails and texts sent'],
];

export function TestCourseCard({ courseId }: { courseId: string }) {
  const [p, setP] = useState<CoursePreview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    const r = await adminFetch<CoursePreview>(`/api/admin/test-course?courseId=${encodeURIComponent(courseId)}`, { subject: 'the test course details' });
    if (!r.ok) { setLoadError(r.message); return; }
    setP(r.data);
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  async function mark(isTest: boolean) {
    setBusy(true); setError(''); setNote('');
    const r = await adminFetch('/api/admin/test-course', { method: 'PATCH', body: JSON.stringify({ courseId, isTest }), action: 'save', subject: 'the test mark' });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setNote(isTest ? 'Marked as a test course.' : 'No longer a test course.');
    load();
  }

  async function reset() {
    if (!p) return;
    setBusy(true); setError(''); setNote('');
    const r = await adminFetch('/api/admin/test-course', { method: 'POST', body: JSON.stringify({ courseId, confirm: typed }), action: 'save', subject: 'the reset' });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setNote('Reset — its activity is cleared and every booked time is open again.');
    setConfirming(false); setTyped('');
    load();
  }

  if (loadError) return <p role="alert" className="text-[13.5px] text-bad">{loadError} <button type="button" onClick={load} className="underline">Try again</button></p>;
  if (!p) return null;
  const activity = ACTIVITY_LABELS.map(([k, l]) => [l, p.activity[k] ?? 0] as const).filter(([, n]) => n > 0);

  return (
    <div className="border border-line rounded-lg px-4 py-3 flex flex-col gap-2 text-[13.5px]">
      <div className="flex flex-wrap items-center gap-3">
        <StatusDot status={p.isTest ? 'warn' : 'neutral'} label={p.isTest ? 'Test course' : 'Not a test course'} />
        <span className="text-ink-soft flex-1 min-w-[200px]">{p.isTest ? 'Owner only: its activity can be cleared to test again. Its setup stays.' : 'Mark a course as a test to be able to reset it.'}</span>
        {p.isTest && !confirming && (
          <button type="button" onClick={() => { setConfirming(true); setError(''); setNote(''); }} disabled={busy}
            className="border border-bad/40 text-bad hover:bg-bad/5 disabled:opacity-50 text-[13px] font-medium px-3 py-1.5 rounded-md">Reset activity…</button>
        )}
        <button type="button" onClick={() => mark(!p.isTest)} disabled={busy}
          className="border border-line text-ink hover:bg-paper disabled:opacity-50 text-[13px] font-medium px-3 py-1.5 rounded-md">{p.isTest ? 'Unmark' : 'Mark as test course'}</button>
      </div>
      {note && <p role="status" className="text-ok">{note}</p>}
      {error && <p role="alert" className="text-bad">{error}</p>}
      {confirming && (
        <div className="bg-paper rounded-md p-3 flex flex-col gap-2">
          <p className="text-ink">
            Clears {activity.length ? activity.map(([l, n]) => `${n} ${l}`).join(', ') : 'nothing yet — there is no activity'}. Kept: the course, its logins, schedule, prices, tee sets, shop catalogue, staff, photos and agreement.
            Type <strong>{p.name}</strong> to confirm.
          </p>
          <input value={typed} onChange={e => setTyped(e.target.value)} aria-label="Course name" className={`${INPUT_COMPACT} max-w-xs`} autoComplete="off" />
          <div className="flex gap-2">
            <button type="button" onClick={reset} disabled={busy || typed.trim() !== p.name.trim()}
              className="bg-bad hover:opacity-90 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-1.5 rounded-md">{busy ? 'Resetting…' : 'Reset activity'}</button>
            <button type="button" onClick={() => { setConfirming(false); setTyped(''); }} disabled={busy} className="text-[13px] text-ink-soft px-3">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
