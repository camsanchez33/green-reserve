'use client';
// SEC-3 (Cam 2026-10-26: "security has to be insane … see what Sentry is doing and what it comes back with"), reworked
// to the approved mockup (Cam 2026-11-17, lanes/admin/security-mockup.html; lanes/admin.md "Security — APPROVED"):
// Settings → Security in dark green glass. On top, the security checker's status and Your courses (Build's checker;
// hidden until its route exists, ./Checker). Then tabs: Sign-ins, Protections, Errors, and Incidents (checker only).
// No row of headline numbers; the filter is a bare icon. Owner only: GET /api/admin/security enforces it (the sidebar
// only hides the link). Read-only apart from the checker's own Undo / Approve / Not now, which Build's routes gate.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { ProfileCard, profileStyles as s } from '@/components/admin/ProfileCard';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import g from '../admin-glass.module.css';
import ss from './security.module.css';
import { Dialog } from './Dialog';
import { NETWORK, SIGNINS_LEAD, SIGNINS_FOOT, ERRORS_LEAD } from './terms';
import { useChecker, actOn, CheckerBox, CoursesCard, IncidentsTab, IncidentDialog, AskDialog } from './Checker';
import { type SecurityData, type Kind, type Tone, type CheckerAction, KIND, kindOf, DOOR, dayAndTime, when, failedOf, plural, protectionsLead } from './logic';

type Tab = 'signins' | 'protect' | 'errors' | 'log';
const PAGE = 25;
const dotClass = (t: Tone) => `${ss.sdt} ${t === 'neutral' ? '' : ss[t]}`;
const ICON = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export default function AdminSecurityPage() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [tab, setTab] = useState<Tab>('signins');
  const [door, setDoor] = useState('');
  const [kind, setKind] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [filterOpen, setFilterOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [openInc, setOpenInc] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actErr, setActErr] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checker = useChecker();
  const loadChecker = checker.load;

  const say = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch<SecurityData>('/api/admin/security', { subject: 'the security page' });
      if (!res.ok) { setLoadError({ msg: res.message, kind: res.kind }); return; }
      setData(res.data); setLoadError(null);
    } catch {
      setLoadError({ msg: NETWORK, kind: 'network' });
    } finally { setLoading(false); }
    await loadChecker();
  }, [loadChecker]);
  useEffect(() => { load(); }, [load]);

  const ck = checker.state.phase === 'ready' ? checker.state.data : null;
  // The Incidents tab exists only with the checker; if it goes away, fall back to Sign-ins.
  useEffect(() => { if (!ck && tab === 'log') setTab('signins'); }, [ck, tab]);

  async function act(id: string, verb: 'undo' | 'approve' | 'dismiss', label: string | null) {
    setBusy(id); setActErr(e => ({ ...e, [id]: '' }));
    try {
      say(await actOn(id, verb, label));
      await loadChecker();
      return true;
    } catch (e) {
      setActErr(x => ({ ...x, [id]: e instanceof Error ? e.message : 'Couldn’t do that.' }));
      return false;
    } finally { setBusy(null); }
  }
  const onBoxAct = (a: CheckerAction, verb: 'undo' | 'approve' | 'dismiss') => { act(a.id, verb, a.approveLabel); };

  const o = data?.overview;
  const events = o ? o.recent.filter(e => (!door || e.surface === door) && (!kind || e.kind === kind)) : [];
  const filters = (door ? 1 : 0) + (kind ? 1 : 0);
  const protectCount = data ? data.checklist.filter(c => c.status === 'warn' || c.status === 'bad').length : 0;
  const needCount = ck ? ck.incidents.filter(i => i.status === 'needs_you').length : 0;
  const tabs: [Tab, string, number][] = [['signins', 'Sign-ins', 0], ['protect', 'Protections', protectCount], ['errors', 'Errors', 0]];
  if (ck) tabs.push(['log', 'Incidents', needCount]);
  const inc = ck && openInc ? ck.incidents.find(i => i.id === openInc) ?? null : null;

  return (
    <>
      <AdminSidebar active="security" />
      <main className={g.main}>
        <div className={g.head}>
          <h1>Security</h1>
          <button type="button" className={ss.ibtn2} style={{ marginLeft: 'auto' }} onClick={() => load()} disabled={loading} aria-label={loading ? 'Checking…' : 'Check again'} title="Check again">
            <svg {...ICON}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></svg>
          </button>
        </div>

        {loadError && (
          <div className={`${g.glass} ${ss.problem}`} role="alert">
            <span>{loadError.msg}</span>
            {loadError.kind === 'unauthorized' ? <Link href="/admin/login" className={s.btn}>Sign in</Link>
              : loadError.kind === 'forbidden' ? null : <button type="button" className={s.btn} onClick={() => load()} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}
        {!data && loading && !loadError && <p className={ss.empty}>Checking…</p>}

        {data && o && (
          <div className={s.col}>
            {ck && <CheckerBox data={ck} busy={busy} errors={actErr} onAsk={() => setAsking(true)} onAct={onBoxAct} />}
            {ck && <CoursesCard data={ck} onOpen={setOpenInc} />}
            {checker.state.phase === 'error' && (
              <div className={`${g.glass} ${ss.problem}`} role="alert">
                <span>{checker.state.message}</span>
                <button type="button" className={s.btn} onClick={() => loadChecker()}>Try again</button>
              </div>
            )}

            <div className={ss.ptabs} role="tablist" aria-label="Security">
              {tabs.map(([k, label, n]) => (
                <button key={k} type="button" role="tab" id={`sc-tab-${k}`} aria-selected={tab === k} aria-controls="sc-panel" onClick={() => setTab(k)}>
                  {label}{n > 0 && <span className={ss.tcount}>{n}</span>}
                </button>
              ))}
            </div>

            <div id="sc-panel" role="tabpanel" aria-labelledby={`sc-tab-${tab}`} style={{ display: 'contents' }}>
              {tab === 'signins' && (
                <>
                  <ProfileCard title="Sign-in trouble" labelId="sc-si"
                    lead={`${SIGNINS_LEAD} Last 24 hours: ${failedOf(o.last24h)} failed, ${o.last24h.signin_ok ?? 0} signed in, ${o.last24h.rate_limited ?? 0} slowed down. Last 30 days: ${failedOf(o.last30d)} failed, ${plural(o.last30d.locked_out ?? 0, 'lockout')}.`}
                    top={
                      <button type="button" className={ss.ibtn2} onClick={() => setFilterOpen(true)} aria-label={filters ? `Filter (${filters} on)` : 'Filter'} title="Filter">
                        <svg {...ICON}><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" /></svg>{filters > 0 && <i className={ss.fdot} />}
                      </button>
                    }>
                    {filters > 0 && (
                      <div className={ss.aon}>
                        Showing {[door && (DOOR[door] ?? door), kind && kindOf(kind)[0]].filter(Boolean).join(' · ')}
                        <button type="button" className={s.lnk} onClick={() => { setDoor(''); setKind(''); }}>Clear</button>
                      </div>
                    )}
                    {events.length === 0 ? <p className={ss.empty}>{filters ? 'Nothing matches.' : 'Nothing in the last 30 days.'}</p> : (
                      <>
                        <div className={`${ss.sgr} ${ss.agh}`}><span>What happened</span><span>When</span><span>Who and where</span></div>
                        {events.slice(0, shown).map((e, n) => {
                          const [label, tone, meaning] = kindOf(e.kind);
                          const w = dayAndTime(e.at);
                          return (
                            <div key={n} className={ss.sgr} title={e.browser || undefined}>
                              <div className={ss.awhat}>
                                <b><span className={dotClass(tone)} aria-hidden="true" />{label} · {DOOR[e.surface] ?? e.surface}</b>
                                {meaning && <p>{meaning}</p>}
                                {e.detail && <p>{e.detail}</p>}
                              </div>
                              <div className={ss.awhen}>{w.day}<small>{w.time}</small></div>
                              <div className={ss.swho}>
                                {e.email ? <span>{e.email}</span> : <span className={ss.anone}>No email typed</span>}
                                <small className={ss.mono}>{e.ip || 'unknown address'}</small>
                              </div>
                            </div>
                          );
                        })}
                        {events.length > shown && <button type="button" className={`${s.lnk} ${ss.more}`} onClick={() => setShown(x => x + PAGE)}>Show older</button>}
                      </>
                    )}
                  </ProfileCard>

                  <div className={ss.pair}>
                    <ProfileCard title="Locked out right now" labelId="sc-locked">
                      {o.lockedNow.length === 0 ? <p className={ss.empty}>Nobody.</p> : o.lockedNow.map((l, n) => (
                        <div key={n} className={ss.prow}>
                          <span className={dotClass('bad')} aria-hidden="true" />
                          <span className={ss.pm2}>{l.email}<small>{l.who} · until {when(l.until)}</small></span>
                        </div>
                      ))}
                    </ProfileCard>
                    <ProfileCard title="Most failures by address" labelId="sc-ips" lead="Last 30 days.">
                      {o.topIps.length === 0 ? <p className={ss.empty}>No failed sign-ins in 30 days.</p> : o.topIps.map(r => (
                        <div key={r.ip} className={ss.cnt}><span className={ss.mono}>{r.ip || 'unknown'}</span><b>{r.failed}</b></div>
                      ))}
                    </ProfileCard>
                    <ProfileCard title="Most failures by email typed" labelId="sc-emails" lead="Last 30 days.">
                      {o.topEmails.length === 0 ? <p className={ss.empty}>No failed sign-ins in 30 days.</p> : o.topEmails.map(r => (
                        <div key={r.email} className={ss.cnt}><span>{r.email}</span><b>{r.failed}</b></div>
                      ))}
                    </ProfileCard>
                  </div>
                  <p className={ss.empty}>{SIGNINS_FOOT}</p>
                </>
              )}

              {tab === 'protect' && (
                <ProfileCard title="What protects the site" labelId="sc-prot" lead={protectionsLead(data.checklist)}>
                  {data.checklist.map(c => (
                    <div key={c.key} className={`${ss.prow} ${c.status === 'bad' ? ss.prowBad : ''}`}>
                      <span className={dotClass(c.status)} aria-hidden="true" />
                      <span className={ss.pm2}>{c.label}<small>{c.text}</small></span>
                    </div>
                  ))}
                </ProfileCard>
              )}

              {tab === 'errors' && (
                <ProfileCard title="Site errors" labelId="sc-err" lead={ERRORS_LEAD}>
                  {!data.sentry.ok ? (
                    <div className={`${ss.prow} ${data.sentry.reason === 'failed' ? ss.prowBad : ''}`}>
                      <span className={dotClass(data.sentry.reason === 'failed' ? 'warn' : 'neutral')} aria-hidden="true" />
                      <span className={ss.pm2}>{data.sentry.reason === 'not_set_up' ? 'Not connected yet.' : 'Couldn’t load Sentry.'}<small>{data.sentry.message}</small></span>
                    </div>
                  ) : data.sentry.issues.length === 0 ? <p className={ss.empty}>No open errors in the last 14 days.</p> : (
                    <>
                      <div className={`${ss.sgr} ${ss.agh}`}><span>What broke</span><span>Last seen</span><span>How often</span></div>
                      {data.sentry.issues.map(i => {
                        const w = dayAndTime(i.lastSeen);
                        return (
                          <div key={i.id} className={ss.sgr}>
                            <div className={ss.awhat}>
                              <b><span className={dotClass('bad')} aria-hidden="true" />{i.link ? <a href={i.link} target="_blank" rel="noopener noreferrer">{i.title}</a> : i.title}</b>
                              <p className={ss.mono}>{[i.where, `first seen ${when(i.firstSeen)}`].filter(Boolean).join(' · ')}</p>
                            </div>
                            <div className={ss.awhen}>{w.day}<small>{w.time}</small></div>
                            <div className={ss.swho}><span>{plural(i.events, 'time')}</span>{i.users > 0 && <small>{plural(i.users, 'visitor')}</small>}</div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </ProfileCard>
              )}

              {tab === 'log' && ck && <IncidentsTab data={ck} onOpen={setOpenInc} />}
            </div>
          </div>
        )}
      </main>

      {filterOpen && <FilterDialog door={door} kind={kind} onClose={() => setFilterOpen(false)} onApply={(d, k) => { setDoor(d); setKind(k); setShown(PAGE); setFilterOpen(false); }} />}
      {asking && <AskDialog onClose={() => setAsking(false)} />}
      {inc && (
        <IncidentDialog incident={inc} busy={busy === inc.actionId} error={inc.actionId ? actErr[inc.actionId] ?? '' : ''}
          onClose={() => setOpenInc(null)}
          onAct={async verb => { if (inc.actionId && await act(inc.actionId, verb, inc.approveLabel)) setOpenInc(null); }} />
      )}
      {toast && <div className={ss.toast} role="status">{toast}</div>}
    </>
  );
}

/** One Filter: which door, and what happened. */
function FilterDialog({ door, kind, onClose, onApply }: { door: string; kind: string; onClose: () => void; onApply: (door: string, kind: string) => void }) {
  const [d, setD] = useState(door);
  const [k, setK] = useState(kind);
  return (
    <Dialog labelId="sc-filter-t" onClose={onClose}>
      <h4 id="sc-filter-t">Filter</h4>
      <label className={ss.flab}>Door
        <select className={s.fld} value={d} onChange={e => setD(e.target.value)}>
          <option value="">Every door</option>
          {Object.entries(DOOR).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className={ss.flab}>What happened
        <select className={s.fld} value={k} onChange={e => setK(e.target.value)}>
          <option value="">Anything</option>
          {(Object.keys(KIND) as Kind[]).filter(x => x !== 'signin_ok').map(x => <option key={x} value={x}>{KIND[x][0]}</option>)}
        </select>
      </label>
      <div className={s.line}>
        <button type="button" className={s.lnk} onClick={() => onApply('', '')}>Clear</button>
        <span className={ss.spring} />
        <button type="button" className={`${s.btn} ${s.pri}`} onClick={() => onApply(d, k)}>Show</button>
      </div>
    </Dialog>
  );
}
