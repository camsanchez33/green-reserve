'use client';

// MP-12 (ADMIN_V4 V4-9): split out of admin/courses/[id]/page.tsx, which had
// grown to 2,700 lines and 52 useState in one component. Moved verbatim; state
// and handlers come from useCourseDetail() via useCourse().

import { Calendar, Ban, Plus, X, Trash2, Pencil } from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import { formatMoney as fmtMoney } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { DAYS, ScheduleFields } from './shared';
import { useCourse } from './context';

export function OperateTab() {
  const { detail, setupForm, sched, schedules, newSchedule, setNewSchedule, showAddSched, setShowAddSched, schedSaving, schedMsg, setSchedMsg, editSched, setEditSched, editSaving, editError, setEditError, tsDate, setTsDate, ts, tsSlots, tsLoading, slotBusy, opNote, setOpNote, setManualSlot, setManualError, membersData, membersError, setSchedDeleteTarget, setSchedDeleteError, membersLoading, loadSchedules, loadTeeSheet, loadMembers, addSchedule, beginScheduleEdit, saveScheduleEdit, blockSlot, cancelBooking } = useCourse();
  return (
            <div className="max-w-3xl space-y-6">

              {/* Tee sheet */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Calendar className="w-4 h-4 text-ink-muted" />
                  <input
                    type="date"
                    value={tsDate}
                    onChange={e => { setTsDate(e.target.value); loadTeeSheet(e.target.value); }}
                    className="bg-white border border-line text-ink rounded-md px-3 py-1.5 text-sm outline-none focus:border-pine/40"
                  />
                  {!tsLoading && (
                    <span className="text-xs text-ink-muted">
                      {tsSlots.length} slots · {tsSlots.filter(s => s.bookings.length > 0).length} booked
                    </span>
                  )}
                </div>

                {opNote && (
                  <div className={'mb-3 text-sm font-medium px-4 py-2.5 rounded-md border flex items-center justify-between gap-3 ' + (opNote.ok ? 'bg-ok/5 text-ok border-ok/20' : 'bg-bad/5 text-bad border-bad/20')}>
                    <span>{opNote.text}</span>
                    <button onClick={() => setOpNote(null)} className="text-ink-muted hover:text-ink transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {tsLoading && <div className="text-center text-ink-muted py-12 text-sm">Loading tee sheet...</div>}
                {!tsLoading && ts.error && (
                  <div className="text-center py-10 bg-white border border-bad/20 rounded-lg">
                    <div className="text-sm text-bad mb-2">{ts.error.msg}</div>
                    <button onClick={() => loadTeeSheet(tsDate)} className="text-xs font-medium text-ink-soft hover:text-ink px-3 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">Retry</button>
                  </div>
                )}
                {!tsLoading && !ts.error && tsSlots.length === 0 && (
                  <Card className="text-center text-ink-muted py-12 text-sm">
                    {schedules.length === 0
                      ? 'No tee times for this date — this course has no schedule yet. Add one below.'
                      : 'No tee times for this date'}
                  </Card>
                )}

                <div className="space-y-2">
                  {tsSlots.map(slot => {
                    const busy = slotBusy === slot.id;
                    return (
                    <div
                      key={slot.id}
                      className={'rounded-md border overflow-hidden ' + (slot.status === 'blocked' ? 'border-bad/20 bg-bad/5' : slot.bookings.length > 0 ? 'border-ok/20 bg-ok/5' : 'border-line bg-white') + (busy ? ' opacity-60' : '')}
                    >
                      <div className="px-4 py-3 flex items-center gap-3">
                        <span className="font-mono font-medium text-ink text-sm w-14 shrink-0">{slot.time}</span>
                        <span className="text-xs text-ink-muted">{slot.product?.label ? `${slot.product.label} · ` : ''}{slot.holes}h · ${slot.greenFee}</span>
                        <StatusDot status={slot.status === 'blocked' ? 'bad' : slot.bookings.length > 0 ? 'ok' : 'neutral'}
                          label={slot.status === 'blocked' ? 'Blocked' : slot.bookings.length > 0 ? `${slot.bookings.length} booked` : `${slot.playersAvailable} open`}/>
                        <div className="ml-auto flex items-center gap-1.5">
                          <button
                            onClick={() => { setManualError(''); setManualSlot(slot.id); }}
                            disabled={busy || slot.status === 'blocked'}
                            className="text-xs px-2.5 py-1 bg-pine hover:bg-pine-hover text-white rounded-md flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            <Plus className="w-3 h-3" />Add
                          </button>
                          <button
                            onClick={() => blockSlot(slot.id, slot.status !== 'blocked')}
                            disabled={busy}
                            className={'text-xs px-2.5 py-1 rounded-md flex items-center gap-1 border transition-colors disabled:opacity-50 ' + (slot.status === 'blocked' ? 'border-ok/20 text-ok bg-ok/5 hover:bg-ok/10' : 'border-bad/20 text-bad bg-bad/5 hover:bg-bad/10')}
                          >
                            <Ban className="w-3 h-3" />{busy ? 'Working…' : slot.status === 'blocked' ? 'Unblock' : 'Block'}
                          </button>
                        </div>
                      </div>
                      {slot.bookings.length > 0 && (
                        <div className="border-t border-line/50 px-4 py-2 space-y-2">
                          {slot.bookings.map(b => (
                            <div key={b.id} className="flex items-center justify-between py-0.5">
                              <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-xs shrink-0">{b.golferName[0]}</div>
                                <div>
                                  <div className="font-medium text-ink text-xs">
                                    {b.golferName} <span className="text-ink-muted font-normal">· {b.players}p</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <a href={'mailto:' + b.golferEmail} className="text-xs text-pine hover:underline">{b.golferEmail}</a>
                                    {b.golferPhone && <span className="text-xs text-ink-muted">{b.golferPhone}</span>}
                                    {b.paymentStatus === 'manual' && (
                                      <StatusDot status="warn" label="Manual"/>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-medium text-ok">{fmtMoney(b.totalAmount / 100)}</span>
                                <button
                                  onClick={() => cancelBooking(b.id, slot.id)}
                                  disabled={busy}
                                  className="text-xs text-bad hover:text-bad/80 px-2 py-0.5 border border-bad/20 rounded-md hover:bg-bad/5 transition-colors disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>

              {/* Schedules — with EDIT. The PATCH endpoint had existed with no
                  UI caller, so fixing a fee typo meant delete + recreate, which
                  rebuilt the whole sheet. */}
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <Eyebrow>Tee time schedules</Eyebrow>
                  {!showAddSched && !editSched && (
                    <button
                      onClick={() => { setSchedMsg(null); setShowAddSched(true); }}
                      className="flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-hover transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />Add schedule
                    </button>
                  )}
                </div>

                {schedMsg && (
                  <div className={'text-sm font-medium px-4 py-2.5 rounded-md border flex items-center justify-between gap-3 ' + (schedMsg.ok ? 'bg-ok/5 text-ok border-ok/20' : 'bg-bad/5 text-bad border-bad/20')}>
                    <span>{schedMsg.text}</span>
                    <button onClick={() => setSchedMsg(null)} className="text-ink-muted hover:text-ink transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {sched.error && (
                  <div className="text-sm text-bad flex items-center justify-between gap-3">
                    <span>{sched.error.msg}</span>
                    <button onClick={loadSchedules} className="text-xs font-medium text-ink-soft hover:text-ink px-3 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">Retry</button>
                  </div>
                )}
                {schedules.length > 0 ? (
                  <div className="space-y-2">
                    {schedules.map(s => editSched?.id === s.id ? (
                      <div key={s.id} className="bg-paper border border-pine/30 rounded-md p-4 space-y-3">
                        <div className="text-[11px] uppercase tracking-[0.1em] text-pine">Editing schedule</div>
                        <ScheduleFields products={(detail?.layout?.products ?? []).filter(p => p.active)}
                          value={editSched.form}
                          onChange={p => setEditSched(e => e ? { ...e, form: { ...e.form, ...p } } : e)}
                          showMemberRates={!!setupForm.hasMemberPricing}
                        />
                        {editError && <p className="text-xs text-bad">{editError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditSched(null); setEditError(''); }}
                            className="flex-1 border border-line text-ink-soft py-2 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveScheduleEdit}
                            disabled={editSaving}
                            className="flex-1 bg-pine hover:bg-pine-hover disabled:opacity-50 text-white py-2 rounded-md text-[12.5px] font-medium transition-colors"
                          >
                            {editSaving ? 'Saving…' : 'Save & rebuild tee sheet'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div key={s.id} className={'flex items-center justify-between bg-paper border border-line rounded-md px-4 py-3' + (s.active ? '' : ' opacity-60')}>
                        <div className="min-w-0">
                          <div className="font-medium text-ink text-sm flex items-center gap-2 flex-wrap">
                            <span>{s.daysOfWeek.length === 0 ? 'Every day' : s.daysOfWeek.map(d => DAYS[d]).join(', ')} · {s.startTime}–{s.endTime} every {s.intervalMinutes}min</span>
                            {!s.active && <StatusDot status="neutral" label="Paused by course" />}
                          </div>
                          <div className="text-ink-muted text-xs mt-0.5">
                            WD ${s.greenFeeWeekday} / WE ${s.greenFeeWeekend} · Cart ${s.cartFee}
                            {s.memberRateWeekday != null && ` · Member $${s.memberRateWeekday}`}
                            {s.walkingAllowed ? ' · Walking' : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => beginScheduleEdit(s)}
                            disabled={!!editSched}
                            title="Edit schedule"
                            className="text-ink-muted hover:text-pine transition-colors p-1.5 rounded-md hover:bg-pine/5 disabled:opacity-40"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setSchedDeleteError(''); setSchedDeleteTarget(s.id); }}
                            title="Delete schedule"
                            className="text-ink-muted hover:text-bad transition-colors p-1.5 rounded-md hover:bg-bad/5"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted bg-paper rounded-md p-4 border border-line">
                    No schedule yet — add one to make this course bookable.
                  </p>
                )}

                {showAddSched && (
                  <div className="border-t border-line pt-4 space-y-3">
                    <Eyebrow>Add schedule</Eyebrow>
                    <ScheduleFields products={(detail?.layout?.products ?? []).filter(p => p.active)}
                      value={newSchedule}
                      onChange={p => setNewSchedule(s => ({ ...s, ...p }))}
                      showMemberRates={!!setupForm.hasMemberPricing}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowAddSched(false)}
                        className="flex-1 border border-line text-ink-soft py-2.5 rounded-md text-[12.5px] font-medium hover:border-line-strong transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={addSchedule}
                        disabled={schedSaving}
                        className="flex-1 bg-pine hover:bg-pine-hover disabled:opacity-50 text-white py-2.5 rounded-md text-[12.5px] font-medium transition-colors"
                      >
                        {schedSaving ? 'Saving...' : 'Save Schedule & Generate Tee Times'}
                      </button>
                    </div>
                  </div>
                )}
              </Card>

              {/* Members — read-only. The course runs its own programme from
                  the dashboard; this is a window onto it, not a control. */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-1">
                  <Eyebrow>Members</Eyebrow>
                  <span className="text-[11px] text-ink-faint">Read-only — the course manages this</span>
                </div>
                {membersLoading && <div className="text-center text-ink-muted py-8 text-sm">Loading...</div>}
                {!membersLoading && membersError && (
                  <div className="rounded-md border border-bad/20 bg-bad/5 px-4 py-4 text-center mt-3">
                    <p className="text-sm text-bad mb-2">{membersError}</p>
                    <button onClick={() => loadMembers()} className="text-xs font-medium text-ink-soft hover:text-ink px-3 py-1.5 rounded-md border border-line hover:border-line-strong transition-colors">Retry</button>
                  </div>
                )}
                {!membersLoading && !membersError && membersData && (
                  membersData.tiers.length === 0 && membersData.members.length === 0 ? (
                    <p className="text-sm text-ink-muted mt-2">No membership programme set up.</p>
                  ) : (
                    <div className="space-y-4 mt-3">
                      {membersData.tiers.length > 0 && (
                        <div className="border border-line rounded-md divide-y divide-line-soft">
                          {membersData.tiers.map(t => (
                            <div key={t.id} className="flex items-center gap-4 px-4 py-2.5">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-ink text-sm">{t.name}</div>
                                <div className="text-xs text-ink-muted">{t.memberCount} active member{t.memberCount !== 1 ? 's' : ''} · ${t.annualFee}/yr</div>
                              </div>
                              <StatusDot status={t.active ? 'ok' : 'neutral'} label={t.active ? 'Active' : 'Inactive'} />
                            </div>
                          ))}
                        </div>
                      )}
                      <div>
                        <Eyebrow className="mb-2">
                          {membersData.members.length} member{membersData.members.length === 1 ? '' : 's'}
                        </Eyebrow>
                        {membersData.members.length === 0 ? (
                          <p className="text-sm text-ink-muted">No members yet.</p>
                        ) : (
                          <div className="border border-line rounded-md divide-y divide-line-soft">
                            {membersData.members.map(m => {
                              const name = m.golfer ? `${m.golfer.firstName} ${m.golfer.lastName}` : (m.inviteName || '—');
                              const email = m.golfer?.email || m.inviteEmail || '';
                              return (
                                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                                  <div className="w-7 h-7 rounded bg-pine/10 flex items-center justify-center text-pine font-medium text-xs shrink-0">{name[0] || '?'}</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-ink text-sm truncate">{name}</div>
                                    <div className="text-xs text-ink-muted truncate">{email}{m.tierName ? ` · ${m.tierName}` : ''}</div>
                                  </div>
                                  <div className="flex flex-col items-end gap-0.5">
                                    <StatusDot status={m.status === 'active' ? 'ok' : 'neutral'} label={m.status} />
                                    <span className="text-[10px] text-ink-faint capitalize">{m.paymentStatus.replace('_', ' ')}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
              </Card>
            </div>
          );
}
