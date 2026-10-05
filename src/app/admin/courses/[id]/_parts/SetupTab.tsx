'use client';

// MP-12 (ADMIN_V4 V4-9): split out of admin/courses/[id]/page.tsx, which had
// grown to 2,700 lines and 52 useState in one component. Moved verbatim; state
// and handlers come from useCourseDetail() via useCourse().

import { Pause } from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import { formatDate as fmtDate } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { iCls, onboardingSteps } from './shared';
import { useCourse } from './context';

export function SetupTab() {
  const { detail, setupForm, setSetupForm, setupSaving, setupMsg, remindersBusy, remindersError, toggleRemindersPaused, saveSetup, c } = useCourse();
  return (() => {
            const steps = onboardingSteps(detail);
            const events = detail.timeline ?? [];
            const reminderEvents = events.filter(e => e.type === 'reminder_sent');
            return (
            <div className="space-y-5 max-w-3xl">
              <div className="bg-warn/5 border border-warn/20 rounded-md px-4 py-3 text-xs text-warn">
                You&apos;re editing live settings directly. The operator can still adjust their own dashboard, and every change here is logged to their timeline.
              </div>

              {/* 4a — onboarding checklist as named steps */}
              <Card className="p-6">
                <Eyebrow className="mb-4">Onboarding checklist</Eyebrow>
                <div className="space-y-3">
                  {steps.map(s => {
                    // AGREEMENT = GO-LIVE GATE item 3 — a live course missing
                    // acceptance is a legacy gap, not normal in-progress work.
                    const legacyGap = s.key === 'agreement_accepted' && !s.done && c.active;
                    return (
                      <div key={s.key} className="flex items-center gap-3">
                        {s.done
                          ? <StatusDot status="ok" />
                          : <span className={'w-4 h-4 rounded-full border shrink-0 ' + (legacyGap ? 'border-warn bg-warn/10' : 'border-line-strong')} />}
                        <span className={'text-sm flex-1 ' + (s.done ? 'text-ink' : legacyGap ? 'text-warn font-medium' : 'text-ink-muted')}>
                          {s.label}{legacyGap ? ' — legacy' : ''}
                        </span>
                        {s.at && <span className="text-xs text-ink-faint">{fmtDate(s.at)}</span>}
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* 4b — auto-chase reminders */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <Eyebrow>Auto-chase reminders</Eyebrow>
                  <button
                    onClick={() => toggleRemindersPaused(!detail.remindersPaused)}
                    disabled={remindersBusy || detail.timeline === null}
                    className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-50 ' + (detail.remindersPaused ? 'bg-ok/5 text-ok border-ok/20 hover:bg-ok/10' : 'bg-paper text-ink-soft border-line hover:text-warn hover:border-warn/30')}
                  >
                    
                    {detail.remindersPaused ? 'Resume reminders' : 'Pause reminders'}
                  </button>
                </div>
                <p className="text-sm text-ink-soft mb-3">
                  Emails at 3, 7, and 14 days after the course record is created, then weekly, until the course goes live. Stops instantly once live.
                </p>
                {remindersError && <p className="text-xs text-bad mb-3">{remindersError}</p>}
                {detail.timeline === null ? (
                  <p className="text-xs text-ink-soft">No linked inquiry — reminders can&apos;t be tracked for this course.</p>
                ) : reminderEvents.length === 0 ? (
                  <p className="text-xs text-ink-soft">No reminders sent yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {reminderEvents.slice(0, 5).map((e, i) => (
                      <li key={i} className="text-xs text-ink-soft">Reminder sent {fmtDate(e.at)} · {String((e.data as { step?: string }).step ?? '')}</li>
                    ))}
                  </ul>
                )}
              </Card>

              {setupMsg && (
                <div className={'text-sm font-medium px-4 py-2.5 rounded-md border ' + (setupMsg === 'error' ? 'bg-bad/5 text-bad border-bad/20' : 'bg-ok/5 text-ok border-ok/20')}>
                  {setupMsg === 'error' ? 'Error saving' : 'Settings saved'}
                </div>
              )}

              {/* 4c — full mirror of operator settings, same endpoint/whitelist the operator's own Settings page uses */}
              <Card className="p-6 space-y-4">
                <Eyebrow>Course policy</Eyebrow>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block"><Eyebrow as="span" className="block mb-1.5">Walking policy</Eyebrow>
                    <select
                      value={String(setupForm.walkingAllowed ?? 'always')}
                      onChange={e => setSetupForm(f => ({ ...f, walkingAllowed: e.target.value }))}
                      className={iCls}
                    >
                      <option value="always">Always allowed</option>
                      <option value="weekdays">Weekdays only</option>
                      <option value="after12">After 12pm only</option>
                      <option value="never">Cart required</option>
                    </select></label>
                  </div>
                  <div>
                    <label className="block"><Eyebrow as="span" className="block mb-1.5">Cancellation window (hrs)</Eyebrow>
                    <input
                      type="number"
                      value={Number(setupForm.cancellationHours ?? 24)}
                      onChange={e => setSetupForm(f => ({ ...f, cancellationHours: Number(e.target.value) }))}
                      className={iCls}
                    /></label>
                  </div>
                  <div>
                    <label className="block"><Eyebrow as="span" className="block mb-1.5">Min players</Eyebrow>
                    <input
                      type="number"
                      value={Number(setupForm.minPlayers ?? 1)}
                      onChange={e => setSetupForm(f => ({ ...f, minPlayers: Number(e.target.value) }))}
                      className={iCls}
                    /></label>
                  </div>
                  <div>
                    <label className="block"><Eyebrow as="span" className="block mb-1.5">Max players</Eyebrow>
                    <input
                      type="number"
                      value={Number(setupForm.maxPlayers ?? 4)}
                      onChange={e => setSetupForm(f => ({ ...f, maxPlayers: Number(e.target.value) }))}
                      className={iCls}
                    /></label>
                  </div>
                  <div>
                    <label className="block"><Eyebrow as="span" className="block mb-1.5">Public booking window (days)</Eyebrow>
                    <input
                      type="number"
                      value={Number(setupForm.publicAdvanceDays ?? 7)}
                      onChange={e => setSetupForm(f => ({ ...f, publicAdvanceDays: Number(e.target.value) }))}
                      className={iCls}
                    /></label>
                  </div>
                  <div>
                    <label className="block"><Eyebrow as="span" className="block mb-1.5">Member booking window (days)</Eyebrow>
                    <input
                      type="number"
                      value={Number(setupForm.memberAdvanceDays ?? 14)}
                      onChange={e => setSetupForm(f => ({ ...f, memberAdvanceDays: Number(e.target.value) }))}
                      className={iCls}
                    /></label>
                  </div>
                </div>
                <div>
                  <label className="block"><Eyebrow as="span" className="block mb-1.5">Rain check policy</Eyebrow>
                  <input
                    value={String(setupForm.rainCheckPolicy ?? '')}
                    onChange={e => setSetupForm(f => ({ ...f, rainCheckPolicy: e.target.value }))}
                    className={iCls}
                  /></label>
                </div>
                <div className="flex flex-wrap gap-4">
                  {([
                    ['hasMemberPricing', 'Member pricing'],
                    ['hasResidentPricing', 'Resident pricing'],
                    ['hasCaddies', 'Caddies'],
                    ['cartRequired', 'Cart required'],
                  ] as [string, string][]).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!setupForm[k]}
                        onChange={e => setSetupForm(f => ({ ...f, [k]: e.target.checked }))}
                        className="w-4 h-4 accent-pine rounded"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {!!setupForm.hasResidentPricing && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block"><Eyebrow as="span" className="block mb-1.5">Resident county</Eyebrow>
                      <input
                        value={String(setupForm.residentCounty ?? '')}
                        onChange={e => setSetupForm(f => ({ ...f, residentCounty: e.target.value }))}
                        className={iCls}
                      /></label>
                    </div>
                    <div>
                      <label className="block"><Eyebrow as="span" className="block mb-1.5">Resident state</Eyebrow>
                      <input
                        value={String(setupForm.residentState ?? '')}
                        maxLength={2}
                        onChange={e => setSetupForm(f => ({ ...f, residentState: e.target.value }))}
                        className={iCls}
                      /></label>
                    </div>
                  </div>
                )}
              </Card>

              {/* COURSE_LAYOUT L3: the layout the sheet's answers became. Read-only
                  here — the operator configures it on their Course & Layout tab. */}
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <Eyebrow>Course layout</Eyebrow>
                  {detail.layout && <span className="text-[11px] text-ink-faint">{detail.layout.configured ? `${detail.layout.nines.length} nine${detail.layout.nines.length === 1 ? '' : 's'} · ${detail.layout.products.filter(x => x.active).length} bookable product${detail.layout.products.filter(x => x.active).length === 1 ? '' : 's'}` : 'simple layout'}</span>}
                </div>
                {!detail.layout || !detail.layout.configured ? (
                  <p className="text-sm text-ink-soft">
                    No named nines or products configured — golfers book the course as one {Number(setupForm.holes ?? 18)}-hole layout at the rates on its schedule. Multi-nine courses configure combos on their dashboard&apos;s Course &amp; Layout tab.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <div className="text-[13px] font-semibold text-ink mb-1.5">Nines</div>
                      <div className="flex flex-wrap gap-2">
                        {detail.layout.nines.map(n => <span key={n.id} className="text-xs text-ink bg-paper border border-line rounded-md px-2 py-1">{n.name} <span className="text-ink-muted">· par {n.par}</span></span>)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-ink mb-1.5">Products golfers can book</div>
                      <div className="border border-line rounded-md divide-y divide-line-soft">
                        {detail.layout.products.map(pr => (
                          <div key={pr.id} className={'px-3 py-2 ' + (pr.active ? '' : 'opacity-60')}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm text-ink font-medium">{pr.label} <span className="text-xs text-ink-muted font-normal">· {pr.holes} holes · {pr.nines.join(' + ') || 'no nines'}</span></span>
                              <StatusDot status={pr.active ? 'ok' : 'neutral'} label={pr.active ? 'Bookable' : 'Off'} />
                            </div>
                            {pr.ratings.length > 0 && (
                              <div className="text-[11px] text-ink-muted mt-0.5">{pr.ratings.map(r => `${r.teeSet}: ${r.rating}/${r.slope}`).join(' · ')}</div>
                            )}
                          </div>
                        ))}
                        {detail.layout.products.length === 0 && <div className="px-3 py-2 text-xs text-ink-muted">Nines are named but no product has been built from them yet — nothing multi-nine is bookable.</div>}
                      </div>
                    </div>
                    {detail.layout.teeSets.length > 0 && (
                      <div>
                        <div className="text-[13px] font-semibold text-ink mb-1.5">Tee sets</div>
                        <div className="text-xs text-ink-soft space-y-0.5">
                          {detail.layout.teeSets.map(t => (
                            <div key={t.id}>{t.name} — {t.yardage ? `${t.yardage}y` : 'no yardage'}{t.rating ? ` · ${t.rating}/${t.slope}` : ''}{t.perNine.length > 0 ? ` · ${t.perNine.map(y => `${y.nine} ${y.yardage}y`).join(', ')}` : ''}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              <Card className="p-6 space-y-4">
                <Eyebrow>Facilities & Amenities</Eyebrow>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                  {([
                    ['hasDrivingRange', 'Driving range'],
                    ['hasPuttingGreen', 'Putting green'],
                    ['hasShortGameArea', 'Short game area'],
                    ['hasProShop', 'Pro shop'],
                    ['hasCartGirl', 'Beverage cart'],
                    ['hasLessons', 'Lessons'],
                    ['hasClubRental', 'Club rental'],
                    ['hasPushCartRental', 'Push cart rental'],
                    ['hasBagStorage', 'Bag storage'],
                    ['hasLockerRoom', 'Locker room'],
                    ['hasGpsCarts', 'GPS carts'],
                    ['hasTournaments', 'Hosts tournaments'],
                  ] as [string, string][]).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!setupForm[k]}
                        onChange={e => setSetupForm(f => ({ ...f, [k]: e.target.checked }))}
                        className="w-4 h-4 accent-pine rounded"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </Card>

              <button
                onClick={saveSetup}
                disabled={setupSaving}
                className="bg-pine hover:bg-pine-hover disabled:opacity-50 text-white px-5 py-2.5 rounded-md text-[12.5px] font-medium transition-colors"
              >
                {setupSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
            );
          })();
}
