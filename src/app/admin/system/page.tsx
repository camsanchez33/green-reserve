'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch, LOGIN_SESSION_ENDED, type AdminFetchFailure } from '@/lib/admin-fetch';
import { LoadFailure } from '@/components/ui/ErrorState';
import { HardDrive, Clock3, Zap, GitBranch, Bug, ExternalLink, Landmark, Link2 } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

interface SystemData {
  lastStripeTouch: { courseName: string; updatedAt: string } | null;
  links: {
    backups: string; ci: string; commits: string;
    vercel: string; vercelIsDeep: boolean;
    sentry: string; sentryIsDeep: boolean;
    stripeWebhooks: string;
  };
  crons: { path: string; schedule: string; human: string }[];
  platform: {
    accessFeeCents: number; env: string; commitSha: string; commitMessage: string; branch: string; publicUrl: string;
    integrations: { stripe: boolean; stripeWebhook: boolean; resend: boolean; twilio: boolean; sentry: boolean; blob: boolean };
  };
}
interface PlatformStripe {
  balance: { available: number; pending: number; currency: string };
  nextPayout: { amount: number; arrivalDate: string; status: string } | null;
}
// Moved here from the Courses list (MP-8a) — the sweep is a data-integrity
// check, not a course-management feature.
interface OrphanSweepItem { kind: 'course' | 'inquiry'; id: string; name: string; action: string; reason: string }
interface AcknowledgedOrphan { id: string; name: string; archivedAt: string }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
const fmtMoney = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function SystemCard({ icon, title, right, children }: { icon: React.ReactNode; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-line rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-ink-muted">{icon}</span>
          <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">{title}</div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function OutLink({ href, children, deep = true }: { href: string; children: React.ReactNode; deep?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover">
      {children} <ExternalLink className="w-3 h-3"/>
      {!deep && <span className="text-ink-faint font-normal">(generic — not project-deep)</span>}
    </a>
  );
}

export default function AdminSystemPage() {
  const router = useRouter();
  const [adminReady, setAdminReady] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [data, setData] = useState<SystemData | null>(null);
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [stripe, setStripe] = useState<PlatformStripe | null>(null);
  const [stripeNote, setStripeNote] = useState('');

  // Orphan sweep — identical behaviour to what the Courses list had.
  const [orphanNote, setOrphanNote] = useState('');
  const [orphanItems, setOrphanItems] = useState<OrphanSweepItem[]>([]);
  const [orphanAcknowledged, setOrphanAcknowledged] = useState<AcknowledgedOrphan[]>([]);
  const [orphanChecked, setOrphanChecked] = useState(false);
  const [orphanChecking, setOrphanChecking] = useState(false);
  const [orphanRunning, setOrphanRunning] = useState(false);
  const [orphanResult, setOrphanResult] = useState('');
  const [orphanFailed, setOrphanFailed] = useState(false);
  const [forceDeleteTarget, setForceDeleteTarget] = useState<AcknowledgedOrphan | null>(null);
  const [forceDeleteConfirm, setForceDeleteConfirm] = useState('');
  const [forceDeleteBusy, setForceDeleteBusy] = useState(false);
  const [forceDeleteError, setForceDeleteError] = useState('');

  const H = useCallback(() => ({ 'Content-Type': 'application/json' }), []);

  useEffect(() => {
    fetch('/api/admin/session').then(r => {
      if (!r.ok) { router.push(LOGIN_SESSION_ENDED); return; }
      return r.json();
    }).then(d => { if (d) { setIsOwner(d?.role === 'owner'); setAdminReady(true); } }).catch(() => router.push(LOGIN_SESSION_ENDED));
  }, [router]);

  useEffect(() => {
    if (!adminReady) return;
    // MP-2e: MP-2d gated this route at MANAGER_PLUS and left the consumer's
    // empty catch in place, so a denial rendered as "No Stripe-connected
    // courses yet" — a fabricated fact, reachable from Overview's Systems
    // button, which every role sees.
    adminFetch<SystemData>('/api/admin/system', { subject: 'system status' })
      .then(res => {
        if (!res.ok) { setLoadError({ msg: res.message, kind: res.kind }); return; }
        setData(res.data); setLoadError(null);
      });
  }, [adminReady]);

  // Owner-only, and the route says so itself when the session lacks 2FA.
  useEffect(() => {
    if (!adminReady || !isOwner) return;
    adminFetch<PlatformStripe>('/api/admin/platform-stripe?period=30d', { subject: 'the platform Stripe balance' })
      .then(res => { if (res.ok) setStripe(res.data); else setStripeNote(res.message); });
  }, [adminReady, isOwner]);

  // MP-2e: MP-2d gated this GET at requireOwner (role owner AND mfa), so the
  // panel silently disappeared for managers and for any owner on a
  // password-only session — the route even carries ownerGateError copy telling
  // them to sign in at /admin/owner-login, and this threw it away. A 403 is
  // expected for managers, so it is a quiet note rather than an error banner.
  const checkOrphans = useCallback(async () => {
    setOrphanChecking(true);
    const res = await adminFetch<{ items?: OrphanSweepItem[]; acknowledged?: AcknowledgedOrphan[] }>(
      '/api/admin/orphan-sweep', { subject: 'the orphan sweep' });
    setOrphanChecking(false);
    setOrphanChecked(true);
    if (!res.ok) {
      setOrphanItems([]); setOrphanAcknowledged([]);
      setOrphanNote(res.message);
      return;
    }
    setOrphanNote('');
    setOrphanItems(res.data.items ?? []);
    setOrphanAcknowledged(res.data.acknowledged ?? []);
  }, []);

  // MP-2d B4: no try/catch, so a rejected fetch left orphanRunning true and the
  // button read "Cleaning up..." until a reload.
  async function runOrphanSweep() {
    setOrphanRunning(true); setOrphanResult(''); setOrphanFailed(false);
    try {
      const r = await fetch('/api/admin/orphan-sweep', { method: 'POST', headers: H() });
      if (r.ok) {
        const d = await r.json();
        setOrphanResult(`Cleaned up ${d.items.length} item${d.items.length === 1 ? '' : 's'}: ` + d.items.map((i: OrphanSweepItem) => `"${i.name}" ${i.action}`).join('; '));
        setOrphanItems([]);
        checkOrphans();
      } else {
        const d = await r.json().catch(() => ({}));
        setOrphanFailed(true); setOrphanResult('Sweep failed: ' + (d.error || 'unknown error'));
      }
    } catch {
      setOrphanFailed(true); setOrphanResult('Sweep failed: network error — nothing was changed.');
    } finally {
      setOrphanRunning(false);
    }
  }

  // Owner-authorized override — hard-deletes ONE specific acknowledged
  // orphan regardless of its (fake/test) history. The server independently
  // re-verifies it's still an orphan and the typed name matches before
  // touching anything.
  async function runForceDelete() {
    if (!forceDeleteTarget) return;
    setForceDeleteBusy(true); setForceDeleteError('');
    try {
      const r = await fetch('/api/admin/orphan-sweep', {
        method: 'POST', headers: H(),
        body: JSON.stringify({ forceDeleteId: forceDeleteTarget.id, confirmName: forceDeleteConfirm }),
      });
      if (r.ok) {
        const d = await r.json();
        setOrphanResult(`Permanently deleted "${d.deleted.name}": ${d.deleted.bookings} booking(s), ${d.deleted.paidMemberships} paid membership(s), ${d.deleted.staff} staff row(s)${d.deleted.operatorDeleted ? ', operator login' : ''}.`);
        setForceDeleteTarget(null);
        setForceDeleteConfirm('');
        checkOrphans();
      } else {
        const d = await r.json().catch(() => ({}));
        setForceDeleteError(d.error || 'Delete failed — try again.');
      }
    } catch {
      setForceDeleteError('Network error — nothing was deleted. Check your connection and try again.');
    } finally {
      setForceDeleteBusy(false);
    }
  }

  if (!adminReady) return null;

  const p = data?.platform;
  const integrations: [string, boolean][] = p ? [
    ['Stripe', p.integrations.stripe], ['Stripe webhook', p.integrations.stripeWebhook],
    ['Resend', p.integrations.resend], ['Twilio', p.integrations.twilio],
    ['Sentry', p.integrations.sentry], ['Blob storage', p.integrations.blob],
  ] : [];

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="system" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-3xl">
          {loadError && (
            <div className="mb-5">
              <LoadFailure message={loadError.msg} kind={loadError.kind} onRetry={() => location.reload()} compact />
            </div>
          )}
          <div className="mb-7">
            <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">System</h1>
            <p className="text-sm text-ink-soft mt-0.5">30-second health check — what is deployed, what runs on a schedule, where to look when something breaks.</p>
          </div>

          <div className="space-y-4">
            {/* MP-8a: the read-only Platform card. "What's live right now?" was
                the one real argument for a Settings page; this answers it
                without adding a write surface. */}
            <SystemCard icon={<Landmark className="w-3.5 h-3.5"/>} title="Platform"
              right={p && <StatusDot status={p.env === 'production' ? 'ok' : 'warn'} label={p.env} />}>
              {p ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div><span className="text-ink-muted">Service fee</span><div className="text-ink font-medium">{fmtMoney(p.accessFeeCents / 100)} per player</div></div>
                    <div><span className="text-ink-muted">Deployed</span>
                      <div className="text-ink font-medium">
                        {p.commitSha ? <code className="font-mono text-xs bg-paper border border-line rounded px-1.5 py-0.5">{p.commitSha}</code> : <span className="text-ink-faint">local build</span>}
                        {p.branch && <span className="text-xs text-ink-muted ml-2">{p.branch}</span>}
                      </div>
                      {p.commitMessage && <div className="text-xs text-ink-soft mt-0.5 truncate" title={p.commitMessage}>{p.commitMessage}</div>}
                    </div>
                    {p.publicUrl && <div><span className="text-ink-muted">Public URL</span><div className="text-ink font-medium truncate">{p.publicUrl}</div></div>}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Integrations with keys set</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {integrations.map(([name, ok]) => <StatusDot key={name} status={ok ? 'ok' : 'bad'} label={name} />)}
                    </div>
                  </div>
                  {isOwner && (
                    <div className="pt-3 border-t border-line-soft">
                      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1.5">Platform Stripe balance</div>
                      {stripe ? (
                        <div className="flex items-center gap-6 text-sm">
                          <div><span className="text-ink-muted">Available</span> <span className="text-ink font-medium tabular-nums">{fmtMoney(stripe.balance.available)}</span></div>
                          <div><span className="text-ink-muted">Pending</span> <span className="text-ink font-medium tabular-nums">{fmtMoney(stripe.balance.pending)}</span></div>
                          <div><span className="text-ink-muted">Next payout</span> <span className="text-ink font-medium tabular-nums">{stripe.nextPayout ? `${fmtMoney(stripe.nextPayout.amount)} · ${stripe.nextPayout.arrivalDate}` : 'none scheduled'}</span></div>
                        </div>
                      ) : stripeNote ? (
                        <p className="text-xs text-warn">{stripeNote}</p>
                      ) : (
                        <p className="text-xs text-ink-faint">Loading…</p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    <OutLink href={data!.links.commits}>Commit history</OutLink>
                    <OutLink href={data!.links.vercel} deep={data!.links.vercelIsDeep}>Vercel project</OutLink>
                  </div>
                  {!data!.links.vercelIsDeep && (
                    <p className="text-[11px] text-ink-faint">Set <code className="font-mono">ADMIN_VERCEL_PROJECT_URL</code> in Vercel env to make that link land on this project — Vercel does not expose the team slug to the app.</p>
                  )}
                </div>
              ) : !loadError && <p className="text-sm text-ink-muted">Loading…</p>}
            </SystemCard>

            <SystemCard icon={<Clock3 className="w-3.5 h-3.5"/>} title="Crons"
              right={<span className="text-[11px] text-ink-faint">{data ? `${data.crons.length} scheduled` : ''}</span>}>
              {data && data.crons.length > 0 && (
                <div className="border border-line rounded-md divide-y divide-line-soft mb-3">
                  {data.crons.map(c => (
                    <div key={c.path} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <code className="font-mono text-xs text-ink">{c.path.replace('/api/cron/', '')}</code>
                      <span className="text-xs text-ink-soft">{c.human}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status="neutral"/>
                <span className="text-sm text-ink-soft">Schedules are read from <code className="font-mono text-xs">vercel.json</code>; whether each run succeeded is not tracked in-app yet — that needs a CronRunLog table (schema change). Check the Vercel logs.</span>
              </div>
              {data && <OutLink href={data.links.vercel} deep={data.links.vercelIsDeep}>Open Vercel</OutLink>}
            </SystemCard>

            {/* MP-8a: moved here from the Courses list. GET always dry-runs;
                the cleanup and the force-delete are explicit owner clicks. */}
            <SystemCard icon={<Link2 className="w-3.5 h-3.5"/>} title="Data integrity"
              right={
                <button
                  onClick={checkOrphans}
                  disabled={orphanChecking}
                  className={'px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-50 ' + (
                    orphanChecked ? 'text-ink border-line-strong bg-paper' : 'text-ink-muted border-line hover:border-line-strong hover:text-ink'
                  )}
                  title="Check for courses and inquiries that lost their link to each other"
                >
                  {orphanChecking ? 'Checking…' : orphanChecked && orphanItems.length === 0 && !orphanNote ? 'Checked — clean' : 'Run data check'}
                </button>
              }>
              <p className="text-sm text-ink-soft mb-3">
                Every course should trace back to the inquiry it came from, and every accepted inquiry to a course. This finds the ones that do not — read-only until you act.
              </p>
              {!orphanChecked && <p className="text-xs text-ink-faint">Not run yet this visit.</p>}
              {orphanNote && <p className="text-xs text-ink-muted">{orphanNote}</p>}
              {orphanChecked && !orphanNote && orphanItems.length === 0 && orphanAcknowledged.length === 0 && (
                <div className="flex items-center gap-2"><StatusDot status="ok" label="No orphaned records" /></div>
              )}

              {orphanItems.length > 0 && (
                <div className="px-4 py-3 rounded-md bg-warn/5 border border-warn/20 mb-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-sm font-medium text-warn">
                      {orphanItems.length} orphaned record{orphanItems.length === 1 ? '' : 's'} — no linked inquiry, or an inquiry pointing at a deleted course.
                    </span>
                    <button
                      onClick={runOrphanSweep}
                      disabled={orphanRunning}
                      className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-warn text-white hover:bg-warn/90 transition-colors disabled:opacity-50"
                    >
                      {orphanRunning ? 'Cleaning up…' : 'Clean up now'}
                    </button>
                  </div>
                  <ul className="space-y-0.5">
                    {orphanItems.map(i => (
                      <li key={i.kind + i.id} className="text-xs text-ink-soft">
                        <span className="font-medium">{i.name}</span> — {i.reason} <span className="text-ink-faint">(will be {i.action.replace('would_', '')})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* MP-2e: success and failure both wrote into orphanResult and this
                  banner was styled green unconditionally — "Sweep failed: network
                  error" was rendered as a success. */}
              {orphanResult && (
                <div className={'px-4 py-3 rounded-md border flex items-center justify-between gap-3 mb-3 ' + (orphanFailed ? 'bg-bad/5 border-bad/20' : 'bg-ok/5 border-ok/20')}>
                  <span className={'text-sm ' + (orphanFailed ? 'text-bad' : 'text-ok')}>{orphanResult}</span>
                  <button onClick={() => { setOrphanResult(''); setOrphanFailed(false); }} className="text-xs text-ink-muted hover:text-ink transition-colors">Dismiss</button>
                </div>
              )}
              {/* Acknowledged orphans (already archived + flagged by a prior
                  sweep) — informational only, never nags, but an owner can still
                  force-delete one individually (Cam's DaisyLinks exception). */}
              {orphanAcknowledged.length > 0 && (
                <div className="px-4 py-3 rounded-md bg-paper border border-line">
                  <div className="text-xs font-medium text-ink-muted mb-2">
                    {orphanAcknowledged.length} acknowledged orphan{orphanAcknowledged.length === 1 ? '' : 's'} — archived, flagged, no linked inquiry
                  </div>
                  <ul className="space-y-1">
                    {orphanAcknowledged.map(a => (
                      <li key={a.id} className="text-xs text-ink-soft flex items-center justify-between gap-3">
                        <span>{a.name} <span className="text-ink-faint">— archived {new Date(a.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
                        <button
                          onClick={() => { setForceDeleteTarget(a); setForceDeleteConfirm(''); setForceDeleteError(''); }}
                          className="text-bad hover:underline shrink-0"
                        >
                          Force delete permanently
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </SystemCard>

            <SystemCard icon={<HardDrive className="w-3.5 h-3.5"/>} title="Backups">
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status="neutral"/>
                <span className="text-sm text-ink-soft">Not tracked in-app — verify the nightly workflow ran in GitHub Actions.</span>
              </div>
              {data && <OutLink href={data.links.backups}>View backup runs</OutLink>}
            </SystemCard>

            <SystemCard icon={<Zap className="w-3.5 h-3.5"/>} title="Stripe Webhook">
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status={p ? (p.integrations.stripeWebhook ? 'neutral' : 'bad') : 'neutral'}/>
                <span className="text-sm text-ink-soft">
                  {p && !p.integrations.stripeWebhook
                    ? <strong className="text-bad">STRIPE_WEBHOOK_SECRET is not set — the webhook cannot be verified and every event is being rejected.</strong>
                    : data?.lastStripeTouch
                      ? <>Most recent Stripe-linked course update: <strong className="text-ink">{data.lastStripeTouch.courseName}</strong>, {fmtDate(data.lastStripeTouch.updatedAt)}</>
                      : 'No Stripe-connected courses yet.'}
                </span>
              </div>
              <p className="text-xs text-ink-faint mb-2">Approximate — we don’t log raw webhook receipts, this is the course record’s own updatedAt.</p>
              {data && <OutLink href={data.links.stripeWebhooks}>Open Stripe webhooks</OutLink>}
            </SystemCard>

            <SystemCard icon={<GitBranch className="w-3.5 h-3.5"/>} title="CI">
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status="neutral"/>
                <span className="text-sm text-ink-soft">Not polled in-app — check the latest GitHub Actions run.</span>
              </div>
              {data && <OutLink href={data.links.ci}>View CI runs</OutLink>}
            </SystemCard>

            <SystemCard icon={<Bug className="w-3.5 h-3.5"/>} title="Sentry">
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status={p ? (p.integrations.sentry ? 'neutral' : 'warn') : 'neutral'}/>
                <span className="text-sm text-ink-soft">
                  {p && !p.integrations.sentry
                    ? 'No Sentry DSN in this environment — errors here are not being reported.'
                    : 'Error tracking is wired in (client + server) — check Sentry for recent issues.'}
                </span>
              </div>
              {data && <OutLink href={data.links.sentry} deep={data.links.sentryIsDeep}>Open Sentry issues</OutLink>}
              {data && !data.links.sentryIsDeep && (
                <p className="text-[11px] text-ink-faint mt-1">Set <code className="font-mono">SENTRY_ORG</code> (and <code className="font-mono">SENTRY_PROJECT</code>) to deep-link.</p>
              )}
            </SystemCard>
          </div>
        </div>
      </div>

      {/* Force-delete confirm — owner-authorized override, typed name confirm,
          server re-verifies it's still an orphan before touching anything. */}
      {forceDeleteTarget && (
        <div className="fixed inset-0 bg-ink/30 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg border border-line max-w-md w-full p-5">
            <div className="text-sm font-medium text-ink mb-1">Permanently delete &quot;{forceDeleteTarget.name}&quot;?</div>
            <p className="text-xs text-ink-muted mb-3">
              This cannot be undone — deletes the course, its bookings, tee times, and staff, and the operator&apos;s login if this was their only course. Owner-authorized override: this bypasses the usual archive-only rule because this course is an acknowledged orphan with no real history behind the doctrine&apos;s protection.
            </p>
            {forceDeleteError && (
              <div className="text-xs text-bad mb-2">{forceDeleteError}</div>
            )}
            <label className="block text-[10px] uppercase tracking-[0.06em] text-ink-muted mb-1">Type &quot;{forceDeleteTarget.name}&quot; to confirm</label>
            <input
              value={forceDeleteConfirm}
              onChange={e => setForceDeleteConfirm(e.target.value)}
              className="w-full bg-paper border border-bad/30 rounded-md px-3 py-2 text-sm outline-none focus:border-bad/50 mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setForceDeleteTarget(null); setForceDeleteConfirm(''); setForceDeleteError(''); }}
                className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={runForceDelete}
                disabled={forceDeleteBusy || forceDeleteConfirm.trim().toLowerCase() !== forceDeleteTarget.name.trim().toLowerCase()}
                className="text-xs font-medium px-3 py-1.5 rounded-md text-white bg-bad hover:bg-bad/90 transition-colors disabled:opacity-40"
              >
                {forceDeleteBusy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
