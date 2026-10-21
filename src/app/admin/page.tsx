'use client';
// AW-4 (Cam 2026-10-21): Today — four sections only. Needs you now (each item
// with its one fix), Platform health (red/green), Money this month vs the same
// point last month, Onboarding by stage with stuck courses named. No daily fee
// tile, no unread count, no ticker. Data: /api/admin/today, which leaves out
// (null) any section the signed-in role can't see.
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
}
interface Today {
  needs: { rows: ActionRow[]; redCount: number; amberCount: number } | null;
  health: {
    jobs: { total: number; bad: { job: string; note: string }[]; notYetRun: number };
    stripeWebhook: { lastAt: string | null; ok: boolean; lastError: string | null };
    payments: { live: number; blocked: number };
  } | null;
  money: {
    from: string; daysIn: number;
    current: { rounds: number; volume: number; fees: number };
    prior: { rounds: number; volume: number; fees: number };
    net: { current: number | null; prior: number | null; stripeUnavailable: boolean } | null;
  } | null;
  onboarding: {
    stuckDays: number;
    stages: { key: string; label: string; count: number; stuck: { id: string; name: string; days: number; waitingOn: string }[] }[];
  } | null;
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

function QueueRow({ row, expanded, onToggle, fireStatus, fireError, onFire, canFire }: {
  row: ActionRow; expanded: boolean; onToggle: () => void; fireStatus: FireStatus; fireError?: string; onFire: () => void; canFire: boolean;
}) {
  const router = useRouter();
  const hasItems = (row.items?.length ?? 0) > 0;
  return (
    <div className="border-b border-line-soft last:border-0">
      <div className="flex items-center gap-3 py-2.5">
        <StatusDot status={row.severity} />
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-medium text-ink truncate">{row.who}</div>
          <div className="text-[12.5px] text-ink-soft truncate">{row.why}{row.ageDays > 0 ? ` · ${row.ageDays}d` : ''}</div>
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

/** "vs $X by this day last month", with the move. */
function Versus({ cur, prior }: { cur: number | null; prior: number | null }) {
  if (cur === null || prior === null) return <span className="text-[12px] text-ink-muted">last month unavailable</span>;
  const diff = cur - prior;
  if (Math.abs(diff) < 0.005) return <span className="text-[12px] text-ink-muted">same as this point last month</span>;
  return (
    <span className="text-[12px] text-ink-muted">
      {fmtMoney(prior)} by now last month · <span className={diff > 0 ? 'text-ok' : 'text-bad'}>{diff > 0 ? '+' : '−'}{fmtMoney(Math.abs(diff))}</span>
    </span>
  );
}

function MoneyLine({ label, cur, prior }: { label: string; cur: number | null; prior: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-line-soft last:border-0">
      <span className="text-[13.5px] text-ink">{label}</span>
      <span className="text-right">
        <span className="block text-[15px] font-semibold tabular-nums text-ink">{fmtMoney(cur)}</span>
        <Versus cur={cur} prior={prior} />
      </span>
    </div>
  );
}

function HealthLine({ ok, text, href }: { ok: boolean | null; text: string; href?: string }) {
  const body = (
    <span className="flex items-start gap-2 py-1.5 text-[13.5px] text-ink">
      <span className="mt-[7px]"><StatusDot status={ok === null ? 'warn' : ok ? 'ok' : 'bad'} /></span>
      <span>{text}</span>
    </span>
  );
  return href ? <Link href={href} className="block hover:bg-paper/70 rounded-md -mx-1 px-1">{body}</Link> : body;
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
    return true;
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
  const rows = needs ? (showAll ? needs.rows : needs.rows.slice(0, SHOW_ROWS)) : [];
  const h = data?.health;
  const m = data?.money;
  const o = data?.onboarding;
  const badJobs = h?.jobs.bad ?? [];

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="overview" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-[1200px]">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-[30px] leading-none font-serif font-semibold text-ink">Today</h1>
              <p className="text-[13.5px] text-ink-soft mt-2">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                {lastUpdated && <span className="text-ink-muted"> · updated {fmtAgo(lastUpdated, Date.now())}</span>}
              </p>
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

          {data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {needs && (
                <div className="lg:col-span-2">
                  <Section title={`Needs you now${needs.rows.length ? ` · ${needs.rows.length}` : ''}`}>
                    {needs.rows.length === 0 ? (
                      <p className="text-[13.5px] text-ink flex items-center gap-2"><StatusDot status="ok" />Nothing needs you right now.</p>
                    ) : (
                      <>
                        {rows.map(row => (
                          <QueueRow
                            key={row.id} row={row}
                            expanded={expanded.has(row.id)}
                            onToggle={() => setExpanded(prev => { const n = new Set(prev); if (n.has(row.id)) n.delete(row.id); else n.add(row.id); return n; })}
                            fireStatus={fireStatuses[row.id] ?? 'idle'} fireError={fireErrors[row.id]}
                            onFire={() => fire(row)} canFire={canFire(row)}
                          />
                        ))}
                        {needs.rows.length > SHOW_ROWS && (
                          <button type="button" onClick={() => setShowAll(v => !v)} className="mt-2 text-[13px] text-ink-soft hover:text-ink">
                            {showAll ? 'Show fewer' : `Show all ${needs.rows.length}`}
                          </button>
                        )}
                      </>
                    )}
                  </Section>
                </div>
              )}

              {h && (
                <Section title="Platform health" href="/admin/system" linkLabel="Open Health">
                  <HealthLine
                    ok={badJobs.length > 0 ? false : h.jobs.notYetRun === h.jobs.total ? null : true}
                    href="/admin/system"
                    text={badJobs.length > 0
                      ? `${badJobs.length} scheduled job${badJobs.length === 1 ? '' : 's'} failing: ${badJobs.map(j => `${j.job} — ${j.note}`).join('; ')}`
                      : h.jobs.notYetRun === h.jobs.total
                        ? 'No scheduled job has reported a run yet'
                        : `${h.jobs.total - h.jobs.notYetRun} scheduled job${h.jobs.total - h.jobs.notYetRun === 1 ? '' : 's'} ran on time${h.jobs.notYetRun ? `; ${h.jobs.notYetRun} haven't run yet` : ''}`}
                  />
                  <HealthLine
                    ok={h.stripeWebhook.lastAt === null ? null : h.stripeWebhook.ok}
                    href="/admin/system"
                    text={h.stripeWebhook.lastAt === null
                      ? 'No Stripe event recorded yet'
                      : h.stripeWebhook.lastError
                        ? `Stripe's last event failed: ${h.stripeWebhook.lastError}`
                        : `Stripe events arriving — last ${fmtAgo(new Date(h.stripeWebhook.lastAt).getTime(), Date.now())}${h.stripeWebhook.ok ? '' : ', which is too long ago'}`}
                  />
                  <HealthLine
                    ok={h.payments.blocked === 0}
                    href="/admin/courses"
                    text={h.payments.blocked === 0
                      ? `All ${h.payments.live} live course${h.payments.live === 1 ? '' : 's'} can take payments`
                      : `${h.payments.blocked} of ${h.payments.live} live courses can't take payments (Stripe not finished)`}
                  />
                </Section>
              )}

              {m && (
                <Section title="Money this month" href="/admin/revenue" linkLabel="Open Revenue">
                  <MoneyLine label="Booked through courses" cur={m.current.volume} prior={m.prior.volume} />
                  <MoneyLine label="GreenReserve fees" cur={m.current.fees} prior={m.prior.fees} />
                  {m.net && <MoneyLine label="Net after Stripe and expenses" cur={m.net.current} prior={m.net.prior} />}
                  <p className="mt-2 text-[12px] text-ink-muted">
                    {m.current.rounds} round{m.current.rounds === 1 ? '' : 's'} paid since the 1st, against the same {m.daysIn} day{m.daysIn === 1 ? '' : 's'} of last month.
                    {m.net?.stripeUnavailable && ' Stripe didn’t answer, so net is missing — try again.'}
                  </p>
                </Section>
              )}

              {o && (
                <Section title="Onboarding" href="/admin/inquiries" linkLabel="Open Inquiries">
                  {o.stages.map(st => (
                    <div key={st.key} className="py-2 border-b border-line-soft last:border-0">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[13.5px] text-ink">{st.label}</span>
                        <span className="text-[13.5px] font-semibold tabular-nums text-ink">{st.count}</span>
                      </div>
                      {st.stuck.map(s => (
                        <Link key={s.id} href={`/admin/inquiries/${s.id}`} className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-soft hover:text-ink">
                          <StatusDot status="warn" />
                          <span className="truncate">{s.name} — {s.days} days in this stage{s.waitingOn === 'them' ? ', waiting on the course' : s.waitingOn === 'us' ? ', waiting on us' : ''}</span>
                        </Link>
                      ))}
                    </div>
                  ))}
                  <p className="mt-2 text-[12px] text-ink-muted">Stuck means {o.stuckDays}+ days in one stage, not snoozed.</p>
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
