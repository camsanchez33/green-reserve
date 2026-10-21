'use client';
// AW-4b (Cam 2026-10-21, second pass: "as the owner what do I really need to
// see"): Today is one health line, Needs you now (only what isn't about one
// course: the inquiry rows), then every course as a card with its own to-dos,
// "Staff seen" and its fees this month. No Money or Onboarding card (Revenue and
// Inquiries hold them). Data: /api/admin/today, which leaves out (null) any
// section the signed-in role can't see.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, RefreshCw } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import { SUPPORT_PLUS, MANAGER_PLUS } from '@/lib/admin-roles';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
import { formatMoney as fmtMoney, formatRelative as fmtAgo } from '@/lib/format';

interface QueueItem { id: string; label: string; ageDays: number }
interface ActionRow {
  id: string; who: string; why: string; doThis: string; ageDays: number; severity: 'bad' | 'warn';
  actionLabel: string; href: string; items?: QueueItem[];
  fire?: { kind: 'resend_preview' | 'resend_sheet' | 'send_nudge'; inquiryId?: string; courseId?: string };
  courseId?: string;
}
interface TodayCourse {
  id: string; name: string; live: boolean;
  staffSeenAt: string | null; staffQuiet: boolean;
  feesThisMonth: number;
  rows: ActionRow[];
}
interface Today {
  needs: ActionRow[] | null;
  health: {
    jobs: { total: number; bad: { job: string; note: string }[]; notYetRun: number };
    stripeWebhook: { lastAt: string | null; ok: boolean; lastError: string | null };
    payments: { live: number; blocked: number };
  } | null;
  courses: TodayCourse[] | null;
  at: string;
}

const REFRESH_MS = 5 * 60 * 1000;
const SHOW_ROWS = 8;
type FireStatus = 'idle' | 'pending' | 'success' | 'error';
const FIRE_LABELS: Record<string, string> = { resend_preview: 'Resend preview', resend_sheet: 'Resend sheet', send_nudge: 'Send nudge' };

function Section({ title, href, linkLabel, children }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {href && <Link href={href} className="text-[13px] text-ink-soft hover:text-ink">{linkLabel}</Link>}
      </div>
      {children}
    </Card>
  );
}

function QueueRow({ row, expanded, onToggle, fireStatus, fireError, onFire, canFire, hideWho }: {
  row: ActionRow; expanded: boolean; onToggle: () => void; fireStatus: FireStatus; fireError?: string; onFire: () => void; canFire: boolean;
  /** On a course card the course is the card's heading; the row says only what's wrong. */
  hideWho?: boolean;
}) {
  const router = useRouter();
  const hasItems = (row.items?.length ?? 0) > 0;
  return (
    <div className="border-b border-line-soft last:border-0">
      <div className="flex items-center gap-3 py-2.5">
        <StatusDot status={row.severity} />
        <div className="flex-1 min-w-0">
          {!hideWho && <div className="text-[13.5px] font-medium text-ink truncate">{row.who}</div>}
          <div className={hideWho ? 'text-[13.5px] font-medium text-ink truncate' : 'text-[12.5px] text-ink-soft truncate'}>{row.why}{row.ageDays > 0 ? ` · ${row.ageDays}d` : ''}</div>
          <div className="text-[12px] text-ink-muted truncate">{row.doThis}</div>
        </div>
        {row.fire && canFire && (
          fireStatus === 'success' ? (
            <span className="shrink-0 text-xs font-medium text-ok flex items-center gap-1"><StatusDot status="ok" />Sent</span>
          ) : (
            <button
              type="button" onClick={onFire} disabled={fireStatus === 'pending'}
              className="shrink-0 text-xs font-medium text-pine px-2.5 py-1.5 rounded-md border border-line hover:border-pine/40 transition-colors disabled:opacity-50"
            >
              {fireStatus === 'pending' ? 'Sending…' : fireStatus === 'error' ? 'Failed — retry' : FIRE_LABELS[row.fire.kind]}
            </button>
          )
        )}
        <button type="button" onClick={() => router.push(row.href)} className="shrink-0 text-xs font-medium text-white bg-pine hover:bg-pine-hover px-2.5 py-1.5 rounded-md">{row.actionLabel}</button>
        {hasItems && (
          <button type="button" onClick={onToggle} aria-label={expanded ? 'Hide the list' : 'Show the list'} aria-expanded={expanded} className="shrink-0 text-ink-faint hover:text-ink">
            <ChevronRight aria-hidden="true" className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        )}
      </div>
      {/* RV-2: a failed quick action says why — a 409 (already approved) can never succeed on retry. */}
      {fireStatus === 'error' && fireError && <p role="alert" className="pb-2 -mt-1 text-xs text-bad">{fireError}</p>}
      {hasItems && expanded && (
        <div className="pb-2 pl-5 space-y-1">
          {row.items!.map(it => (
            <div key={it.id} className="text-xs text-ink-soft flex justify-between"><span>{it.label}</span><span className="text-ink-muted">{it.ageDays}d</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Health as ONE line: green says so in four words; red names every problem. */
function healthLine(h: NonNullable<Today['health']>): { ok: boolean; text: string } {
  const problems: string[] = [];
  for (const j of h.jobs.bad) problems.push(`${j.job} is failing (${j.note})`);
  if (h.stripeWebhook.lastError) problems.push(`Stripe's last event failed: ${h.stripeWebhook.lastError}`);
  else if (h.stripeWebhook.lastAt && !h.stripeWebhook.ok) problems.push(`no Stripe event since ${fmtAgo(new Date(h.stripeWebhook.lastAt).getTime(), Date.now())}`);
  if (h.payments.blocked > 0) problems.push(`${h.payments.blocked} live course${h.payments.blocked === 1 ? '' : 's'} can't take payments`);
  if (problems.length === 0) return { ok: true, text: 'Everything’s running.' };
  const t = problems.join('; ');
  return { ok: false, text: t.charAt(0).toUpperCase() + t.slice(1) + '.' };
}

function seenText(c: TodayCourse): string {
  if (!c.live) return 'Not live yet';
  if (!c.staffSeenAt) return 'Staff haven’t signed in yet';
  return `Staff seen ${fmtAgo(new Date(c.staffSeenAt).getTime(), Date.now())}`;
}

export default function AdminTodayPage() {
  const { role } = useAdminSession();
  const [data, setData] = useState<Today | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [fireStatuses, setFireStatuses] = useState<Record<string, FireStatus>>({});
  const [fireErrors, setFireErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/today');
      if (r.ok) { setData(await r.json()); setLastUpdated(Date.now()); setError(''); }
      else setError(r.status === 401 ? 'Your session ended — sign in again to refresh.' : 'Couldn’t refresh — what you see may be out of date.');
    } catch {
      setError('Network error — what you see may be out of date.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const refresh = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setTick(t => t + 1), 15000);
    return () => { clearInterval(refresh); clearInterval(tick); };
  }, [load]);

  function canFire(row: ActionRow) {
    if (!row.fire) return false;
    if (row.fire.kind === 'resend_sheet') return MANAGER_PLUS.includes(role);
    if (row.fire.kind === 'send_nudge') return SUPPORT_PLUS.includes(role);
    // /api/preview/send is manager+.
    return MANAGER_PLUS.includes(role);
  }

  async function fire(row: ActionRow) {
    if (!row.fire) return;
    setFireStatuses(s => ({ ...s, [row.id]: 'pending' }));
    try {
      let res: Response;
      if (row.fire.kind === 'resend_preview') {
        res = await fetch('/api/preview/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: row.fire.inquiryId }) });
      } else if (row.fire.kind === 'resend_sheet') {
        res = await fetch('/api/admin/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.fire.inquiryId, action: 'resend_details' }) });
      } else {
        res = await fetch('/api/admin/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: row.fire.courseId, body: 'Just checking in on this — let us know if you have any questions!' }) });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFireErrors(s => ({ ...s, [row.id]: d.error || `Failed (${res.status}).` }));
      }
      setFireStatuses(s => ({ ...s, [row.id]: res.ok ? 'success' : 'error' }));
    } catch {
      setFireErrors(s => ({ ...s, [row.id]: 'Network error — nothing was sent.' }));
      setFireStatuses(s => ({ ...s, [row.id]: 'error' }));
    }
  }

  const needs = data?.needs;
  const rows = needs ? (showAll ? needs : needs.slice(0, SHOW_ROWS)) : [];
  const health = data?.health ? healthLine(data.health) : null;
  const courses = data?.courses;
  const rowProps = (row: ActionRow) => ({
    row,
    expanded: expanded.has(row.id),
    onToggle: () => setExpanded(prev => { const n = new Set(prev); if (n.has(row.id)) n.delete(row.id); else n.add(row.id); return n; }),
    fireStatus: fireStatuses[row.id] ?? 'idle', fireError: fireErrors[row.id],
    onFire: () => fire(row), canFire: canFire(row),
  });

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="overview" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-[1000px]">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-[30px] leading-none font-serif font-semibold text-ink">Today</h1>
              <p className="text-[13.5px] text-ink-soft mt-2">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                {lastUpdated && <span className="text-ink-muted"> · updated {fmtAgo(lastUpdated, Date.now())}</span>}
              </p>
              {health && (
                <Link href="/admin/system" className="mt-2 flex items-center gap-2 text-[13.5px] text-ink hover:underline underline-offset-2">
                  <StatusDot status={health.ok ? 'ok' : 'bad'} />
                  <span className={health.ok ? '' : 'text-bad font-medium'}>{health.text}</span>
                </Link>
              )}
            </div>
            <button
              type="button" onClick={load} disabled={loading} aria-label="Refresh" title="Refresh"
              className="w-9 h-9 flex items-center justify-center rounded-md text-ink-soft hover:text-ink hover:bg-white border border-transparent hover:border-line transition-colors disabled:opacity-50"
            >
              <RefreshCw aria-hidden="true" className={`w-4 h-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-md border border-bad/20 bg-bad/5 px-4 py-2.5 flex items-start justify-between gap-3">
              <p className="text-xs text-bad">{error}</p>
              <button type="button" onClick={load} className="text-xs font-medium text-ink-soft hover:text-ink shrink-0">Try again</button>
            </div>
          )}
          {!data && loading && <p className="text-ink-muted text-center py-20 text-sm">Loading…</p>}

          {data && !needs && !courses && (
            <p className="text-[13.5px] text-ink-soft">
              Your role sees <Link href="/admin/inquiries" className="text-pine font-medium hover:underline">Inquiries</Link> and <Link href="/admin/courses" className="text-pine font-medium hover:underline">Courses</Link>.
            </p>
          )}

          {data && (needs || courses) && (
            <div className="space-y-5">
              {needs && (
                <Section title={`Needs you now${needs.length ? ` · ${needs.length}` : ''}`} href="/admin/inquiries" linkLabel="Open Inquiries">
                  {needs.length === 0 ? (
                    <p className="text-[13.5px] text-ink flex items-center gap-2"><StatusDot status="ok" />No inquiries waiting on you.</p>
                  ) : (
                    <>
                      {rows.map(row => <QueueRow key={row.id} {...rowProps(row)} />)}
                      {needs.length > SHOW_ROWS && (
                        <button type="button" onClick={() => setShowAll(v => !v)} className="mt-2 text-[13px] text-ink-soft hover:text-ink">
                          {showAll ? 'Show fewer' : `Show all ${needs.length}`}
                        </button>
                      )}
                    </>
                  )}
                </Section>
              )}

              {courses && (
                <Section title={`Courses · ${courses.filter(c => c.live).length} live`} href="/admin/courses" linkLabel="Open Courses">
                  {courses.length === 0 ? (
                    <p className="text-[13.5px] text-ink-soft">No courses yet. A course appears here once it is built from its inquiry.</p>
                  ) : courses.map(c => (
                    <div key={c.id} className="py-3 border-b border-line-soft last:border-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <Link href={`/admin/courses/${c.id}`} className="text-[14.5px] font-semibold text-ink hover:underline underline-offset-2 truncate">{c.name}</Link>
                        <Link href={`/admin/courses/${c.id}`} className="shrink-0 text-[13px] text-ink-soft hover:text-ink">Open</Link>
                      </div>
                      <p className="mt-0.5 text-[13px] text-ink-soft flex items-center gap-2 flex-wrap">
                        {c.staffQuiet && <StatusDot status="warn" />}
                        <span className={c.staffQuiet ? 'text-warn' : ''}>{seenText(c)}</span>
                        {c.live && <span className="text-ink-muted">·</span>}
                        {c.live && <span className="tabular-nums">{fmtMoney(c.feesThisMonth)} in fees this month</span>}
                      </p>
                      {c.rows.length > 0 && (
                        <div className="mt-1 pl-1">
                          {c.rows.map(row => <QueueRow key={row.id} {...rowProps(row)} hideWho />)}
                        </div>
                      )}
                    </div>
                  ))}
                  {courses.some(c => c.staffQuiet) && (
                    <p className="mt-2 text-[12px] text-ink-muted">Amber: nobody from the course has opened the dashboard in 3 days while it had tee times.</p>
                  )}
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
