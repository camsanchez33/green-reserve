'use client';
// SEC-3 (Cam 2026-10-26: "security has to be insane … see what Sentry is doing
// and what it comes back with"): one page for the site's security. The
// checklist first (a red line is a protection that's off), then what Sentry is
// reporting, then the last 30 days of sign-in trouble — who is locked out, the
// addresses and emails behind the failures, and every event. Owner only (the
// route enforces it); read-only.
import { useCallback, useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { adminFetch } from '@/lib/admin-fetch';
import type { Check } from '@/lib/security-checklist';
import type { SentryIssuesResult } from '@/lib/sentry-issues';

type Kind = 'signin_failed' | 'signin_ok' | 'locked_out' | 'second_factor_failed' | 'step_up_failed' | 'rate_limited' | 'new_device';
interface Data {
  checklist: Check[];
  sentry: SentryIssuesResult;
  overview: {
    last24h: Partial<Record<Kind, number>>; last30d: Partial<Record<Kind, number>>;
    topIps: { ip: string; failed: number }[]; topEmails: { email: string; failed: number }[];
    recent: { at: string; kind: Kind; surface: string; ip: string; email: string; detail: string; browser: string }[];
    lockedNow: { who: string; email: string; until: string }[];
  };
}

const KIND: Record<Kind, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  signin_failed: { label: 'Sign-in failed', tone: 'warn' },
  signin_ok: { label: 'Signed in', tone: 'ok' },
  locked_out: { label: 'Locked out', tone: 'bad' },
  second_factor_failed: { label: 'Wrong second factor', tone: 'bad' },
  step_up_failed: { label: 'Confirm-it’s-you failed', tone: 'bad' },
  rate_limited: { label: 'Too many tries', tone: 'warn' },
  new_device: { label: 'New owner device', tone: 'warn' },
};
const DOOR: Record<string, string> = { admin: 'Admin', owner: 'Owner (/cam)', course: 'Course dashboard', golfer: 'Golfer', member: 'Member' };
const when = (iso: string) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : '—';
const failedOf = (c: Partial<Record<Kind, number>>) => (c.signin_failed ?? 0) + (c.locked_out ?? 0) + (c.second_factor_failed ?? 0) + (c.step_up_failed ?? 0);

export default function AdminSecurityPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const res = await adminFetch<Data>('/api/admin/security', { subject: 'the security page' });
    setLoading(false);
    if (!res.ok) { setError(res.message); return; }
    setData(res.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const o = data?.overview;
  const bad = data?.checklist.filter(c => c.status === 'bad').length ?? 0;
  const warn = data?.checklist.filter(c => c.status === 'warn').length ?? 0;
  const events = o ? (showAll ? o.recent : o.recent.slice(0, 25)) : [];

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="security" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-10 py-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[30px] leading-none font-serif font-semibold text-ink">Security</h1>
              <p className="text-[13.5px] text-ink-soft mt-2">
                {!data ? 'What protects the site, what Sentry is reporting, and who has been trying to sign in.'
                  : bad ? `${bad} protection${bad === 1 ? ' is' : 's are'} off — fix ${bad === 1 ? 'it' : 'them'} first.`
                  : warn ? `Everything essential is on; ${warn} thing${warn === 1 ? '' : 's'} could be stronger.`
                  : 'Every protection is on.'}
              </p>
            </div>
            <button type="button" onClick={load} disabled={loading} className="text-[13px] font-medium text-ink px-3.5 py-2 rounded-md bg-white border border-line hover:border-line-strong disabled:opacity-50">
              {loading ? 'Checking…' : 'Check again'}
            </button>
          </div>

          {error && (
            <div role="alert" className="mt-5 rounded-md border border-bad/20 bg-bad/5 px-4 py-2.5 flex items-start justify-between gap-3">
              <p className="text-xs text-bad">{error}</p>
              <button type="button" onClick={load} className="text-xs font-medium text-ink-soft hover:text-ink shrink-0">Try again</button>
            </div>
          )}
          {!data && loading && <p className="text-ink-muted text-center py-16 text-sm">Checking…</p>}

          {data && o && (
            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <section aria-labelledby="sec-checks">
                <h2 id="sec-checks" className="text-[15px] font-semibold text-ink mb-2">Protections</h2>
                <Card>
                  <ul className="divide-y divide-line-soft">
                    {data.checklist.map(c => (
                      <li key={c.key} className={'flex items-start gap-3 px-4 py-3 ' + (c.status === 'bad' ? 'border-l-[3px] border-l-bad' : '')}>
                        <span className="pt-1.5"><StatusDot status={c.status} label="" /></span>
                        <div className="min-w-0">
                          <div className="text-[14px] text-ink">{c.label}</div>
                          <div className="text-[13px] text-ink-soft">{c.text}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>

              <section aria-labelledby="sec-sentry">
                <h2 id="sec-sentry" className="text-[15px] font-semibold text-ink mb-2">Errors Sentry is reporting</h2>
                <Card>
                  {!data.sentry.ok ? (
                    <div className={'px-4 py-4 text-[13.5px] ' + (data.sentry.reason === 'failed' ? 'border-l-[3px] border-l-warn' : '')}>
                      <p className="text-ink">{data.sentry.reason === 'not_set_up' ? 'Not connected yet.' : 'Couldn’t load Sentry.'}</p>
                      <p className="text-ink-soft mt-0.5">{data.sentry.message}</p>
                    </div>
                  ) : data.sentry.issues.length === 0 ? (
                    <p className="px-4 py-4 text-[13.5px] text-ink-soft">No open errors in the last 14 days.</p>
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {data.sentry.issues.map(i => (
                        <li key={i.id} className="px-4 py-3">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-[14px] text-ink min-w-0 break-words">
                              {i.link ? <a href={i.link} target="_blank" rel="noopener noreferrer" className="hover:underline">{i.title}</a> : i.title}
                            </span>
                            <span className="text-[12.5px] text-ink-muted tabular-nums shrink-0">{when(i.lastSeen)}</span>
                          </div>
                          <div className="text-[12.5px] text-ink-soft mt-0.5">
                            {i.where && <>{i.where} · </>}{i.events} time{i.events === 1 ? '' : 's'}{i.users ? ` · ${i.users} visitor${i.users === 1 ? '' : 's'}` : ''} · first {when(i.firstSeen)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </section>

              <section aria-labelledby="sec-signins" className="xl:col-span-2">
                <h2 id="sec-signins" className="text-[15px] font-semibold text-ink mb-2">Sign-ins</h2>
                <p className="text-[13.5px] text-ink-soft mb-3">
                  Last 24 hours: {failedOf(o.last24h)} failed, {o.last24h.signin_ok ?? 0} signed in, {o.last24h.rate_limited ?? 0} slowed down for too many tries.
                  {' '}Last 30 days: {failedOf(o.last30d)} failed, {o.last30d.locked_out ?? 0} lockout{(o.last30d.locked_out ?? 0) === 1 ? '' : 's'}.
                </p>

                <div className="grid gap-4 lg:grid-cols-3">
                  <Card>
                    <h3 className="px-4 pt-3 pb-2 text-[14px] font-semibold text-ink border-b border-line-soft">Locked out right now</h3>
                    {o.lockedNow.length === 0 ? <p className="px-4 py-3 text-[13.5px] text-ink-soft">Nobody.</p> : (
                      <ul className="divide-y divide-line-soft">
                        {o.lockedNow.map((l, n) => (
                          <li key={n} className="px-4 py-2.5 text-[13.5px]">
                            <div className="text-ink break-all">{l.email}</div>
                            <div className="text-[12.5px] text-ink-muted">{l.who} · until {when(l.until)}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                  <Card>
                    <h3 className="px-4 pt-3 pb-2 text-[14px] font-semibold text-ink border-b border-line-soft">Most failures by address</h3>
                    {o.topIps.length === 0 ? <p className="px-4 py-3 text-[13.5px] text-ink-soft">No failed sign-ins in 30 days.</p> : (
                      <ul className="divide-y divide-line-soft">
                        {o.topIps.map(r => (
                          <li key={r.ip} className="flex justify-between gap-3 px-4 py-2.5 text-[13.5px]"><span className="text-ink font-mono text-[13px] break-all">{r.ip || 'unknown'}</span><span className="tabular-nums text-ink-soft shrink-0">{r.failed}</span></li>
                        ))}
                      </ul>
                    )}
                  </Card>
                  <Card>
                    <h3 className="px-4 pt-3 pb-2 text-[14px] font-semibold text-ink border-b border-line-soft">Most failures by email typed</h3>
                    {o.topEmails.length === 0 ? <p className="px-4 py-3 text-[13.5px] text-ink-soft">No failed sign-ins in 30 days.</p> : (
                      <ul className="divide-y divide-line-soft">
                        {o.topEmails.map(r => (
                          <li key={r.email} className="flex justify-between gap-3 px-4 py-2.5 text-[13.5px]"><span className="text-ink break-all">{r.email}</span><span className="tabular-nums text-ink-soft shrink-0">{r.failed}</span></li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>

                <Card className="mt-4">
                  <h3 className="px-4 pt-3 pb-2 text-[14px] font-semibold text-ink border-b border-line-soft">Everything that went wrong, newest first</h3>
                  {events.length === 0 ? <p className="px-4 py-3 text-[13.5px] text-ink-soft">Nothing in the last 30 days.</p> : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[13.5px]">
                        <thead><tr className="text-left border-b border-line">
                          <th className="px-4 py-2 text-[12.5px] font-semibold text-ink">When</th>
                          <th className="px-4 py-2 text-[12.5px] font-semibold text-ink">What</th>
                          <th className="px-4 py-2 text-[12.5px] font-semibold text-ink">Where</th>
                          <th className="px-4 py-2 text-[12.5px] font-semibold text-ink">Email typed</th>
                          <th className="px-4 py-2 text-[12.5px] font-semibold text-ink">Address</th>
                        </tr></thead>
                        <tbody className="divide-y divide-line-soft">
                          {events.map((e, n) => (
                            <tr key={n} title={e.browser}>
                              <td className="px-4 py-2 tabular-nums text-ink-soft whitespace-nowrap">{when(e.at)}</td>
                              <td className="px-4 py-2 text-ink"><span className="inline-flex items-center gap-1.5"><StatusDot status={KIND[e.kind]?.tone ?? 'neutral'} label="" />{KIND[e.kind]?.label ?? e.kind}</span>{e.detail && <span className="block text-[12.5px] text-ink-muted">{e.detail}</span>}</td>
                              <td className="px-4 py-2 text-ink-soft">{DOOR[e.surface] ?? e.surface}</td>
                              <td className="px-4 py-2 text-ink-soft break-all">{e.email || '—'}</td>
                              <td className="px-4 py-2 text-ink-soft font-mono text-[12.5px]">{e.ip || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!showAll && o.recent.length > events.length && (
                    <button type="button" onClick={() => setShowAll(true)} className="m-3 text-[13px] text-ink-soft hover:text-ink">Show all {o.recent.length}</button>
                  )}
                </Card>
                <p className="mt-2 text-[12.5px] text-ink-muted">Kept 90 days. 20 failures from one address in an hour, or an admin lockout, becomes a Problem and an email. Remove an owner device you don’t recognise on My profile.</p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
