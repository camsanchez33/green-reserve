'use client';
// PLATFORM ACTIVITY (Cam approved 2026-11-15, "approved, build the platform activity page"; lanes/admin.md and the
// mockup lanes/admin/system-mockup.html). The old System page became a status board BY SERVICE: a summary line, then
// one box per section (the one with a problem first), one line per service. Tapping a service opens its full page with
// "‹ back"; every amber or red row there carries a "How to fix" block — plain numbered steps and the button that does
// it. Every feature of the old page is kept, folded into its service: job runs and Vercel logs (Scheduled jobs), the
// webhook receipt and the owner's platform balance (Stripe), the test error and deep-link hint (Sentry), Cal.com,
// the assistant's switch and spend (Anthropic — never called by its product name), what is deployed (Vercel), backups
// and CI (GitHub), the orphan sweep with clean-up and force delete (Data check), agreement publishing (Agreement
// versions) and the launch wipe. Reads only what /api/admin/system and the owner tools' own routes return; what they
// don't return yet reads "Can't see here". Which service is open is in the URL (?s=…), so Back works.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import { adminFetch, LOGIN_SESSION_ENDED, type AdminFetchFailure } from '@/lib/admin-fetch';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import type { VersionRow } from '@/lib/agreement-publish';
import g from '../admin-glass.module.css';
import s from './system.module.css';
import {
  type St, type Svc, type SystemData, type PlatformStripe, type Orphans, type OrphanSweepItem, type AcknowledgedOrphan,
  type WipePreview, type CronHealth, type Run,
  GROUPS, FILTERS, RANK, CANT, services, localSt, tools, overdue, summary, worst, matches, jobName, cronSt, twilioKeys, agreementSt,
} from './services';
import { InquiryClear } from './InquiryClear';

const ICON = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const SearchIco = () => <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth={1.8} {...ICON}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
const RefreshIco = () => <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth={2} {...ICON}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>;
const Caret = () => <svg width="10" height="10" viewBox="0 0 24 24" strokeWidth={2.5} {...ICON}><path d="m6 9 6 6 6-6" /></svg>;
const ExtIco = () => <svg width="12" height="12" viewBox="0 0 24 24" strokeWidth={2} {...ICON}><path d="M7 17 17 7M8 7h9v9" /></svg>;
const XIco = () => <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth={2} {...ICON}><path d="M18 6 6 18M6 6l12 12" /></svg>;

const DOT: Record<St, string> = { ok: s.dok, warn: s.dwarn, bad: s.dbad, '': '' };
const TONE: Record<St, string> = { ok: s.ok, warn: s.warn, bad: s.bad, '': '' };
const Dot = ({ st }: { st: St }) => <i className={`${s.dot} ${DOT[st]}`} aria-hidden="true" />;
const Mono = ({ children }: { children: ReactNode }) => <span className={s.mono}>{children}</span>;

/** An outside link: underlined text with the arrow (the mockup's "ol"). */
function Ext({ href, children, danger }: { href: string; children: ReactNode; danger?: boolean }) {
  return <a className={`${s.ol} ${danger ? s.danger : ''}`} href={href} target="_blank" rel="noopener noreferrer">{children}<ExtIco /></a>;
}
/** An outside link drawn as a button (inside a "How to fix" block). */
function ExtBtn({ href, children, pri }: { href: string; children: ReactNode; pri?: boolean }) {
  return <a className={`${s.btn} ${pri ? s.pri : ''}`} href={href} target="_blank" rel="noopener noreferrer">{children}<ExtIco /></a>;
}

function Fix({ sev, steps, children, note, err }: { sev: St; steps: ReactNode[]; children?: ReactNode; note?: string; err?: string }) {
  return (
    <div className={`${s.fix} ${sev === 'bad' ? s.fbad : s.fwarn}`}>
      <b>How to fix</b>
      <ol>{steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
      {children && <div className={s.acts}>{children}</div>}
      {note && <p className={s.toast} role="status">{note}</p>}
      {err && <p className={s.err} role="alert">{err}</p>}
    </div>
  );
}

/** One line of a service's page: dot, what it says (and a second line), a right-hand note, and its fix when amber or red. */
function Row({ st, children, right, sub, fix }: { st: St; children: ReactNode; right?: ReactNode; sub?: ReactNode; fix?: ReactNode }) {
  return (
    <>
      <div className={s.kvd}>
        <Dot st={st} />
        <div>{children}{sub && <div className={`${s.sub2} ${st === 'bad' ? s.bad : ''}`}>{sub}</div>}</div>
        <span className={s.pm}>{right}</span>
      </div>
      {fix && (st === 'bad' || st === 'warn') ? fix : null}
    </>
  );
}

type Failure = { msg: string; kind: AdminFetchFailure };
type Sentry = { kind: 'idle' | 'pending' | 'ok' | 'error'; text?: string };
const NO_ORPHANS: Orphans = { checked: false, items: [], acknowledged: [], note: '' };

const WIPE_SUMMARY: [string, string][] = [
  ['Course', 'courses'], ['CourseOperator', 'course logins'], ['GolferAccount', 'golfer accounts'], ['Booking', 'bookings'],
  ['MessageThread', 'conversations'], ['Announcement', 'announcements'],
];

function SystemContent() {
  const params = useSearchParams();
  const router = useRouter();
  const isOwner = useAdminSession().role === 'owner';
  const openId = params.get('s');

  const [data, setData] = useState<SystemData | null>(null);
  const [loadErr, setLoadErr] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(true);
  const [stripe, setStripe] = useState<PlatformStripe | null>(null);
  const [stripeNote, setStripeNote] = useState('');
  const [q, setQ] = useState('');
  const [filt, setFilt] = useState<St | 'all'>('all');
  const [menu, setMenu] = useState(false);
  const fwrap = useRef<HTMLDivElement>(null);
  // Short result lines under a fix block, by action key ("rerun:/api/cron/x", "recheck").
  const [notes, setNotes] = useState<Record<string, { ok?: string; err?: string }>>({});
  const [sentry, setSentry] = useState<Sentry>({ kind: 'idle' });

  // Data check (orphan sweep) — the same calls the old page made.
  const [orphans, setOrphans] = useState<Orphans>(NO_ORPHANS);
  const [orphanChecking, setOrphanChecking] = useState(false);
  const [orphanRunning, setOrphanRunning] = useState(false);
  const [orphanResult, setOrphanResult] = useState<{ text: string; failed: boolean } | null>(null);
  const [forceTarget, setForceTarget] = useState<AcknowledgedOrphan | null>(null);
  const [forceTyped, setForceTyped] = useState('');
  const [forceBusy, setForceBusy] = useState(false);
  const [forceErr, setForceErr] = useState('');

  // Agreement versions (owner with 2FA; the route enforces it).
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [versionsErr, setVersionsErr] = useState('');
  const [pubTarget, setPubTarget] = useState<VersionRow | null>(null);
  const [pubBusy, setPubBusy] = useState(false);
  const [pubErr, setPubErr] = useState('');
  const [pubDone, setPubDone] = useState('');

  // The launch wipe (owner; the route asks for the second step).
  const [wipe, setWipe] = useState<WipePreview | null>(null);
  const [wipeErr, setWipeErr] = useState('');
  const [wiping, setWiping] = useState(false);
  const [wipeTyped, setWipeTyped] = useState('');
  const [wipeReason, setWipeReason] = useState('');
  const [wipeBusy, setWipeBusy] = useState(false);
  const [wipeRunErr, setWipeRunErr] = useState('');
  const [wiped, setWiped] = useState<number | null>(null);

  const loadSystem = useCallback(async (fresh = false) => {
    setLoading(true);
    const res = await adminFetch<SystemData>(`/api/admin/system${fresh ? '?fresh=1' : ''}`, { subject: 'platform activity' });
    if (!res.ok) setLoadErr({ msg: res.message, kind: res.kind });
    else { setData(res.data); setLoadErr(null); }
    setLoading(false);
    return res.ok;
  }, []);
  const loadStripe = useCallback(async () => {
    if (!isOwner) return;
    const res = await adminFetch<PlatformStripe>('/api/admin/platform-stripe?period=30d', { subject: 'the platform Stripe balance' });
    if (res.ok) { setStripe(res.data); setStripeNote(''); } else setStripeNote(res.message);
  }, [isOwner]);
  const loadVersions = useCallback(async () => {
    if (!isOwner) return;
    const res = await adminFetch<{ versions: VersionRow[] }>('/api/admin/agreement-versions', { subject: 'agreement versions' });
    if (!res.ok) { setVersionsErr(res.message); return; }
    setVersionsErr(''); setVersions(res.data.versions);
  }, [isOwner]);
  const loadWipe = useCallback(async () => {
    if (!isOwner) return;
    const res = await adminFetch<WipePreview>('/api/admin/data-reset', { subject: 'the test data counts' });
    if (!res.ok) { setWipeErr(res.message); return; }
    setWipeErr(''); setWipe(res.data);
  }, [isOwner]);

  useEffect(() => { loadSystem(); }, [loadSystem]);
  useEffect(() => { loadStripe(); loadVersions(); loadWipe(); }, [loadStripe, loadVersions, loadWipe]);
  const refreshAll = () => { loadSystem(true); loadStripe(); loadVersions(); loadWipe(); };

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!fwrap.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);

  // ── Data check ── GET always dry-runs; the clean-up and the force delete are explicit owner clicks.
  const checkOrphans = useCallback(async () => {
    setOrphanChecking(true);
    const res = await adminFetch<{ items?: OrphanSweepItem[]; acknowledged?: AcknowledgedOrphan[] }>('/api/admin/orphan-sweep', { subject: 'the orphan sweep' });
    setOrphanChecking(false);
    // A 403 is expected for managers: it is the route's own words, shown quietly.
    setOrphans(res.ok ? { checked: true, items: res.data.items ?? [], acknowledged: res.data.acknowledged ?? [], note: '' }
      : { checked: true, items: [], acknowledged: [], note: res.message });
  }, []);
  async function runOrphanSweep() {
    setOrphanRunning(true); setOrphanResult(null);
    const res = await adminFetch<{ items: OrphanSweepItem[] }>('/api/admin/orphan-sweep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, subject: 'the clean-up', action: 'save' });
    if (!res.ok) { setOrphanRunning(false); setOrphanResult({ text: `Clean-up failed: ${res.message}`, failed: true }); return; }
    const it = res.data.items ?? [];
    setOrphans(o => ({ ...o, items: [] }));
    setOrphanRunning(false);
    setOrphanResult({ text: `Cleaned up ${it.length} item${it.length === 1 ? '' : 's'}: ` + it.map(i => `"${i.name}" ${i.action}`).join('; '), failed: false });
    checkOrphans();
  }
  async function runForceDelete() {
    if (!forceTarget) return;
    setForceBusy(true); setForceErr('');
    const res = await adminFetch<{ deleted: { name: string; bookings: number; paidMemberships: number; staff: number; operatorDeleted: boolean } }>('/api/admin/orphan-sweep', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceDeleteId: forceTarget.id, confirmName: forceTyped }), subject: 'the delete', action: 'save',
    });
    setForceBusy(false);
    if (!res.ok) { setForceErr(res.message); return; }
    const d = res.data.deleted;
    setOrphanResult({ text: `Permanently deleted "${d.name}": ${d.bookings} booking(s), ${d.paidMemberships} paid membership(s), ${d.staff} staff row(s)${d.operatorDeleted ? ', operator login' : ''}.`, failed: false });
    setForceTarget(null); setForceTyped('');
    checkOrphans();
  }

  // ── Agreement versions ──
  async function publish(v: VersionRow) {
    setPubBusy(true); setPubErr(''); setPubDone('');
    const res = await adminFetch<{ reacceptBy: string | null }>('/api/admin/agreement-versions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: v.document, version: v.version }), subject: `${v.title} ${v.version}`, action: 'save',
    });
    setPubBusy(false);
    if (!res.ok) { setPubErr(res.message); return; }
    setPubTarget(null);
    await loadVersions();
    setPubDone(res.data.reacceptBy
      ? `${v.title} ${v.version} is published. Courses on an older version have until ${formatDate(res.data.reacceptBy)} to re-sign; the email goes out with the next hourly run.`
      : `${v.title} ${v.version} is published.`);
  }

  // ── Launch wipe ── The reason goes in the body (the route then doesn't ask); the second step is asked by the layout's dialog.
  async function runWipe() {
    if (!wipe) return;
    setWipeBusy(true); setWipeRunErr('');
    const res = await adminFetch<{ cleared: Record<string, number> }>('/api/admin/data-reset', {
      method: 'POST', body: JSON.stringify({ confirm: wipeTyped, reason: wipeReason.trim() }), action: 'save', subject: 'the wipe',
    });
    setWipeBusy(false);
    if (!res.ok) { setWipeRunErr(res.message); return; }
    setWiped(Object.values(res.data.cleared).reduce((a, b) => a + b, 0));
    setWiping(false); setWipeTyped(''); setWipeReason('');
    loadWipe();
  }

  // ── Fix-path buttons ──
  async function rerun(path: string) {
    const k = `rerun:${path}`;
    setNotes(n => ({ ...n, [k]: { ok: 'Running now. This can take up to 5 minutes; keep this page open.' } }));
    const res = await adminFetch<{ health: CronHealth }>('/api/admin/system/rerun-job', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), subject: `the ${jobName(path)} job`, action: 'save',
    });
    if (!res.ok) { setNotes(n => ({ ...n, [k]: { err: res.message } })); return; }
    setData(d => d && { ...d, crons: d.crons.map(c => c.path === path ? { ...c, health: res.data.health } : c) });
    setNotes(n => ({ ...n, [k]: res.data.health.status === 'ok' ? {} : { err: res.data.health.note || 'It ran but did not finish cleanly — read the function log.' } }));
  }
  async function recheck() {
    setNotes(n => ({ ...n, recheck: { ok: 'Checking production…' } }));
    const ok = await loadSystem(true);
    setNotes(n => ({ ...n, recheck: ok ? {} : { err: 'Couldn’t check just now — try again.' } }));
  }
  async function sendTestError() {
    setSentry({ kind: 'pending' });
    // Raw fetch on purpose: the route's useful answers are a 503 and a 504 ("SENTRY_DSN is missing…", "didn't
    // confirm in 3 seconds"), and adminFetch replaces 5xx words with a generic line. Show the route's own words.
    try {
      const r = await fetch('/api/admin/sentry-test', { method: 'POST' });
      const d = await r.json().catch(() => ({})) as { error?: string };
      setSentry(r.ok ? { kind: 'ok', text: 'Sent — it should appear in Sentry → Issues within a minute as “Test error from Admin → Health”.' }
        : { kind: 'error', text: d.error || `The test didn’t go through (${r.status}) — try again.` });
    } catch {
      setSentry({ kind: 'error', text: 'Network error — the test was not sent. Check your connection and try again.' });
    }
  }

  const svc = useMemo(() => data ? services(data) : [], [data]);
  const own = useMemo(() => tools({ isOwner, orphans, versions, versionsErr, wipe, wipeErr, wiped }), [isOwner, orphans, versions, versionsErr, wipe, wipeErr, wiped]);
  const all = svc.concat(own);
  const open = openId ? all.find(x => x.id === openId) ?? null : null;
  const go = (id: string | null) => router.push(id ? `/admin/system?s=${id}` : '/admin/system');

  // ── Links: project-deep when the deploy knows the Vercel project; the route's own links otherwise ──
  const L = data?.links;
  const vercelSub = (p: string) => L ? (L.vercelIsDeep ? `${L.vercel}${p}` : L.vercel) : '#';
  const links = {
    vercelLogs: vercelSub('/logs'),
    vercelEnv: L?.vercelEnv || vercelSub('/settings/environment-variables'),
    vercelCrons: L?.vercelCrons || vercelSub('/settings/cron-jobs'),
    twilio: L?.twilioConsole || 'https://console.twilio.com',
    resendUsage: 'https://resend.com/settings/usage',
    resend: L?.resendDashboard || 'https://resend.com/domains',
    neon: L?.neonConsole || 'https://console.neon.tech',
    agreementFiles: L ? L.commits.replace(/\/commits\/main$/, '/tree/main/legal') : '#',
  };
  const envSteps = (name: string | string[], where: ReactNode) => [
    where,
    <>Vercel → Settings → Environment Variables → add {([] as string[]).concat(name).map((n, i, a) => <span key={n}>{i > 0 && (i === a.length - 1 ? ' and ' : ', ')}<Mono>{n}</Mono></span>)} for Production, then Save.</>,
    'Vercel → Deployments → Redeploy the latest production deployment.',
    'Come back here and press Re-check. The dot turns green.',
  ];
  const recheckBtn = <button type="button" className={s.btn} onClick={recheck} disabled={!!notes.recheck?.ok}>Re-check</button>;

  // ── Each service's page ──
  function detail(it: Svc): ReactNode {
    if (!data && it.g !== 'owner') return null;
    const d = data!;
    const p = d?.platform;
    switch (it.id) {
      case 'jobs': return (
        <>
          <p className={s.lead}>Each job’s last recorded run. Red means it failed, never finished or is overdue; grey that it hasn’t run yet.</p>
          <div className={s.rows}>{d.crons.map(c => {
            const st = cronSt(c), h = c.health, k = `rerun:${c.path}`, n = notes[k] ?? {};
            // Only jobs that never touch a saved card can be re-run here (admin never charges, Cam 2026-11-12):
            // canRerun false hides the button; undefined means the route doesn't say yet, so the button waits.
            const charges = c.canRerun === false;
            const rerunBtn = charges ? null : c.canRerun
              ? <button type="button" className={`${s.btn} ${s.pri}`} onClick={() => rerun(c.path)} disabled={!!n.ok}>{n.ok ? 'Running…' : 'Re-run job'}</button>
              : <button type="button" className={`${s.btn} ${s.pri}`} disabled title="Re-run isn’t wired in yet — Vercel → Settings → Cron Jobs → Run does the same">Re-run job</button>;
            const rerunStep = charges ? `This job charges or retries saved cards, so it is never run by hand from here. It catches up on its next scheduled run (${c.human}).` : null;
            // The mockup's case: a Resend limit gets its own step and button.
            const resendLimit = /resend/i.test(`${h?.last?.error ?? ''} ${h?.note ?? ''}`);
            const fix = !overdue(c) ? (
              <Fix sev="bad" note={n.ok} err={n.err} steps={[
                <>Open the function log: Vercel → Logs → filter to <Mono>{c.path}</Mono> and read the error{h?.last?.error ? <> ({h.last.error})</> : null}.</>,
                resendLimit ? 'Check the limit: Resend → Usage shows the daily send count. Wait for it to reset at midnight UTC, or upgrade the plan.'
                  : 'Fix what the error names (a missing key, a service limit, a timeout).',
                rerunStep ?? (resendLimit ? 'Press Re-run job once the limit has reset.' : 'Press Re-run job once it is fixed.'),
                'Come back here: the last run should read today with a green dot.',
              ]}>{rerunBtn}<ExtBtn href={links.vercelLogs}>Open Vercel logs</ExtBtn>{resendLimit && <ExtBtn href={links.resendUsage}>Open Resend usage</ExtBtn>}</Fix>
            ) : (
              // Overdue (it ran before, and not since) is red. A job that hasn't run yet is grey and has no block.
              <Fix sev="bad" note={n.ok} err={n.err} steps={[
                <>Check it is still scheduled: Vercel → Settings → Cron Jobs and look for <Mono>{jobName(c.path)}</Mono>.</>,
                'Read the function log for its last run in Vercel → Logs.',
                rerunStep ?? `Press Re-run job, or wait for the next run (${c.human}).`,
                'Come back here: the last run should read today with a green dot.',
              ]}>{rerunBtn}<ExtBtn href={links.vercelCrons}>Open Vercel cron jobs</ExtBtn></Fix>
            );
            return (
              <Row key={c.path} st={st} right={c.human} fix={fix}
                sub={<>{h?.last ? <>Last run {formatDateTime(h.last.startedAt)}{h.last.detail ? ` · ${h.last.detail}` : ''}</> : !h?.note ? 'No run recorded.' : null}
                  {h?.note ? <>{h.last ? <br /> : null}{h.note}</> : null}</>}>
                <code>{jobName(c.path)}</code>
              </Row>
            );
          })}</div>
          <div className={s.acts}><Ext href={links.vercelLogs}>Open Vercel logs</Ext></div>
          {!L!.vercelIsDeep && <Hint />}
        </>
      );
      case 'twilio': {
        const tk = twilioKeys(d);
        const fix = (name: string | string[]) => (
          <Fix sev="warn" note={notes.recheck?.ok} err={notes.recheck?.err}
            steps={envSteps(name, 'Open Twilio Console → Account → API keys & tokens and copy the value.')}>
            <ExtBtn href={links.vercelEnv} pri>Open Vercel env vars</ExtBtn><ExtBtn href={links.twilio}>Open Twilio console</ExtBtn>{recheckBtn}
          </Fix>
        );
        const key = (label: string, set: boolean, name: string) => (
          <Row st={set ? 'ok' : 'warn'} right={set ? 'Key set' : 'Key missing'} fix={fix(name)}
            sub={set ? null : <><Mono>{name}</Mono> is not set in production. No texts are being sent.</>}>{label}</Row>
        );
        return (
          <>
            <p className={s.lead}>Texts go only to golfers who agreed. Without the full set of keys no text is sent; email reminders still go out.</p>
            <div className={s.rows}>
              {tk ? <>{key('Account SID', tk.sid, 'TWILIO_ACCOUNT_SID')}{key('Auth token', tk.token, 'TWILIO_AUTH_TOKEN')}{key('Sending number', tk.from, 'TWILIO_FROM_NUMBER')}</>
                : p.integrations.twilio ? <Row st="ok" right="Keys set">Account SID, auth token and sending number</Row>
                : <Row st="warn" right="Key missing" fix={fix(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'])}
                    sub="At least one of the three is not set in production — this page can’t yet see which. No texts are being sent.">Account SID, auth token and sending number</Row>}
            </div>
            <div className={s.acts}><Ext href={links.twilio}>Open Twilio console</Ext></div>
          </>
        );
      }
      case 'vercel': return (
        <>
          <div className={s.rows}>
            <div className={s.kv}><span className={s.k}>Environment</span><span className={`${s.v} ${p.env === 'production' ? s.ok : s.warn}`}>{p.env}</span><span /></div>
            <div className={s.kv}><span className={s.k}>Service fee</span><span className={s.v}>{formatMoney(p.accessFeeCents / 100)} per player</span><span /></div>
            <div className={s.kv}><span className={s.k}>Deployed</span><span className={s.v}>
              {p.commitSha ? (d.vercel?.commitUrl ? <a className={s.mono} href={d.vercel.commitUrl} target="_blank" rel="noopener noreferrer">{p.commitSha}</a> : <Mono>{p.commitSha}</Mono>) : <span className={s.small}>local build</span>}{p.branch && <>&nbsp; {p.branch}</>}
              {p.commitMessage && <><br /><span className={s.small}>{p.commitMessage}</span></>}
            </span><span /></div>
            {p.publicUrl && <div className={s.kv}><span className={s.k}>Public URL</span><span className={s.v}>{p.publicUrl}</span><span /></div>}
          </div>
          {p.env !== 'production' && (
            <Fix sev="warn" steps={[
              'This is not the production deployment — golfers never see it.',
              'Vercel → Deployments shows which deployment is live on the public URL.',
              'Open this page on the public URL to see production.',
            ]}><ExtBtn href={L!.vercel} pri>Vercel project</ExtBtn></Fix>
          )}
          <div className={s.acts}><Ext href={L!.commits}>Commit history</Ext><Ext href={L!.vercel}>Vercel project</Ext></div>
          {!L!.vercelIsDeep && <Hint />}
        </>
      );
      case 'neon': {
        const n = d.neon, bk = n?.backup ?? null;
        const bkSt: St = !bk ? 'warn' : bk.conclusion === 'success' ? 'ok' : bk.conclusion === 'failure' ? 'bad' : '';
        return (
          <>
            <div className={s.rows}>
              {n ? <>
                <Row st={n.db === 'up' ? 'ok' : 'bad'} right={formatDateTime(n.checkedAt)}
                  fix={<Fix sev="bad" steps={['Open the Neon console and check the project is not suspended or over its limits.', 'Check Vercel → Logs for database errors.', 'Come back here and press Re-check.']}>
                    <ExtBtn href={links.neon} pri>Open Neon console</ExtBtn>{recheckBtn}</Fix>}>
                  {n.db === 'up' ? <>Database up. <Mono>/api/health</Mono> returns {'{"ok":true,"db":"up"}'}</> : 'The database did not answer.'}
                </Row>
                <Row st={bkSt} right={bk ? formatDateTime(bk.at) : ''}
                  sub="Checked on the GitHub backup run."
                  fix={<Fix sev={bkSt === 'bad' ? 'bad' : 'warn'} steps={['Open the backup runs on GitHub and read the last run’s log.', 'Fix what it names (usually an expired database URL in the repository secrets).', 'Run the workflow again from GitHub (Run workflow).', 'Come back here: the last backup should read today.']}>
                    <ExtBtn href={bk?.url || L!.backups} pri>View backup runs</ExtBtn></Fix>}>
                  {!bk ? 'No backup run found' : bk.conclusion === 'success' ? 'Last backup: nightly run finished' : bk.conclusion === 'failure' ? 'Last backup: nightly run failed' : 'Nightly backup running now'}
                </Row>
              </> : <>
                <Row st="" right={CANT}>Database health</Row>
                <Row st="" right={CANT} sub="Checked on the GitHub backup run — follow the link.">Last backup</Row>
              </>}
            </div>
            <div className={s.acts}><Ext href={L!.backups}>View backup runs</Ext><Ext href={links.neon}>Open Neon console</Ext></div>
          </>
        );
      }
      case 'stripe': {
        const st = it.st, wh = d.stripeWebhook;
        return (
          <>
            <div className={s.rows}>
              {!p.integrations.stripe ? (
                <Row st="bad" sub="No payment can be taken while it is missing."
                  fix={<Fix sev="bad" note={notes.recheck?.ok} err={notes.recheck?.err} steps={envSteps('STRIPE_SECRET_KEY', 'Stripe → Developers → API keys and copy the secret key.')}>
                    <ExtBtn href={links.vercelEnv} pri>Open Vercel env vars</ExtBtn>{recheckBtn}</Fix>}>
                  <Mono>STRIPE_SECRET_KEY</Mono> is not set
                </Row>
              ) : null}
              {!p.integrations.stripeWebhook ? (
                <Row st="bad" sub="The webhook cannot be verified, so every event is being rejected."
                  fix={<Fix sev="bad" note={notes.recheck?.ok} err={notes.recheck?.err} steps={envSteps('STRIPE_WEBHOOK_SECRET', 'Open Stripe webhooks, open the GreenReserve endpoint and reveal its signing secret.')}>
                    <ExtBtn href={links.vercelEnv} pri>Open Vercel env vars</ExtBtn><ExtBtn href={L!.stripeWebhooks}>Open Stripe webhooks</ExtBtn>{recheckBtn}</Fix>}>
                  <Mono>STRIPE_WEBHOOK_SECRET</Mono> is not set
                </Row>
              ) : wh ? (
                <Row st={wh.outcome === 'error' ? 'bad' : 'ok'} sub={wh.outcome === 'error' ? <>The handler failed on it: {wh.error}</> : null}
                  fix={<Fix sev="bad" steps={['Read the error above, and the function log in Vercel for the same time.', 'Fix what it names.', 'Open Stripe webhooks, find the failed event and press Resend.', 'Come back here: the last event should read with a green dot.']}>
                    <ExtBtn href={L!.stripeWebhooks} pri>Open Stripe webhooks</ExtBtn><ExtBtn href={links.vercelLogs}>Open Vercel logs</ExtBtn></Fix>}>
                  Last webhook event received {formatDateTime(wh.at)}: <Mono>{wh.detail}</Mono>
                </Row>
              ) : (
                <Row st="">No event received since receipts started being logged{d.lastStripeTouch ? <> (most recent Stripe-linked course update: {d.lastStripeTouch.courseName}, {formatDateTime(d.lastStripeTouch.updatedAt)})</> : null}. Stripe only sends events when something happens on a connected account.</Row>
              )}
              {isOwner && (
                <div className={s.kv}><span className={s.k}>Platform Stripe balance</span>
                  <span className={s.v}>{stripe
                    ? <>Available {formatMoney(stripe.balance.available)} &nbsp;·&nbsp; Pending {formatMoney(stripe.balance.pending)} &nbsp;·&nbsp; Next payout {stripe.nextPayout ? `${formatMoney(stripe.nextPayout.amount)} · ${stripe.nextPayout.arrivalDate}` : 'none scheduled'}</>
                    : stripeNote ? <span className={s.warn}>{stripeNote}</span> : 'Loading…'}</span>
                  <span className={s.r}>Owner</span></div>
              )}
            </div>
            <div className={s.acts}><Ext href={L!.stripeWebhooks}>Open Stripe webhooks</Ext></div>
          </>
        );
      }
      case 'resend': {
        const rs = d.resend;
        return (
          <>
            <p className={s.lead}>All email goes through one sender. Course and golfer addresses come from the contact list in the code.</p>
            <div className={s.rows}>
              <Row st={p.integrations.resend ? 'ok' : 'bad'} right={p.integrations.resend ? 'Key set' : 'Key missing'}
                sub={p.integrations.resend ? null : 'No email is being sent: confirmations, reminders and sign-in codes all stop.'}
                fix={<Fix sev="bad" note={notes.recheck?.ok} err={notes.recheck?.err} steps={envSteps('RESEND_API_KEY', 'Resend → API Keys → create a key with sending access and copy it.')}>
                  <ExtBtn href={links.vercelEnv} pri>Open Vercel env vars</ExtBtn><ExtBtn href={links.resend}>Open Resend dashboard</ExtBtn>{recheckBtn}</Fix>}>
                API key {p.integrations.resend ? 'set' : 'missing'}
              </Row>
              {rs && rs.domainVerified !== null
                ? <Row st={rs.domainVerified ? 'ok' : 'warn'} right={rs.domainVerified ? 'Verified' : 'Not verified'}
                    fix={<Fix sev="warn" note={notes.recheck?.ok} err={notes.recheck?.err} steps={['Resend → Domains → open the sending domain and copy the DNS records it lists.', 'Add them at the domain’s DNS provider.', 'Press Verify in Resend, then Re-check here.']}>
                      <ExtBtn href={links.resend} pri>Open Resend dashboard</ExtBtn>{recheckBtn}</Fix>}>
                    Sending domain {rs.domainVerified ? 'verified' : 'not verified'}</Row>
                : <Row st="" right={CANT}>Sending domain</Row>}
            </div>
            <div className={s.acts}><Ext href={links.resend}>Open Resend dashboard</Ext></div>
          </>
        );
      }
      case 'sentry': return (
        <>
          <div className={s.rows}>
            <Row st={p.integrations.sentry ? '' : 'warn'}
              fix={<Fix sev="warn" note={notes.recheck?.ok} err={notes.recheck?.err} steps={envSteps('SENTRY_DSN', 'Sentry → Settings → Projects → the GreenReserve project → Client Keys and copy the DSN.')}>
                <ExtBtn href={links.vercelEnv} pri>Open Vercel env vars</ExtBtn><ExtBtn href={L!.sentry}>Open Sentry</ExtBtn>{recheckBtn}</Fix>}>
              {p.integrations.sentry ? 'Error tracking is wired in (client + server) — check Sentry for recent issues.' : 'No Sentry DSN in this environment — errors here are not being reported.'}
            </Row>
          </div>
          <div><Ext href={L!.sentry}>Open Sentry issues</Ext></div>
          {!L!.sentryIsDeep && <p className={s.hint}>Set <Mono>SENTRY_ORG</Mono> (and <Mono>SENTRY_PROJECT</Mono>) to deep-link.</p>}
          <div className={s.acts}><button type="button" className={s.btn} onClick={sendTestError} disabled={sentry.kind === 'pending'}>{sentry.kind === 'pending' ? 'Sending…' : 'Send a test error'}</button></div>
          {sentry.kind === 'ok' && <p className={s.toast} role="status">{sentry.text}</p>}
          {sentry.kind === 'error' && <p className={s.err} role="alert">{sentry.text}</p>}
        </>
      );
      case 'calcom': {
        const c = d.calcom;
        if (!c) return <div className={s.rows}><Row st="" right={CANT}>Call booking setup</Row></div>;
        return (
          <div className={s.rows}>
            {c.state === 'on' ? <>
              <Row st="ok">On. Courses book from <a className={s.mono} href={c.url} target="_blank" rel="noopener noreferrer">{c.url}</a>; your hours and busy times come from Cal.com and the Outlook calendar connected to it.</Row>
              <Row st={c.webhookSecretSet ? 'ok' : 'bad'}
                fix={<Fix sev="bad" note={notes.recheck?.ok} err={notes.recheck?.err} steps={envSteps('CALCOM_WEBHOOK_SECRET', 'Cal.com → Settings → Developer → Webhooks → the GreenReserve webhook and copy its secret.')}>
                  <ExtBtn href={links.vercelEnv} pri>Open Vercel env vars</ExtBtn>{recheckBtn}</Fix>}>
                {c.webhookSecretSet
                  ? <>Webhook secret set. Bookings reach GreenReserve at <Mono>/api/calcom/webhook</Mono> — use Cal.com’s “Ping test” to confirm.</>
                  : <><Mono>CALCOM_WEBHOOK_SECRET</Mono> is not set — courses can book, but the bookings will not show up here.</>}
              </Row>
            </> : c.state === 'invalid' ? (
              <Row st="bad" sub={<>{c.reason}. The site sees: <Mono>{c.raw}</Mono></>}
                fix={<Fix sev="bad" note={notes.recheck?.ok} err={notes.recheck?.err} steps={envSteps('CALCOM_BOOKING_URL', 'Copy the event link from Cal.com. It should look like https://cal.com/yourname/your-event.')}>
                  <ExtBtn href={links.vercelEnv} pri>Open Vercel env vars</ExtBtn>{recheckBtn}</Fix>}>
                <Mono>CALCOM_BOOKING_URL</Mono> is set but cannot be used
              </Row>
            ) : (
              <Row st="warn" sub="The booking page asks courses to reply with times instead."
                fix={<Fix sev="warn" note={notes.recheck?.ok} err={notes.recheck?.err} steps={envSteps('CALCOM_BOOKING_URL', 'Copy the event link from Cal.com. It should look like https://cal.com/yourname/your-event.')}>
                  <ExtBtn href={links.vercelEnv} pri>Open Vercel env vars</ExtBtn>{recheckBtn}</Fix>}>
                Off — <Mono>CALCOM_BOOKING_URL</Mono> is not set in this deployment
              </Row>
            )}
          </div>
        );
      }
      case 'anthropic': {
        const b = d.birdie;
        if (!b) return <div className={s.rows}><Row st="" right={CANT}>The course assistant</Row></div>;
        const capped = b.todayReplies >= b.dailyCap;
        return (
          <div className={s.rows}>
            <Row st={b.enabled ? 'ok' : ''} right={b.model}>
              {b.enabled ? 'On for operators — the Ask launcher in the dashboard’s bottom corner.'
                : !b.keySet ? <>Off — <Mono>ANTHROPIC_API_KEY</Mono> is not set in Vercel (PASSWORD_CHECKLIST Phase 7c).</>
                : !b.flag ? <>Off — the key is set; flip <Mono>BIRDIE_ENABLED=true</Mono> in Vercel to switch it on.</> : 'Off.'}
            </Row>
            <Row st={capped ? 'warn' : ''}
              fix={<Fix sev="warn" steps={['Nothing is broken: the platform-wide daily cap is reached, so the assistant stops replying until the count resets tomorrow.', 'Today’s replies are in the Vercel logs, without the messages.', 'If the cap is too low, ask Build to raise it.']}>
                <ExtBtn href={links.vercelLogs} pri>Open Vercel logs</ExtBtn></Fix>}>
              {b.todayReplies.toLocaleString()} of {b.dailyCap.toLocaleString()} replies today (the platform-wide daily cap; 20 per course per hour on top). Replies are logged as <Mono>assistant.reply</Mono>.
            </Row>
          </div>
        );
      }
      case 'blob': {
        const env = (name: string) => <Fix sev={name.includes('PRIVATE') ? 'bad' : 'warn'} note={notes.recheck?.ok} err={notes.recheck?.err}
          steps={envSteps(name, 'Vercel → Storage → the Blob store → copy its read-write token.')}><ExtBtn href={links.vercelEnv} pri>Open Vercel env vars</ExtBtn>{recheckBtn}</Fix>;
        return (
          <>
            <p className={s.lead}>Public files (logos, photos) and the private store that holds signed contracts.</p>
            <div className={s.rows}>
              <Row st={p.integrations.blob ? 'ok' : 'warn'} right={p.integrations.blob ? 'Key set' : 'Key missing'} fix={env('BLOB_READ_WRITE_TOKEN')}
                sub={p.integrations.blob ? null : 'Logo and photo uploads fail.'}>Public blob store</Row>
              <Row st={p.integrations.privateBlob ? 'ok' : 'bad'} right={p.integrations.privateBlob ? 'Key set' : 'Key missing'} fix={env('BLOB_PRIVATE_READ_WRITE_TOKEN')}
                sub={p.integrations.privateBlob ? null : 'Signed contracts cannot be stored.'}>Private store (contracts)</Row>
            </div>
          </>
        );
      }
      case 'github': {
        const gh = d.github?.readable ? d.github : null;
        const run = (label: string, r: Run | null, href: string, sev: St) => {
          if (!r) return <Row st="" right={CANT}>{label}</Row>;
          const st: St = r.conclusion === 'success' ? 'ok' : r.conclusion === 'failure' ? sev : '';
          return (
            <Row st={st} right={formatDateTime(r.at)}
              fix={<Fix sev={sev} steps={['Open the run on GitHub and read the failed step.', 'Fix what it names, then press Re-run jobs on GitHub.', 'Come back here: the run should read with a green dot.']}><ExtBtn href={r.url || href} pri>Open the run</ExtBtn></Fix>}>
              {label} {r.conclusion === 'success' ? 'passed' : r.conclusion === 'failure' ? 'failed' : 'running now'}</Row>
          );
        };
        return (
          <>
            <div className={s.rows}>
              {gh ? <>{run('Last nightly backup run', gh.backup, L!.backups, 'bad')}{run(gh.ci ? `Last CI run (${gh.ci.name} on ${gh.ci.branch})` : 'Last CI run', gh.ci, L!.ci, 'warn')}</>
                : <Row st="">Not tracked in the app — check the nightly backup run and the latest test run on GitHub.</Row>}
            </div>
            <div className={s.acts}><Ext href={L!.backups}>View backup runs</Ext><Ext href={L!.ci}>View CI runs</Ext></div>
          </>
        );
      }
      case 'data': {
        const o = orphans, n = o.items.length;
        return (
          <>
            <p className={s.lead}>Every course should trace back to the inquiry it came from, and every accepted inquiry to a course. This finds the ones that do not — read-only until you act.</p>
            <div className={s.acts}><button type="button" className={s.btn} onClick={checkOrphans} disabled={orphanChecking}>
              {orphanChecking ? 'Checking…' : o.checked && !n && !o.note ? 'Checked — clean' : 'Run data check'}</button></div>
            {!o.checked && <p className={s.clr}>Not run yet this visit.</p>}
            {o.note && <p className={s.clr}>{o.note}</p>}
            {o.checked && !o.note && !n && !o.acknowledged.length && <div className={s.rows}><Row st="ok">No orphaned records</Row></div>}
            {n > 0 && <div className={s.rows}><Row st="warn"
              sub={o.items.map((i, k) => <span key={i.kind + i.id}>{k > 0 && <br />}<b>{i.name}</b> — {i.reason} (will be {i.action.replace('would_', '')})</span>)}
              fix={<Fix sev="warn" steps={[`Read the record${n > 1 ? 's' : ''} below and what will happen to ${n > 1 ? 'each' : 'it'}.`, 'Press Clean up now. Archived records are hidden from the site, not deleted.', 'An archived record you are sure about can be removed for good from the acknowledged list that appears afterwards.']}>
                <button type="button" className={`${s.btn} ${s.pri}`} onClick={runOrphanSweep} disabled={orphanRunning}>{orphanRunning ? 'Cleaning up…' : 'Clean up now'}</button></Fix>}>
              {n} orphaned record{n > 1 ? 's' : ''} — no linked inquiry, or an inquiry pointing at a deleted course.
            </Row></div>}
            {orphanResult && (
              <div className={`${s.outc} ${orphanResult.failed ? s.obad : ''}`} role="status"><span>{orphanResult.text}</span>
                <button type="button" className={s.wb} aria-label="Dismiss" onClick={() => setOrphanResult(null)}><XIco /></button></div>
            )}
            {o.acknowledged.length > 0 && (
              <div className={s.box}>
                <div className={s.boxh}>{o.acknowledged.length} acknowledged orphan{o.acknowledged.length > 1 ? 's' : ''} — archived, flagged, no linked inquiry</div>
                {o.acknowledged.map(a => (
                  <div key={a.id} className={s.crow}>
                    <span>{a.name} <span className={s.small}>— archived {formatDate(a.archivedAt)}</span></span>
                    <button type="button" className={`${s.ol} ${s.danger}`} onClick={() => { setForceTarget(a); setForceTyped(''); setForceErr(''); }}>Force delete permanently</button>
                  </div>
                ))}
              </div>
            )}
          </>
        );
      }
      case 'agree': return (
        <>
          <p className={s.lead}>Each version of the agreements courses sign. A new version is signed by new courses as soon as it deploys; publishing it starts the re-sign window for courses already on an older one.</p>
          {pubDone && <p className={s.toast} role="status">{pubDone}</p>}
          {versionsErr && <p className={s.err} role="alert">{versionsErr} <button type="button" className={s.ol} onClick={loadVersions}>Try again</button></p>}
          {!versions && !versionsErr && <p className={s.clr}>Loading…</p>}
          {versions && <div className={s.rows}>{versions.map(v => {
            const st = agreementSt(v);
            const fix = v.published ? (
              <Fix sev="bad" steps={['Do not edit the published file: its hash is the signature record.', 'Add a new version under the legal folder and publish that one instead.']}>
                <ExtBtn href={links.agreementFiles} pri>Open agreement files</ExtBtn></Fix>
            ) : v.blocked ? (
              <Fix sev="warn" steps={[<>It can’t be published yet: {v.blocked}</>, 'Fix that in the version’s file under the legal folder (a new version, never an edit to a published one).', 'Come back here once it has deployed; the Publish button appears.']}>
                <ExtBtn href={links.agreementFiles}>Open agreement files</ExtBtn></Fix>
            ) : (
              <Fix sev="warn" steps={[`Read what changed: ${v.changeSummary || 'see the version notes'}`,
                v.counselReviewed ? `Confirm counsel has reviewed it (done ${v.counselReviewed}).` : v.counselWaived ? `Counsel review waived: ${v.counselWaived}.` : 'Confirm counsel has reviewed it.',
                `Press Publish ${v.version} and confirm.${v.reacceptRequired ? ' Courses on an older version get an email with the next hourly run and 30 days to re-sign.' : ''}`]}>
                <button type="button" className={`${s.btn} ${s.pri}`} onClick={() => { setPubErr(''); setPubDone(''); setPubTarget(v); }}>Publish {v.version}</button></Fix>
            );
            return (
              <Row key={v.document + v.version} st={st} fix={fix}
                sub={<>
                  {v.published ? (v.published.hashMatches ? `Published ${formatDate(v.published.effectiveAt)}` : 'The file changed after it was published. Versions cannot be edited — add a new version instead.') : v.blocked ? 'Cannot be published yet' : 'Not published'}
                  {v.published?.reacceptBy && <><br />Courses re-sign by {formatDate(v.published.reacceptBy)}. {v.published.noticeSentAt ? `Email sent ${formatDateTime(v.published.noticeSentAt)}.` : 'Email goes out with the next hourly run.'}</>}
                  {v.reacceptRequired && !v.published && <><br />Publishing asks every course on an older version to re-sign within 30 days.</>}
                  {v.reacceptRequired && (v.counselReviewed ? <><br />Reviewed by counsel {v.counselReviewed}.</> : v.counselWaived ? <><br />Counsel review waived: {v.counselWaived}</> : null)}
                  {!v.published && v.blocked && <><br /><span className={s.bad}>{v.blocked}</span></>}
                </>}>
                <b>{v.title} {v.version}</b>{v.current && <span className={s.small}> · current</span>}
              </Row>
            );
          })}</div>}
        </>
      );
      case 'wipe': {
        const w = wipe;
        if (wipeErr) return <p className={s.err} role="alert">{wipeErr} <button type="button" className={s.ol} onClick={loadWipe}>Try again</button></p>;
        if (!w) return <p className={s.clr}>Counting test data…</p>;
        // Inquiries made before Nov 23 are test data: the wipe deletes them too (lib/data-reset OUTREACH_START).
        const total = Object.values(w.wiped).reduce((a, n) => a + n, 0) + (w.testInquiries ?? 0);
        const closes = new Date(w.closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
        return (
          <>
            <p className={s.lead}>Every course, golfer, booking, conversation and announcement on the site is test data until launch. This clears all of it in one go, so the site starts clean. Kept: admin logins, goals, expenses, company documents, agreement versions, the audit record and outreach from Nov 23. Stripe is not touched — refund any test charge there. Available until {closes}, then it switches off for good.</p>
            {wiped !== null && <p className={s.toast} role="status">Cleared {wiped.toLocaleString()} records.</p>}
            <div>
              {WIPE_SUMMARY.map(([t, label]) => <div key={t} className={s.cnt}><span>{label}</span><b>{(w.wiped[t] ?? 0).toLocaleString()}</b></div>)}
              <div className={s.cnt}><span>inquiries before Nov 23</span><b>{(w.testInquiries ?? 0).toLocaleString()}</b></div>
              <div className={s.cnt}><span>every record it clears, all tables</span><b>{total.toLocaleString()}</b></div>
            </div>
            {!w.open ? <p className={s.clr}>Closed — real courses are on the site. Reset a single test course from its page instead.</p>
              : !wiping ? <div className={s.acts}><button type="button" className={`${s.btn} ${s.dng}`} onClick={() => { setWiping(true); setWipeRunErr(''); }} disabled={total === 0}>Clear all test data…</button></div>
              : (
                <div className={`${s.box} ${s.bbad}`}>
                  <p className={`${s.clr} ${s.ink}`}>This deletes {total.toLocaleString()} records and cannot be undone from here (only a database restore brings them back). Type <b>{w.confirmWords}</b> to confirm.</p>
                  <input className={s.fld} value={wipeTyped} onChange={e => setWipeTyped(e.target.value)} aria-label="Confirmation words" autoComplete="off" />
                  <label className={s.lab}>Reason (kept in the audit record)<input className={s.fld} value={wipeReason} onChange={e => setWipeReason(e.target.value)} autoComplete="off" /></label>
                  {wipeRunErr && <p className={s.err} role="alert">{wipeRunErr}</p>}
                  <div className={s.acts}>
                    <button type="button" className={`${s.btn} ${s.dng} ${s.solid}`} onClick={runWipe} disabled={wipeBusy || wipeTyped !== w.confirmWords || wipeReason.trim().length < 4}>{wipeBusy ? 'Clearing…' : 'Clear all test data'}</button>
                    <button type="button" className={s.btn} onClick={() => { setWiping(false); setWipeTyped(''); setWipeReason(''); setWipeRunErr(''); }} disabled={wipeBusy}>Cancel</button>
                  </div>
                </div>
              )}
            {w.open && <InquiryClear onCleared={loadWipe} />}
          </>
        );
      }
    }
    return null;
  }

  // ── The board ──
  const sm = summary(svc);
  const svcShown = worst(svc).filter(x => matches(x, filt, q));
  const ownShown = worst(own).filter(x => matches(x, filt, q));
  const worstOf = (xs: Svc[]) => xs.reduce((m, x) => Math.min(m, RANK[x.st]), 9);
  const groups = GROUPS.map(([k, label]) => ({ k, label, items: svcShown.filter(x => x.g === k) }))
    .filter(x => x.items.length).sort((a, b) => worstOf(a.items) - worstOf(b.items));
  const count = (f: St | 'all') => all.filter(x => f === 'all' || x.st === f).length;
  const fLabel = FILTERS.find(f => f[0] === filt)?.[1];
  const line = (x: Svc) => (
    <button key={x.id} type="button" className={s.sr} onClick={() => go(x.id)}>
      <Dot st={x.st} /><b>{x.t}</b><span className={s.dsc}>{x.does}</span><span className={`${s.stt} ${TONE[x.st]}`}>{x.state}</span>
    </button>
  );

  let body: ReactNode;
  if (open && (data || open.g === 'owner')) {
    body = (
      <section className={`${g.glass} ${s.card} ${s.det}`} aria-label={open.t}>
        <button type="button" className={s.back} onClick={() => go(null)}>‹ back</button>
        <h2>{open.t}</h2>
        <div className={s.dst}><Dot st={open.st} /><span className={`${s.stt} ${TONE[open.st]}`}>{open.state}</span><span className={s.dsc}>{open.does}</span></div>
        {data && (open.st === 'bad' || open.st === 'warn') && (() => { const l = localSt(data, open.id); return l !== null && l !== open.st; })() && (
          <Fix sev={open.st} note={notes.recheck?.ok} err={notes.recheck?.err} steps={[
            `The server’s check says: ${open.state}.`,
            'The lines below are this page’s own reads and may not show it yet. Open the service itself to see the detail.',
            'Fix what it names, then come back and press Re-check.',
          ]}>{recheckBtn}</Fix>
        )}
        {detail(open)}
      </section>
    );
  } else {
    body = (
      <section className={`${g.glass} ${s.card}`} aria-label="Platform activity">
        <div className={s.bar}>
          <label className={s.search}><SearchIco /><input value={q} onChange={e => setQ(e.target.value)} aria-label="Search platform activity" /></label>
          <div className={s.fwrap} ref={fwrap}>
            <button type="button" className={`${s.fbtn} ${g.glass}`} aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
              Filter{filt !== 'all' ? `: ${fLabel}` : ''}<Caret />
            </button>
            {menu && (
              <div className={s.fmenu}>
                {FILTERS.map(([k, label]) => (
                  <button key={label} type="button" aria-pressed={filt === k} onClick={() => { setFilt(k); setMenu(false); }}>{label}<b>{count(k)}</b></button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className={s.wb} aria-label="Refresh" title="Refresh" onClick={refreshAll} disabled={loading}><RefreshIco /></button>
        </div>
        {loadErr && (
          <p className={s.empty} role="alert"><span className={s.bad}>{loadErr.msg}</span>{' '}
            {loadErr.kind === 'unauthorized' ? <a className={s.ol} href={LOGIN_SESSION_ENDED}>Sign in</a>
              : loadErr.kind !== 'forbidden' && <button type="button" className={s.ol} onClick={() => loadSystem()}>Try again</button>}</p>
        )}
        {!data && !loadErr && <p className={s.empty}>Loading…</p>}
        {data && <div className={s.sumline}><Dot st={sm.st} /><b>{sm.text}</b></div>}
        {data && !groups.length && !ownShown.length && <p className={s.empty}>Nothing matches</p>}
        {groups.map(x => <div key={x.k} className={s.sgrp}><h3 className={s.sgh}>{x.label}</h3>{x.items.map(line)}</div>)}
        {(data || loadErr) && ownShown.length > 0 && <div className={s.sgrp}><h3 className={s.sgh}>Owner tools</h3>{ownShown.map(line)}</div>}
      </section>
    );
  }

  return (
    <>
      <AdminSidebar active="system" />
      <main className={g.main}>
        <div className={g.head}><h1>Platform activity</h1></div>
        {body}
      </main>

      {forceTarget && (
        <div className={s.ov} onMouseDown={e => { if (e.target === e.currentTarget && !forceBusy) setForceTarget(null); }}>
          <Dialog labelledBy="fd-h" onClose={() => setForceTarget(null)} busy={forceBusy}>
            <h3 id="fd-h">Delete “{forceTarget.name}” permanently?</h3>
            <p>This hard-deletes the course and everything attached to it — bookings, paid memberships, staff rows and the operator login. It cannot be undone.</p>
            {forceErr && <p className={s.err} role="alert">{forceErr}</p>}
            <label className={s.lab}>Type “{forceTarget.name}” to confirm<input className={s.fld} value={forceTyped} onChange={e => setForceTyped(e.target.value)} autoComplete="off" autoFocus /></label>
            <div className={s.acts}>
              <button type="button" className={s.btn} onClick={() => setForceTarget(null)} disabled={forceBusy}>Cancel</button>
              <button type="button" className={`${s.btn} ${s.dng} ${s.solid}`} onClick={runForceDelete}
                disabled={forceBusy || forceTyped.trim().toLowerCase() !== forceTarget.name.trim().toLowerCase()}>{forceBusy ? 'Deleting…' : 'Delete permanently'}</button>
            </div>
          </Dialog>
        </div>
      )}

      {pubTarget && (
        <div className={s.ov} onMouseDown={e => { if (e.target === e.currentTarget && !pubBusy) setPubTarget(null); }}>
          <Dialog labelledBy="pub-h" onClose={() => setPubTarget(null)} busy={pubBusy}>
            <h3 id="pub-h">Publish {pubTarget.title} {pubTarget.version}?</h3>
            {pubTarget.reacceptRequired ? <>
              <p>Every live course still on an older version gets an email with the next hourly run and has 30 days to re-sign.</p>
              <p>After the 30 days, a course that has not re-signed cannot change its course settings until it signs. Its tee sheet, check-ins and bookings keep working, and golfers can still book the whole time.</p>
              {pubTarget.changeSummary && <p>What changed: {pubTarget.changeSummary}</p>}
              {!pubTarget.counselReviewed && pubTarget.counselWaived && <p>Counsel review waived: {pubTarget.counselWaived}</p>}
              <p className={s.strong}><b>This cannot be undone.</b></p>
            </> : <p>This records the version as published. No emails are sent and no one is asked to re-sign.</p>}
            {pubErr && <p className={s.err} role="alert">{pubErr}</p>}
            <div className={s.acts}>
              <button type="button" className={s.btn} onClick={() => setPubTarget(null)} disabled={pubBusy}>Cancel</button>
              <button type="button" className={`${s.btn} ${s.pri}`} onClick={() => publish(pubTarget)} disabled={pubBusy}>{pubBusy ? 'Publishing…' : `Publish ${pubTarget.version}`}</button>
            </div>
          </Dialog>
        </div>
      )}
    </>
  );
}

/** The page's two confirm dialogs (drawn in the mockup): Escape closes unless it is working, Tab stays inside, and focus
 *  goes back where it was. While a request waits (busy) Escape does nothing, so the layout's "Confirm it's you" box,
 *  which opens on top, keeps its own Escape. */
function Dialog({ labelledBy, onClose, busy, children }: { labelledBy: string; onClose: () => void; busy: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>('input, button:not(:disabled)') ?? el).focus();
    return () => { back?.focus?.(); };
  }, []);
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); if (!busy) onClose(); return; }
    if (e.key !== 'Tab' || !ref.current) return;
    const f = Array.from(ref.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), textarea, select, [tabindex]:not([tabindex="-1"])'));
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  return <div ref={ref} className={s.modal} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} onKeyDown={onKeyDown}>{children}</div>;
}

function Hint() {
  return <p className={s.hint}>Set <Mono>ADMIN_VERCEL_PROJECT_URL</Mono> in Vercel env to make the Vercel links land on this project — Vercel does not expose the team slug to the app.</p>;
}

export default function AdminSystemPage() {
  return <Suspense fallback={null}><SystemContent /></Suspense>;
}
