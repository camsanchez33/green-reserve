// Platform activity (Cam approved 2026-11-15, lanes/admin.md "Approved, to build: Platform activity"; mockup
// lanes/admin/system-mockup.html): the status board BY SERVICE. This file is the pure part — what /api/admin/system
// (and the owner tools' own routes) say, turned into one line per service: its dot, what it does, and its state.
// Anything the route does not return yet reads "Can't see here" (a grey dot) — never a guess.
import type { VersionRow } from '@/lib/agreement-publish';

export type St = 'ok' | 'warn' | 'bad' | '';

export interface CronHealth {
  status: 'ok' | 'bad' | 'warn'; note: string;
  last: { startedAt: string; finishedAt: string | null; outcome: string; detail: string; error: string } | null;
}
export type Run = { at: string; conclusion: 'success' | 'failure' | 'running'; url: string };
export type ServiceKey = 'jobs' | 'vercel' | 'neon' | 'github' | 'stripe' | 'twilio' | 'resend' | 'calcom' | 'sentry' | 'assistant' | 'blob';
export interface SystemData {
  lastStripeTouch: { courseName: string; updatedAt: string } | null;
  links: {
    backups: string; ci: string; commits: string;
    vercel: string; vercelIsDeep: boolean;
    sentry: string; sentryIsDeep: boolean;
    stripeWebhooks: string;
    resendDashboard?: string; twilioConsole?: string; neonConsole?: string;
    vercelEnv?: string; vercelEnvIsDeep?: boolean; vercelCrons?: string; vercelCronsIsDeep?: boolean;
  };
  crons: { path: string; schedule: string; human: string; health: CronHealth | null; canRerun?: boolean }[];
  stripeWebhook?: { at: string; outcome: string; detail: string; error: string } | null;
  calcom?: { state: 'off' } | { state: 'invalid'; raw: string; reason: string } | { state: 'on'; url: string; webhookSecretSet: boolean };
  birdie?: { enabled: boolean; keySet: boolean; flag: boolean; todayReplies: number; dailyCap: number; model: string };
  platform: {
    accessFeeCents: number; env: string; commitSha: string; commitMessage: string; branch: string; publicUrl: string;
    integrations: { stripe: boolean; stripeWebhook: boolean; resend: boolean; twilio: boolean; sentry: boolean; blob: boolean; privateBlob: boolean };
  };
  // From Build (claude/platform-activity-data, agreed over send_message 2026-11-15). Every field optional: until it
  // lands, a row says "Can't see here". When `services` is there, its colours and notes are used as-is.
  services?: Partial<Record<ServiceKey, { state: 'ok' | 'warn' | 'bad' | 'unknown'; note: string }>>;
  neon?: { db: 'up' | 'down'; checkedAt: string; backup: Run | null };
  github?: { readable: boolean; backup: Run | null; ci: (Run & { branch: string; name: string }) | null };
  resend?: { keySet: boolean; domain: string; domainVerified: boolean | null };
  twilio?: { accountSidSet: boolean; authTokenSet: boolean; fromNumberSet: boolean };
  vercel?: { env: string; commitSha: string; commitMessage: string; branch: string; commitUrl: string };
}
export interface PlatformStripe {
  balance: { available: number; pending: number; currency: string };
  nextPayout: { amount: number; arrivalDate: string; status: string } | null;
}
export interface OrphanSweepItem { kind: 'course' | 'inquiry'; id: string; name: string; action: string; reason: string }
export interface AcknowledgedOrphan { id: string; name: string; archivedAt: string }
export interface Orphans { checked: boolean; items: OrphanSweepItem[]; acknowledged: AcknowledgedOrphan[]; note: string }
export type WipePreview = { open: boolean; closesAt: string; confirmWords: string; wiped: Record<string, number>; kept: Record<string, number>; inquiriesUnlinked?: number; courseCalls?: number };

export type Group = 'run' | 'talk' | 'money' | 'watch' | 'owner';
export interface Svc { id: string; g: Group; t: string; does: string; st: St; state: string }

export const GROUPS: [Group, string][] = [
  ['run', 'Running the site'], ['money', 'Payments'], ['talk', 'Email, texts and calls'], ['watch', 'Errors, assistant and files'],
];
export const RANK: Record<St, number> = { bad: 0, warn: 1, ok: 2, '': 2 };
export const FILTERS: [St | 'all', string][] = [['all', 'All'], ['bad', 'Failing'], ['warn', 'Needs a look'], ['ok', 'Working'], ['', 'Can’t see here']];
export const CANT = 'Can’t see here';

export const jobName = (path: string) => path.replace('/api/cron/', '');
/** Colour only where it means something (Build, 2026-11-15): a job with no run recorded yet is grey — nothing is
 *  broken. Overdue (a warn that has a last run) is RED, like failed or never finished: an overdue hourly job means
 *  holds, no-show fees and check-in emails aren't going out. */
export const cronSt = (c: SystemData['crons'][number]): St => {
  const h = c.health;
  if (!h) return '';
  if (h.status === 'warn') return h.last ? 'bad' : '';
  return h.status;
};
export const overdue = (c: SystemData['crons'][number]) => c.health?.status === 'warn' && !!c.health.last;
export const notRunYet = (c: SystemData['crons'][number]) => !c.health || (c.health.status === 'warn' && !c.health.last);

const pl = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const stamp = (d: string) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function twilioKeys(d: SystemData): { sid: boolean; token: boolean; from: boolean } | null {
  const t = d.twilio;
  return t ? { sid: t.accountSidSet, token: t.authTokenSet, from: t.fromNumberSet } : null;
}

export function stripeSt(d: SystemData): St {
  const i = d.platform.integrations;
  if (!i.stripe || !i.stripeWebhook) return 'bad';
  if (d.stripeWebhook) return d.stripeWebhook.outcome === 'error' ? 'bad' : 'ok';
  return '';
}

export function services(d: SystemData): Svc[] {
  const i = d.platform.integrations;
  const out: Svc[] = [];

  const bad = d.crons.filter(c => cronSt(c) === 'bad'), fresh = d.crons.filter(notRunYet);
  const late = bad.filter(overdue).length, failing = bad.length - late;
  out.push({ id: 'jobs', g: 'run', t: 'Scheduled jobs', does: `The ${d.crons.length === 6 ? 'six' : d.crons.length} crons that run the platform`,
    st: bad.length ? 'bad' : fresh.length ? '' : 'ok',
    state: bad.length ? `${bad.length} ${!late ? 'failing' : !failing ? 'overdue' : 'failing or overdue'}: ${bad.map(c => jobName(c.path)).join(', ')}`
      : fresh.length ? `${fresh.length} not run yet` : `All ${d.crons.length} on schedule` });

  const tk = twilioKeys(d);
  const twMissing = tk ? [tk.sid, tk.token, tk.from].filter(x => !x).length : (i.twilio ? 0 : -1);
  out.push({ id: 'twilio', g: 'talk', t: 'Twilio', does: 'Texts to golfers who agreed',
    st: twMissing === 0 ? 'ok' : 'warn',
    state: twMissing === 0 ? 'Keys set' : twMissing > 0 ? `${pl(twMissing, 'key')} missing` : 'A key is missing' });

  const prod = d.platform.env === 'production';
  out.push({ id: 'vercel', g: 'run', t: 'Vercel', does: 'Hosting and deploys', st: prod ? 'ok' : 'warn',
    state: d.platform.commitSha ? `Commit ${d.platform.commitSha} live` + (prod ? '' : ` · ${d.platform.env}`) : `${d.platform.env} · local build` });

  const neon = d.neon, bk = neon?.backup;
  out.push({ id: 'neon', g: 'run', t: 'Neon', does: 'The database',
    st: !neon ? '' : neon.db === 'down' || bk?.conclusion === 'failure' ? 'bad' : !bk ? 'warn' : 'ok',
    state: !neon ? CANT : neon.db === 'down' ? 'Down' : !bk ? 'Up · no backup found' : bk.conclusion === 'failure' ? 'Up · last backup failed'
      : bk.conclusion === 'running' ? 'Up · backup running' : `Up · backup ${stamp(bk.at)}` });

  const sst = stripeSt(d);
  out.push({ id: 'stripe', g: 'money', t: 'Stripe', does: 'Payments and payouts', st: sst,
    state: !i.stripe ? 'Key missing' : !i.stripeWebhook ? 'Webhook secret missing' : d.stripeWebhook
      ? (d.stripeWebhook.outcome === 'error' ? 'The last event failed' : `Last event ${stamp(d.stripeWebhook.at)}`) : 'No event received yet' });

  const rs = d.resend;
  out.push({ id: 'resend', g: 'talk', t: 'Resend', does: 'Email to golfers and courses',
    st: !i.resend ? 'bad' : rs && rs.domainVerified === false ? 'warn' : 'ok',
    state: !i.resend ? 'Key missing' : rs && rs.domainVerified === false ? 'Sending domain not verified' : 'Key set' });

  out.push({ id: 'sentry', g: 'watch', t: 'Sentry', does: 'Error tracking', st: i.sentry ? 'ok' : 'warn', state: i.sentry ? 'Set up' : 'No key — errors not reported' });

  const cal = d.calcom;
  out.push({ id: 'calcom', g: 'talk', t: 'Cal.com', does: 'Call booking for new courses',
    st: !cal ? '' : cal.state === 'on' ? (cal.webhookSecretSet ? 'ok' : 'bad') : cal.state === 'invalid' ? 'bad' : 'warn',
    state: !cal ? CANT : cal.state === 'on' ? (cal.webhookSecretSet ? 'On' : 'On, bookings won’t arrive') : cal.state === 'invalid' ? 'Link can’t be used' : 'Off' });

  const b = d.birdie;
  out.push({ id: 'anthropic', g: 'watch', t: 'Anthropic', does: 'The course assistant',
    st: !b ? '' : !b.enabled ? '' : b.todayReplies >= b.dailyCap ? 'warn' : 'ok',
    state: !b ? CANT : !b.enabled ? 'Off' : `On · ${b.todayReplies.toLocaleString()} of ${b.dailyCap.toLocaleString()} replies today` });

  const stores = [i.blob, i.privateBlob].filter(Boolean).length;
  out.push({ id: 'blob', g: 'watch', t: 'Blob storage', does: 'Files and private contracts',
    st: !i.privateBlob ? 'bad' : !i.blob ? 'warn' : 'ok',
    state: stores === 2 ? '2 stores connected' : !i.privateBlob ? 'Contract store missing' : 'Public store missing' });

  const gh = d.github?.readable ? d.github : null;
  const failed = (r: Run | null | undefined) => r?.conclusion === 'failure';
  out.push({ id: 'github', g: 'run', t: 'GitHub', does: 'CI and backup runs',
    st: !gh ? '' : failed(gh.backup) ? 'bad' : failed(gh.ci) ? 'warn' : gh.backup || gh.ci ? 'ok' : '',
    state: !gh ? 'Check on GitHub' : failed(gh.backup) ? 'Last backup run failed' : failed(gh.ci) ? 'Last CI run failed' : gh.backup || gh.ci ? 'Last runs passed' : 'Check on GitHub' });

  // Build's own verdict wins once the route sends it: the colour and the words, never re-derived here.
  const KEY: Record<string, ServiceKey> = { anthropic: 'assistant' };
  // Two exceptions, so colour always means something (Build, 2026-11-15): the assistant switched off is grey, never
  // green; and jobs that only haven't run yet stay grey even if the route calls them amber.
  return out.map(x => {
    const v = d.services?.[KEY[x.id] ?? (x.id as ServiceKey)];
    if (!v) return x;
    let st: St = v.state === 'unknown' ? '' : v.state;
    if (x.id === 'anthropic' && d.birdie && !d.birdie.enabled && st === 'ok') st = '';
    if (x.id === 'jobs' && st === 'warn' && x.st === '') return x;
    return { ...x, st, state: v.state === 'unknown' ? CANT : v.note || x.state };
  });
}

/** What this page's own checks say, without the route's verdict — to tell when the two disagree. null for anything
 *  the route gives no verdict on (the owner tools), so no "server says" block is ever drawn there. */
export function localSt(d: SystemData, id: string): St | null {
  if (!d.services?.[(id === 'anthropic' ? 'assistant' : id) as ServiceKey]) return null;
  const x = services({ ...d, services: undefined }).find(s => s.id === id);
  return x ? x.st : null;
}

export function agreementSt(v: VersionRow): St {
  return v.published ? (v.published.hashMatches ? 'ok' : 'bad') : 'warn';
}

export function tools(o: { isOwner: boolean; orphans: Orphans; versions: VersionRow[] | null; versionsErr: string; wipe: WipePreview | null; wipeErr: string; wiped: number | null }): Svc[] {
  const out: Svc[] = [];
  const { orphans: or } = o;
  out.push({ id: 'data', g: 'owner', t: 'Data check', does: 'Orphan sweep, read-only until you act',
    st: !or.checked || or.note ? '' : or.items.length ? 'warn' : 'ok',
    state: !or.checked ? 'Not run this visit' : or.note ? 'Couldn’t check' : or.items.length ? `${pl(or.items.length, 'record')} to clean up` : 'Clean' });
  if (!o.isOwner) return out;

  const v = o.versions;
  const broken = v?.filter(x => x.published && !x.published.hashMatches) ?? [];
  const waiting = v?.filter(x => x.current && !x.published) ?? [];
  out.push({ id: 'agree', g: 'owner', t: 'Agreement versions', does: 'What courses sign',
    st: !v ? '' : broken.length ? 'bad' : waiting.length ? 'warn' : 'ok',
    state: !v ? (o.versionsErr ? CANT : 'Loading…') : broken.length ? `${broken[0].title} ${broken[0].version} changed after publishing`
      : waiting.length ? `${waiting[0].title} ${waiting[0].version} not published${waiting.length > 1 ? ` (+${waiting.length - 1} more)` : ''}` : 'All versions published' });

  const w = o.wipe;
  const total = w ? Object.values(w.wiped).reduce((a, n) => a + n, 0) : 0;
  const closes = w ? new Date(w.closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }) : '';
  out.push({ id: 'wipe', g: 'owner', t: 'Before launch: clear test data', does: 'Starts the site clean',
    st: o.wiped !== null ? 'ok' : '',
    state: o.wiped !== null ? `Cleared ${o.wiped.toLocaleString()} records` : !w ? (o.wipeErr ? CANT : 'Loading…') : !w.open ? 'Closed' : `Open until ${closes} · ${total.toLocaleString()} records` });
  return out;
}

/** "2 need a look" / "All 11 services running". The owner tools never count. */
export function summary(list: Svc[]): { st: St; text: string } {
  const n = list.filter(s => s.st === 'bad' || s.st === 'warn').length;
  if (!n) return { st: 'ok', text: `All ${list.length} services running` };
  return { st: list.some(s => s.st === 'bad') ? 'bad' : 'warn', text: `${n} need${n === 1 ? 's' : ''} a look` };
}

export const worst = (a: Svc[]) => a.slice().sort((x, y) => RANK[x.st] - RANK[y.st]);

export function matches(s: Svc, filt: St | 'all', q: string): boolean {
  const ql = q.trim().toLowerCase();
  return (filt === 'all' || s.st === filt) && (!ql || `${s.t} ${s.does} ${s.state}`.toLowerCase().includes(ql));
}
