// SEC-3 (Cam 2026-10-26: "see what sentry is doing and what it comes back
// with"): the open errors in Sentry, read with a READ-ONLY auth token
// (SENTRY_AUTH_TOKEN, scopes event:read + project:read) so nobody has to open
// Sentry to know something is breaking. Server only — the token never reaches
// a browser. Every failure is a plain sentence, never an empty list.

export type SentryIssue = { id: string; shortId: string; title: string; where: string; level: string; events: number; users: number; firstSeen: string; lastSeen: string; link: string };
export type SentryIssuesResult =
  | { ok: true; issues: SentryIssue[]; project: string }
  | { ok: false; reason: 'not_set_up' | 'failed'; message: string };

/** Sentry's API host for the org's region: the DSN says which (ingest.de → de.sentry.io; US is sentry.io). */
export function sentryApiBase(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SENTRY_API_URL) return env.SENTRY_API_URL.replace(/\/+$/, '');
  const dsn = env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN || '';
  const region = /\.ingest\.([a-z]{2})\.sentry\.io/.exec(dsn)?.[1];
  return region && region !== 'us' ? `https://${region}.sentry.io` : 'https://sentry.io';
}

export async function openSentryIssues(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<SentryIssuesResult> {
  const token = env.SENTRY_AUTH_TOKEN, org = env.SENTRY_ORG, project = env.SENTRY_PROJECT;
  const missing = [!token && 'SENTRY_AUTH_TOKEN', !org && 'SENTRY_ORG', !project && 'SENTRY_PROJECT'].filter(Boolean);
  if (missing.length) return { ok: false, reason: 'not_set_up', message: `Add ${missing.join(', ')} in Vercel to see Sentry’s errors here (a read-only token: event:read and project:read).` };
  const url = `${sentryApiBase(env)}/api/0/projects/${encodeURIComponent(org!)}/${encodeURIComponent(project!)}/issues/?query=${encodeURIComponent('is:unresolved')}&statsPeriod=14d&sort=date&limit=25`;
  try {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'failed', message: 'Sentry refused the token — check SENTRY_AUTH_TOKEN has event:read and project:read, and hasn’t been revoked.' };
    if (res.status === 404) return { ok: false, reason: 'failed', message: `Sentry has no project "${project}" in "${org}" — check SENTRY_ORG and SENTRY_PROJECT.` };
    if (!res.ok) return { ok: false, reason: 'failed', message: `Sentry answered ${res.status} — try again in a minute.` };
    const rows = await res.json() as Record<string, unknown>[];
    if (!Array.isArray(rows)) return { ok: false, reason: 'failed', message: 'Sentry sent something we couldn’t read.' };
    return {
      ok: true, project: project!,
      issues: rows.map(r => ({
        id: String(r.id ?? ''), shortId: String(r.shortId ?? ''), title: String(r.title ?? ''), where: String(r.culprit ?? ''),
        level: String(r.level ?? 'error'), events: Number(r.count ?? 0) || 0, users: Number(r.userCount ?? 0) || 0,
        firstSeen: String(r.firstSeen ?? ''), lastSeen: String(r.lastSeen ?? ''),
        // Only a Sentry link is ever rendered as one.
        link: typeof r.permalink === 'string' && /^https:\/\/([a-z0-9-]+\.)*sentry\.io\//.test(r.permalink) ? r.permalink : '',
      })),
    };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return { ok: false, reason: 'failed', message: timedOut ? 'Sentry didn’t answer within 6 seconds — try again.' : 'Couldn’t reach Sentry — try again in a minute.' };
  }
}
