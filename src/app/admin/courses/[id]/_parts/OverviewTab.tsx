'use client';

// MP-12 (ADMIN_V4 V4-9): split out of admin/courses/[id]/page.tsx, which had
// grown to 2,700 lines and 52 useState in one component. Moved verbatim; state
// and handlers come from useCourseDetail() via useCourse().

import CourseCheckInCard from '@/components/admin/CourseCheckInCard';
import { setupProgress } from '@/lib/course-setup';
import { nextCall, overdueCall, fmtCallTime } from '@/lib/inquiry-call';
import Link from 'next/link';
import { Mail, Phone, AlertTriangle, Check } from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import { periodDelta, lastBookingLabel } from '@/lib/course-metrics';
import { formatDate as fmtDate, formatMoney as fmtMoney, formatTeeTime as fmtTime } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { onboardingSteps } from './shared';
import { PERMISSIONS } from '@/lib/staff-permissions';
import { useCourse } from './context';

const STAFF_PRESET_LABEL: Record<string, string> = { starter: 'Starter', front_desk: 'Front desk', manager: 'Manager', custom: 'Custom', legacy: 'Original staff access' };

export function OverviewTab() {
  const { detail, setTab, checkinFocus, verifyBusy, verifyMsg, phoneState, resendingId, resendMsg, sendingPreview, requestingReReview, liveToggleBusy, reminderNudgeBusy, reminderNudgeSent, reminderNudgeError, loadDetail, markVerified, toggleActive, sendGoLiveReminder, savePhone, resendSetup, sendCoursePreview, requestReReview, c } = useCourse();
  return (() => {
            const steps = onboardingSteps(detail);
            const doneSteps = steps.filter(s => s.done).length;
            const lastLabel = lastBookingLabel(detail.lastBookingAt);
            const trend = periodDelta(detail.bookings30d, detail.bookingsPrior30d);
            const openItemsList = [
              ...(detail.openItems.unreadMessages > 0 ? [`${detail.openItems.unreadMessages} unread message${detail.openItems.unreadMessages !== 1 ? 's' : ''}`] : []),
              ...(doneSteps < steps.length ? [`${steps.length - doneSteps} setup step${steps.length - doneSteps !== 1 ? 's' : ''} incomplete`] : []),
              ...detail.openItems.openChanges.map(c2 => `Change requested: ${c2}`),
            ];
            return (
            <div className="grid grid-cols-[1fr_320px] gap-6 max-w-6xl">
              <div className="space-y-6 min-w-0">
                {/* CS-3 §1: getting live — the five setup steps and the one
                    action that completes each; then the discovery call if
                    one is on the books. */}
                {(detail.health.status === 'setup_incomplete' || detail.health.status === 'orphaned') && (() => {
                  const setup = setupProgress({ ...c, liveStatus: c.liveStatus ?? (c.active ? 'live' : 'draft'), approvalStatus: detail.approval.status });
                  const discovery = (detail.calls ?? []).filter(x => x.kind === 'discovery');
                  const dNext = nextCall(discovery);
                  const dMissed = overdueCall(discovery);
                  const stepAction = (key: string) => {
                    if (key === 'approved') {
                      if (detail.approval.status === 'changes_requested') {
                        return <button onClick={requestReReview} disabled={requestingReReview} className="text-xs font-medium text-pine hover:underline disabled:opacity-50">{requestingReReview ? 'Requesting…' : 'Request re-review'}</button>;
                      }
                      return <button onClick={sendCoursePreview} disabled={sendingPreview || !c.operator?.email} className="text-xs font-medium text-pine hover:underline disabled:opacity-50">{sendingPreview ? 'Sending…' : 'Send preview'}</button>;
                    }
                    if (key === 'verified') {
                      return <button onClick={markVerified} disabled={verifyBusy || !c.operator?.email} className="text-xs font-medium text-pine hover:underline disabled:opacity-50">{verifyBusy ? 'Working…' : 'Mark verified'}</button>;
                    }
                    if (key === 'stripe') {
                      return <button onClick={() => sendGoLiveReminder('stripe')} disabled={reminderNudgeBusy || reminderNudgeSent} className="text-xs font-medium text-pine hover:underline disabled:opacity-50">{reminderNudgeBusy ? 'Sending…' : reminderNudgeSent ? 'Reminder sent' : 'Send Stripe reminder'}</button>;
                    }
                    if (key === 'live') {
                      return <button onClick={() => toggleActive(true)} disabled={liveToggleBusy} className="text-xs font-medium text-pine hover:underline disabled:opacity-50">{liveToggleBusy ? 'Working…' : 'Set live'}</button>;
                    }
                    return null;
                  };
                  return (
                    <Card className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <Eyebrow>Setup</Eyebrow>
                        <span className="text-xs text-ink-soft">{setup.done} of {setup.total}{setup.next ? ` · next: ${setup.next.short}` : ' · ready to go live'}</span>
                      </div>
                      <div className="border border-line rounded-md divide-y divide-line-soft">
                        {setup.steps.map(st => (
                          <div key={st.key} className="flex items-center gap-3 px-3 py-2">
                            <span className={'w-4 h-4 rounded-full flex items-center justify-center shrink-0 ' + (st.done ? 'bg-ok text-white' : 'border border-line bg-paper')}>
                              {st.done && <Check className="w-3 h-3" />}
                            </span>
                            <span className={'text-sm flex-1 ' + (st.done ? 'text-ink' : 'text-ink-soft')}>{st.label}</span>
                            {!st.done && stepAction(st.key)}
                          </div>
                        ))}
                      </div>
                      {verifyMsg && <p className={'text-xs mt-2 ' + (verifyMsg.startsWith('Error') ? 'text-bad' : 'text-ok')}>{verifyMsg}</p>}
                      {reminderNudgeError && <p className="text-xs mt-2 text-bad">{reminderNudgeError}</p>}
                      {(dNext || dMissed) && detail.origin && (
                        <div className="mt-3 pt-3 border-t border-line-soft flex items-center gap-2 text-xs">
                          <Phone className={'w-3.5 h-3.5 ' + (dMissed && !dNext ? 'text-warn' : 'text-pine')} />
                          {dNext
                            ? <span className="text-ink">Discovery call {fmtCallTime(dNext.scheduledAt)} · {dNext.durationMin} min</span>
                            : <span className="text-warn">Discovery call went by {dMissed ? fmtCallTime(dMissed.scheduledAt) : ''} without a log</span>}
                          <a href={`/admin/inquiries/${detail.origin.inquiryId}?call=1`} className="ml-auto font-medium text-pine hover:underline">Open on the inquiry</a>
                        </div>
                      )}
                    </Card>
                  );
                })()}

                {/* CS-3 §2: live — the next check-in. */}
                {c.active && !c.archivedAt && (
                  <CourseCheckInCard
                    courseId={c.id}
                    operatorName={c.operator?.name || ''}
                    phone={c.phone || c.operator?.phone || ''}
                    nextCheckInAt={c.nextCheckInAt ?? null}
                    calls={detail.calls ?? []}
                    onRefresh={loadDetail}
                    focus={checkinFocus}
                  />
                )}

                {c.adminNotes && c.adminNotes.startsWith('[BUILD NOTES]') && (
                  <div className="bg-warn/5 border border-warn/20 rounded-lg px-5 py-4">
                    <div className="text-[13px] font-semibold text-warn mb-2">Needs review</div>
                    <ul className="space-y-1">
                      {c.adminNotes.replace('[BUILD NOTES]\n', '').split('\n').filter(Boolean).map((line, i) => (
                        <li key={i} className="text-sm text-ink-soft">{line.replace(/^• /, '')}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* MP-5e: the intake typo that survives to production. An
                    inquiry saying "Mahwah, AL" and a live course saying
                    "MAHWAH, NJ" both sit in the database one screen apart, and
                    nothing had ever put them side by side. Read-only on
                    purpose: a drift can mean an admin fixed a typo after
                    building (the sheet is stale) or that the build got it
                    wrong, and only a human knows which. */}
                {detail.configDrift && detail.configDrift.length > 0 && (
                  <div className="bg-white border border-warn/30 rounded-lg p-5">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[13px] font-semibold text-warn">
                        Setup sheet disagrees with the live course
                      </div>
                      <span className="text-[11px] text-ink-faint">
                        {detail.configDrift.length} field{detail.configDrift.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-sm text-ink-soft mb-3">
                      Neither side is assumed correct — this only shows that they differ.
                    </p>
                    <div className="border border-line rounded-md divide-y divide-line">
                      <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-3 py-2 bg-paper">
                        <span className="text-[13px] font-semibold text-ink">Field</span>
                        <span className="text-[13px] font-semibold text-ink">They told us</span>
                        <span className="text-[13px] font-semibold text-ink">Golfers see</span>
                      </div>
                      {detail.configDrift.map(d2 => (
                        <div key={d2.field} className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-3 py-2">
                          <span className="text-xs text-ink-muted truncate">{d2.label}</span>
                          <span className="text-xs text-ink-soft break-words">{d2.sheet}</span>
                          <span className="text-xs text-ink font-medium break-words">{d2.live}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <button onClick={() => setTab('setup')} className="text-xs font-medium text-pine hover:text-pine-hover transition-colors">
                        Fix on Setup
                      </button>
                      {detail.origin && (
                        <a href={`/admin/inquiries/${detail.origin.inquiryId}`}
                          className="text-xs text-ink-muted hover:text-ink transition-colors">
                          Open their sheet
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Client health block (item 3, top) */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <Eyebrow>Client health</Eyebrow>
                    <span title={detail.health.reason}><StatusDot status={detail.health.dot} label={detail.health.label} /></span>
                  </div>
                  <p className="text-sm text-ink-soft mb-4">{detail.health.reason}</p>
                  <div className="flex items-center gap-6 flex-wrap text-xs mb-4">
                    <div><span className="text-ink-muted mr-1.5">Last activity</span><span className="font-medium text-ink">{lastLabel}</span></div>
                    <div><span className="text-ink-muted mr-1.5">Setup</span><span className="font-medium text-ink">{doneSteps}/{steps.length} steps</span>
                      <button onClick={() => setTab('setup')} className="ml-1.5 text-pine hover:underline">View</button>
                    </div>
                  </div>
                  {openItemsList.length > 0 ? (
                    <div className="border-t border-line-soft pt-3">
                      <Eyebrow className="mb-2">Open items</Eyebrow>
                      <ul className="space-y-1">
                        {openItemsList.map((item, i) => (
                          <li key={i} className="text-sm text-ink-soft flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-warn shrink-0" />{item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="border-t border-line-soft pt-3 text-sm text-ink-muted">No open items.</div>
                  )}
                </Card>

                {/* Money block (item 3, bottom) — shared metrics brain */}
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Bookings (30d)', value: String(detail.bookings30d), color: 'text-ink' },
                    { label: 'Gross (30d)', value: fmtMoney(detail.revenue30d.gross), color: 'text-ink' },
                    { label: 'GR Fees (30d)', value: fmtMoney(detail.revenue30d.platform), color: 'text-ok' },
                    { label: 'All-time Bookings', value: String(detail.totalBookings), color: 'text-ink' },
                  ].map(({ label, value, color }) => (
                    <Card key={label} className="p-5">
                      <Eyebrow className="mb-2">{label}</Eyebrow>
                      <div className={'text-[28px] font-serif font-semibold leading-none ' + color}>{value}</div>
                      {label === 'Bookings (30d)' && (
                        <div className={'text-xs font-medium mt-1.5 ' + (trend.direction === 'up' ? 'text-ok' : trend.direction === 'down' ? 'text-bad' : 'text-ink-muted')}>
                          {trend.pct === null ? 'no prior period' : `${trend.pct > 0 ? '+' : ''}${trend.pct.toFixed(0)}% vs prior 30d`}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>

                {detail.recentBookings.length > 0 && (
                  <div>
                    <Eyebrow className="mb-2">Recent bookings</Eyebrow>
                    <Card className="divide-y divide-line-soft">
                      {detail.recentBookings.map(b => (
                        <div key={b.id} className="flex items-center gap-4 px-5 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-ink text-sm">{b.golferName}</div>
                            <div className="text-xs text-ink-muted">
                              {fmtDate(b.teeTime.date)} at {fmtTime(b.teeTime.time)} · {b.players} player{b.players !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <div className="text-sm font-medium text-ok">{fmtMoney(b.totalAmount / 100)}</div>
                        </div>
                      ))}
                    </Card>
                  </div>
                )}

                {detail.recentBookings.length === 0 && detail.totalBookings === 0 && (
                  <Card className="text-center py-12 text-ink-muted text-sm">
                    No bookings yet for this course
                  </Card>
                )}

                {/* MP-5e part 3: every touchpoint with this course in one line of
                    time — notes, messages, pipeline moves, calls, settings. */}
                {detail.relationship && (
                  <Card className="p-5">
                    <Eyebrow className="mb-3">Relationship</Eyebrow>
                    {detail.relationship.feed.length === 0 ? (
                      <p className="text-sm text-ink-soft">Nothing recorded yet — notes, messages, calls and pipeline moves will show here.</p>
                    ) : (
                      <div className="divide-y divide-line-soft">
                        {detail.relationship.feed.map((f, i) => (
                          <div key={i} className="py-2 grid grid-cols-[88px_76px_minmax(0,1fr)] gap-3 text-[13.5px]">
                            <span className="text-ink-muted tabular-nums">{fmtDate(f.at)}</span>
                            <span className="text-[13px] font-semibold text-ink pt-0.5">{f.kind}</span>
                            <span className="text-ink min-w-0 break-words">{f.text}{f.by ? <span className="text-ink-muted"> · {f.by}</span> : null}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}
              </div>

              {/* Client card (contact info) — folded in from the old Contact tab (item 1) */}
              <div className="space-y-5">
                {detail.relationship && (
                  <Card className="p-5">
                    <Eyebrow className="mb-3">Engagement</Eyebrow>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between gap-3"><dt className="text-ink-muted">Operator last signed in</dt><dd className="text-ink text-right">{detail.relationship.operatorLastLoginAt ? fmtDate(detail.relationship.operatorLastLoginAt) : 'Never'}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-ink-muted">First went live</dt><dd className="text-ink text-right">{detail.relationship.firstWentLiveAt ? fmtDate(detail.relationship.firstWentLiveAt) : 'Not yet'}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-ink-muted">Earned GreenReserve</dt><dd className="text-ink text-right tabular-nums">${(detail.relationship.earnedCents / 100).toFixed(2)} <span className="text-ink-muted">· {detail.relationship.paidRounds} paid round{detail.relationship.paidRounds === 1 ? '' : 's'}</span></dd></div>
                    </dl>
                  </Card>
                )}
                {/* ORPHAN SWEEP item 2 (FUTURE-PROOF) — origin card. A broken
                    link says so loudly instead of pretending it's fine. */}
                <div className={'bg-white border rounded-lg p-5 ' + (detail.origin ? 'border-line' : 'border-bad/30 bg-bad/5')}>
                  <Eyebrow className="mb-2">Origin</Eyebrow>
                  {detail.origin ? (
                    <Link href={'/admin/inquiries/' + detail.origin.inquiryId} className="text-sm text-pine hover:underline">
                      From inquiry · accepted {fmtDate(detail.origin.acceptedAt)}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-bad font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />No linked inquiry — origin record missing
                    </div>
                  )}
                </div>
                {c.operator && (
                  <Card className="p-5">
                    <Eyebrow className="mb-3">Operator / Owner</Eyebrow>
                    <div className="font-medium text-ink mb-2">{c.operator.name}</div>
                    <div className="space-y-1.5 mb-3">
                      <a href={'mailto:' + c.operator.email} className="flex items-center gap-2 text-sm text-ink-soft hover:text-pine transition-colors">
                        <Mail className="w-3.5 h-3.5 text-ink-muted shrink-0" />{c.operator.email}
                      </a>
                      {c.operator.phone && (
                        <a href={'tel:' + c.operator.phone} className="flex items-center gap-2 text-sm text-ink-soft hover:text-pine transition-colors">
                          <Phone className="w-3.5 h-3.5 text-ink-muted shrink-0" />{c.operator.phone}
                        </a>
                      )}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {c.operator.emailVerified
                        ? <StatusDot status="ok" label="Email verified" />
                        : <StatusDot status="bad" label="Email not verified" />}
                      {c.stripeAccountActive
                        ? <StatusDot status="ok" label="Stripe connected" />
                        : <StatusDot status="warn" label="No Stripe" />}
                    </div>
                  </Card>
                )}

                <Card className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <Eyebrow>Course contact</Eyebrow>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex gap-3 text-sm">
                      <span className="text-ink-muted w-16 shrink-0">Phone</span>
                      <input
                        defaultValue={c.phone || ''}
                        onBlur={e => { if (e.target.value !== (c.phone || '')) savePhone(e.target.value); }}
                        placeholder="Not set"
                        className="flex-1 min-w-0 bg-transparent text-ink font-medium outline-none border-b border-transparent focus:border-pine/40 transition-colors"
                      />
                      {phoneState === 'saving' && <span className="text-[11px] text-ink-muted shrink-0">Saving…</span>}
                      {phoneState === 'saved' && <span className="text-[11px] text-ok shrink-0">Saved</span>}
                    </div>
                    {phoneState && phoneState !== 'saving' && phoneState !== 'saved' && (
                      <div className="text-[11px] text-bad pl-[76px]">{phoneState}</div>
                    )}
                    <div className="flex gap-3 text-sm">
                      <span className="text-ink-muted w-16 shrink-0">Type</span>
                      <span className="text-ink font-medium capitalize">{c.type}</span>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span className="text-ink-muted w-16 shrink-0">Slug</span>
                      <span className="text-ink font-medium">{c.slug}</span>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span className="text-ink-muted w-16 shrink-0">Where</span>
                      <span className="text-ink font-medium">{c.city}, {c.state}</span>
                    </div>
                  </div>
                </Card>

                {/* MP-5d: the Staff tab's one real action — resend a login —
                    lives here now. Everything else that tab showed is on
                    this rail already. */}
                {detail.staff.length > 0 && (
                  <Card className="p-5">
                    <Eyebrow className="mb-3">Staff &amp; access</Eyebrow>
                    <div className="space-y-3">
                      {detail.staff.map(s => (
                        <div key={s.id} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-sm shrink-0">{s.name[0]}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-ink truncate">
                              {s.name} <span className="text-xs text-ink-muted font-normal">· {STAFF_PRESET_LABEL[s.preset] ?? 'Custom'}{s.active ? '' : ' · inactive'}</span>
                            </div>
                            <a href={'mailto:' + s.email} className="text-xs text-pine hover:underline truncate block">{s.email}</a>
                            {/* SP-A: read-only — the course owner sets this in their Settings. */}
                            <details className="mt-1">
                              <summary className="text-[11px] text-ink-muted cursor-pointer hover:text-ink">{s.permissions.length} permission{s.permissions.length === 1 ? '' : 's'}</summary>
                              <ul className="mt-1 text-[11.5px] text-ink-soft space-y-0.5">
                                {PERMISSIONS.filter(p => s.permissions.includes(p.key)).map(p => <li key={p.key}>{p.group} · {p.label}{p.movesMoney ? ' (moves money)' : ''}</li>)}
                              </ul>
                            </details>
                          </div>
                          <button
                            onClick={() => resendSetup(s.id, s.name)}
                            disabled={resendingId === s.id}
                            title="Email this person a fresh dashboard login"
                            className="shrink-0 text-[11px] font-medium text-pine hover:text-pine-hover px-2 py-1 rounded-md border border-pine/20 hover:bg-pine/5 transition-colors disabled:opacity-50"
                          >
                            {resendingId === s.id ? 'Sending…' : 'Resend login'}
                          </button>
                        </div>
                      ))}
                    </div>
                    {resendMsg && (
                      <p className={'text-xs mt-3 ' + (resendMsg.startsWith('Error') ? 'text-bad' : 'text-ok')}>{resendMsg}</p>
                    )}
                  </Card>
                )}
              </div>
            </div>
            );
          })();
}
