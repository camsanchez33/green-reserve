// Platform activity (Cam 2026-11-15, lanes/admin.md): what /admin/system needs
// beyond what the System route already returned — Neon (up + last backup),
// GitHub (the backup and test runs), Resend (key + sending domain), Twilio (each
// key), Vercel (the commit that is live) — and ONE rule for each service's dot,
// so the board never re-derives it in the page.
//
// Secrets are never returned: only whether each is set. The two outside reads
// (GitHub, Resend) are cached for five minutes per server instance and time out
// after four seconds; `fresh` (the board's Re-check) skips the cache. A read that
// fails is `null` — "can't see here" — never a guess.
import { prisma } from './prisma';
import { NOREPLY_EMAIL } from './contact';

const TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 4_000;
/** A nightly backup older than this is late. */
const BACKUP_LATE_MS = 30 * 3_600_000;

/**
 * Jobs that charge saved cards or retry charges (hold and no-show charges, membership
 * renewals and statements). They run only on their schedule: the admin never charges
 * or retries a golfer's payment (Cam 2026-11-12), so "Re-run job" is not offered for
 * them — a failed run catches up on its next scheduled run. scripts/admin-never-charges-test.ts
 * pins that the re-run route cannot reach them.
 */
export const CHARGING_JOBS = new Set(['hourly', 'cancellation-cutoff', 'send-reminders']);
/** The only jobs "Re-run job" runs (an allowlist: a new cron is not re-runnable until it is added here and in the route). */
export const RERUN_JOBS = new Set(['generate-tee-times', 'chase-onboarding', 'monthly-review']);
export const canRerun = (job: string) => RERUN_JOBS.has(job) && !CHARGING_JOBS.has(job);

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, fresh: boolean, read: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await read();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export type Run = { at: string; conclusion: 'success' | 'failure' | 'running'; url: string };
export type CiRun = Run & { branch: string; name: string };
export type GithubStatus = { readable: boolean; backup: Run | null; ci: CiRun | null };
export type NeonStatus = { db: 'up' | 'down'; checkedAt: string; backup: Run | null };
export type ResendStatus = { keySet: boolean; domain: string; domainVerified: boolean | null };
export type TwilioStatus = { accountSidSet: boolean; authTokenSet: boolean; fromNumberSet: boolean };

type GhRun = { status?: string; conclusion?: string | null; html_url?: string; created_at?: string; run_started_at?: string; head_branch?: string; name?: string };

/** Pure: a GitHub workflow run as the board reads it. */
export function runOf(r: GhRun | undefined): CiRun | null {
  if (!r || !r.html_url) return null;
  const conclusion: Run['conclusion'] = r.status !== 'completed' ? 'running' : r.conclusion === 'success' ? 'success' : 'failure';
  return { at: r.run_started_at || r.created_at || '', conclusion, url: r.html_url, branch: r.head_branch || '', name: r.name || '' };
}

export function repoOf(env: NodeJS.ProcessEnv = process.env) {
  const owner = env.VERCEL_GIT_REPO_OWNER || 'camsanchez33';
  const slug = env.VERCEL_GIT_REPO_SLUG || 'green-reserve';
  return { owner, slug, url: `https://github.com/${owner}/${slug}` };
}

async function latestRun(workflow: string, branch: string | null): Promise<CiRun | null | 'unreadable'> {
  const { owner, slug } = repoOf();
  const q = new URLSearchParams({ per_page: '1' });
  if (branch) q.set('branch', branch);
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'greenreserve-admin' };
  // Optional read-only token (Actions: read). Without one a private repo answers 404 → "can't see here".
  if (process.env.GITHUB_STATUS_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_STATUS_TOKEN}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${slug}/actions/workflows/${workflow}/runs?${q}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    if (!res.ok) return 'unreadable';
    const body = await res.json() as { workflow_runs?: GhRun[] };
    return runOf(body.workflow_runs?.[0]);
  } catch (err) {
    console.error(JSON.stringify({ ev: 'platform_status.github_read_failed', workflow, error: err instanceof Error ? err.message : String(err) }));
    return 'unreadable';
  }
}

/** The nightly backup run and the latest test run on main. */
export function githubStatus(fresh = false): Promise<GithubStatus> {
  return cached('github', fresh, async () => {
    const [backup, ci] = await Promise.all([latestRun('db-backup.yml', null), latestRun('tests.yml', 'main')]);
    const readable = backup !== 'unreadable' || ci !== 'unreadable';
    const strip = (r: CiRun | null | 'unreadable'): CiRun | null => (r === 'unreadable' ? null : r);
    const b = strip(backup);
    return { readable, backup: b ? { at: b.at, conclusion: b.conclusion, url: b.url } : null, ci: strip(ci) };
  });
}

/** The database answers, and the last backup (read from the GitHub run). */
export async function neonStatus(github: GithubStatus): Promise<NeonStatus> {
  let db: NeonStatus['db'] = 'up';
  try { await prisma.$queryRaw`SELECT 1`; } catch { db = 'down'; }
  return { db, checkedAt: new Date().toISOString(), backup: github.backup };
}

/** The domain every email is sent from. */
export const SENDING_DOMAIN = NOREPLY_EMAIL.split('@')[1];

/**
 * Whether Resend has the sending domain verified. Reads Resend's domain list with
 * the same key (a read, never a send — sending stays in lib/email.ts). A
 * sending-only key can't list domains: then it's null, "can't see here".
 */
export function resendStatus(fresh = false): Promise<ResendStatus> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return Promise.resolve({ keySet: false, domain: SENDING_DOMAIN, domainVerified: null });
  return cached('resend', fresh, async () => {
    let verified: boolean | null = null;
    try {
      const res = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
      if (res.ok) {
        const body = await res.json() as { data?: { name?: string; status?: string }[] };
        const d = body.data?.find(x => x.name === SENDING_DOMAIN);
        verified = d ? d.status === 'verified' : false;
      }
    } catch (err) {
      console.error(JSON.stringify({ ev: 'platform_status.resend_read_failed', error: err instanceof Error ? err.message : String(err) }));
    }
    return { keySet: true, domain: SENDING_DOMAIN, domainVerified: verified };
  });
}

export function twilioStatus(env: NodeJS.ProcessEnv = process.env): TwilioStatus {
  return { accountSidSet: !!env.TWILIO_ACCOUNT_SID, authTokenSet: !!env.TWILIO_AUTH_TOKEN, fromNumberSet: !!env.TWILIO_FROM_NUMBER };
}

export type ServiceId = 'jobs' | 'vercel' | 'neon' | 'github' | 'stripe' | 'twilio' | 'resend' | 'calcom' | 'sentry' | 'assistant' | 'blob';
export type ServiceState = { state: 'ok' | 'warn' | 'bad' | 'unknown'; note: string };

export type ServiceInput = {
  now: Date;
  crons: { job: string; status: 'ok' | 'bad' | 'warn' }[];
  commitSha: string;
  neon: NeonStatus;
  github: GithubStatus;
  resend: ResendStatus;
  twilio: TwilioStatus;
  stripe: { keySet: boolean; webhookSecretSet: boolean; lastWebhook: { at: string; outcome: string } | null };
  calcom: { state: 'off' } | { state: 'invalid' } | { state: 'on'; webhookSecretSet: boolean };
  sentry: boolean;
  assistant: { enabled: boolean; flag: boolean; keySet: boolean };
  blob: { publicSet: boolean; privateSet: boolean };
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Pure: each service's dot and its one-line state — the board's only rule. */
export function serviceStates(i: ServiceInput): Record<ServiceId, ServiceState> {
  const bad = i.crons.filter(c => c.status === 'bad'), warn = i.crons.filter(c => c.status === 'warn');
  const jobs: ServiceState = bad.length ? { state: 'bad', note: `${bad.length} failing: ${bad.map(c => c.job).join(', ')}` }
    : warn.length ? { state: 'warn', note: `${warn.length} not run yet` }
    : { state: 'ok', note: `All ${i.crons.length} on schedule` };

  const b = i.neon.backup;
  const backupLate = !!b && b.conclusion !== 'running' && i.now.getTime() - Date.parse(b.at) > BACKUP_LATE_MS;
  const neon: ServiceState = i.neon.db === 'down' ? { state: 'bad', note: 'Database not answering' }
    : !b ? { state: 'ok', note: 'Up · backup can’t be seen here' }
    : b.conclusion === 'failure' ? { state: 'bad', note: 'Up · last backup failed' }
    : backupLate ? { state: 'warn', note: 'Up · last backup over 30 hours ago' }
    : { state: 'ok', note: b.conclusion === 'running' ? 'Up · backup running' : 'Up · backup done' };

  const g = i.github;
  const github: ServiceState = !g.readable ? { state: 'unknown', note: 'Check on GitHub' }
    : g.backup?.conclusion === 'failure' ? { state: 'bad', note: 'Last backup run failed' }
    : g.ci?.conclusion === 'failure' ? { state: 'warn', note: 'Latest test run on main failed' }
    // One read failed (a timeout, a rate limit) or there's no run yet: say so, never a green guess.
    : !g.backup ? { state: 'unknown', note: 'Backup run can’t be seen here' }
    : !g.ci ? { state: 'unknown', note: 'Test run can’t be seen here' }
    : g.backup.conclusion === 'running' || g.ci.conclusion === 'running' ? { state: 'ok', note: 'Running now' }
    : { state: 'ok', note: 'Backup and tests passing' };

  const st = i.stripe;
  const stripe: ServiceState = !st.keySet ? { state: 'bad', note: 'Key missing' }
    : !st.webhookSecretSet ? { state: 'bad', note: 'Webhook secret missing' }
    : !st.lastWebhook ? { state: 'warn', note: 'No webhook event received yet' }
    : st.lastWebhook.outcome === 'error' ? { state: 'warn', note: 'Last webhook event failed' }
    : { state: 'ok', note: 'Receiving events' };

  const missing = [i.twilio.accountSidSet, i.twilio.authTokenSet, i.twilio.fromNumberSet].filter(x => !x).length;
  const twilio: ServiceState = missing ? { state: 'warn', note: `${plural(missing, 'key')} missing` } : { state: 'ok', note: 'Keys set' };

  const r = i.resend;
  const resend: ServiceState = !r.keySet ? { state: 'bad', note: 'Key missing — no email is sent' }
    : r.domainVerified === false ? { state: 'bad', note: `${r.domain} not verified` }
    : r.domainVerified === null ? { state: 'ok', note: 'Key set' }
    : { state: 'ok', note: 'Key set · domain verified' };

  const c = i.calcom;
  const calcom: ServiceState = c.state === 'off' ? { state: 'warn', note: 'Off — courses are asked to reply with times' }
    : c.state === 'invalid' ? { state: 'bad', note: 'Booking link unusable' }
    : !c.webhookSecretSet ? { state: 'warn', note: 'On · webhook secret missing' }
    : { state: 'ok', note: 'On' };

  const sentry: ServiceState = i.sentry ? { state: 'ok', note: 'Set up' } : { state: 'warn', note: 'Not set up' };

  const a = i.assistant;
  const assistant: ServiceState = a.flag && !a.keySet ? { state: 'bad', note: 'Turned on but the key is missing' }
    : a.enabled ? { state: 'ok', note: 'On' } : { state: 'ok', note: 'Off' };

  const blob: ServiceState = !i.blob.publicSet ? { state: 'bad', note: 'Public store key missing' }
    : !i.blob.privateSet ? { state: 'warn', note: 'Private store key missing' }
    : { state: 'ok', note: '2 stores connected' };

  const vercel: ServiceState = i.commitSha ? { state: 'ok', note: `Commit ${i.commitSha} live` } : { state: 'unknown', note: 'Commit not reported' };

  return { jobs, vercel, neon, github, stripe, twilio, resend, calcom, sentry, assistant, blob };
}
