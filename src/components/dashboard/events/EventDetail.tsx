'use client';
// W2-9 Events: one event. EVENTS-3 (Cam 2026-11-17, "events is good"; lanes/dashboard.md item 3, mockup
// lanes/dashboard/events-mockup.html) lays it out as the approved page: the name with a pencil (Change details) and
// Cancel event, four numbers (Registered, Collected, Event day, Set up), then tabs — Overview · Players · Sign-up ·
// Payments — with the Checklist beside them (above them on a phone).
// The checklist is the steps from saved to played, done or not from the event's own state (eventNextSteps, never a
// guess), each opening to say what it is and how, then the course's own steps (its tasks), which it adds, edits,
// ticks and removes.
// Wired to today's data only. Hidden until Build returns the field (agreed shape in the PR): the event-day timeline,
// the food count, staff notes as a list, terms presets, reminders. Every write shows its pending state and then the
// result or the server's reason (dfetch never throws). Every tab stays mounted (only hidden), so a half-typed pop-up
// or the pairings print survive a tab change.
import React, { useEffect, useState } from 'react';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { shotgunLabels, groupStartTime } from '@/lib/event-shared';
import { StatusDot } from '@/components/ui/StatusDot';
import { dfetch } from '@/lib/dashboard-fetch';
import { formatTeeDay, formatTeeTime } from '@/lib/format';
import { eventNextSteps, coveredCount, type EventStep, type EventStepKey } from '@/lib/event-command';
import { SlidingTabs } from '@/components/dashboard/SlidingTabs';
import { Popup, PopupFoot, PenButton, PenIcon, ChevIcon, PlusButton, LINK, PRIMARY, DANGER, FIELD, LABEL } from '@/components/dashboard/schedule/ui';
import { formBody, toForm } from './EventSetup';
import EventMoney, { type EventPayment, type Money } from './EventMoney';
import EventSignup, { type SignupQuestion } from './EventSignup';
import EventPlayers from './EventPlayers';
import { EventDay } from './EventDay';
import { kindLabel, formatLine, longDay } from './EventsList';
import { Stats, Stat, StatNote, Bar, Section, KV, Fold, CheckIcon, MailIcon, PhoneIcon, ICON_BTN, usd, plural, daysUntil, inDays, RED_LINK } from './ui';

export type EventTask = { id: string; label: string; dueDate: string | null; doneAt: string | null; doneBy: string };
export type EventPlayer = {
  id: string; name: string; email: string; phone: string; groupNo: number | null; startHole: number | null;
  /** W2-9d: in = on the list; held = signed up online and paying (until holdUntil); waitlist; lapsed = the hold ran out unpaid. */
  status: string; holdUntil: string | null; source: string; groupKey: string; answers: Record<string, string>;
  /** Event day: when they were checked in; null = not here yet. */
  checkedInAt?: string | null;
};
export type EventFull = {
  id: string; name: string; kind: string; date: string; format: string; startTime: string; holdFrom: string; holdTo: string; holdToCustom: boolean; shareCourse: boolean; holdNineIds: string[]; keepOpen: string[];
  productId: string | null; holes: number; groups: number; players: number;
  organizerName: string; organizerEmail: string; organizerPhone: string; pricePerPlayerCents: number; includes: string[];
  terms: string; notes: string; status: string; tasks: EventTask[]; entrants: EventPlayer[]; payments: EventPayment[];
  signupOpen: boolean; signupPay: string; signupMaxGroup: number; signupQuestions: SignupQuestion[];
  /** Cam 2026-10-24: organizer | players; '' = made before the question (every tool shows). */
  payer: string;
  /** Organizer events: the guaranteed headcount (Cam 2026-10-24). */
  guaranteeDaysBefore: number | null; guaranteedPlayers: number | null; guaranteedAt: string | null;
};
export type EventData = {
  event: EventFull; today: string; courseHoles: number; money: Money; feeOn: boolean;
  /** The day the guaranteed headcount is due; null = not asked for. */
  guaranteeDue: string | null;
  signup: { url: string; questions: SignupQuestion[] };
  held: { id: string; time: string; round: string | null }[];
  toMove: { time: string; golfers: string }[]; blockedOther: number; unheld: string[];
};
type Tab = 'overview' | 'players' | 'signup' | 'money';

/** What each checklist step is and how it's done (the steps themselves come from eventNextSteps). */
const STEP_HELP: Record<Exclude<EventStepKey, 'checklist'>, [string, string]> = {
  hold: ['Blocks the event’s hours on your tee sheet so golfers can’t book them online.', 'Overview › On your tee sheet. If a group was already booked in the hours, move it on the tee sheet, then hold the open times.'],
  price: ['What each player’s spot costs: the round and whatever is included.', 'Change details › Who and what. It shows on the sign-up page and on the bill.'],
  deposit: ['The organizer’s first payment toward the bill.', 'Payments › Send a pay link for the deposit, or the plus to record one taken at the course.'],
  headcount: ['The final number of players from the organizer. It sets the balance.', 'Payments › Guaranteed headcount › Record it.'],
  list: ['The players’ names, so pairings and cart signs are ready.', 'Players › the plus. One per line: name, email, phone.'],
  signup: ['Players sign up (and pay, if they pay when they sign up) on a page with its own link.', 'Sign-up › the pencil. Open it, then copy the link and send it to the organizer or post it.'],
  paid: ['Every player on the list has paid.', 'Players › open a player to send their pay link, or mark them paid at the course.'],
  pairings: ['Every player on the list is in a group with a starting hole or tee time.', 'Players › Pair in list order keeps sign-ups that came together. The pencil on a group moves anyone.'],
};
const GO: Record<EventStep['tab'], string> = { overview: 'Go to Overview', players: 'Go to Players', signup: 'Go to Sign-up', money: 'Go to Payments', checklist: 'Go to Overview', edit: 'Open Change details' };

type TextEdit = { field: 'notes' | 'terms'; title: string; label: string; value: string };
type IncEdit = { i: number | null; value: string };
type TaskEdit = { id: string | null; label: string; dueDate: string };

export default function EventDetail({ data, onChange, onEdit, onBack, canRefund, reload }: {
  data: EventData; onChange: (d: EventData) => void; onEdit: () => void; onBack: () => void;
  canRefund: boolean; reload: () => Promise<void>;
}) {
  // Events audit 23: taking event money needs "Mark paid at the counter" (the payments route checks it too).
  const canRecord = useDashboardAccess().can('sheet.counter_payment');
  const { event: e, today, held, toMove, money } = data;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [showList, setShowList] = useState(true);
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [text, setText] = useState<TextEdit | null>(null);
  const [inc, setInc] = useState<IncEdit | null>(null);
  const [task, setTask] = useState<TaskEdit | null>(null);
  // Event day "Take payment" opens that player on the Players tab.
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);
  // …straight to "Paid at the course" for that player.
  const [payFor, setPayFor] = useState<string | null>(null);
  // Event day: what the next print shows — the pairings sheet or a cart sign per group.
  const [printWhat, setPrintWhat] = useState<'pairings' | 'signs'>('pairings');
  const printNow = (what: 'pairings' | 'signs') => { setPrintWhat(what); setTimeout(() => window.print(), 50); };
  useEffect(() => { const back = () => setPrintWhat('pairings'); window.addEventListener('afterprint', back); return () => window.removeEventListener('afterprint', back); }, []);

  const live = e.status === 'planned';
  const playersPay = e.payer !== 'organizer';
  const orgPays = e.payer === 'organizer';
  // W2-9d: only players on the list are paired, counted and asked to pay; a sign-up group's one payment covers each of them.
  const onList = e.entrants.filter(p => p.status === 'in');
  const notYet = e.entrants.filter(p => p.status !== 'in');
  const holding = e.entrants.filter(p => p.status === 'held' && p.holdUntil && new Date(p.holdUntil) > new Date()).length;
  const waiting = e.entrants.filter(p => p.status === 'waitlist').length;
  const theirs = (p: EventPlayer) => e.payments.filter(x => x.playerId === p.id || (!!p.groupKey && x.groupKey === p.groupKey));
  const stateOf = (p: EventPlayer): 'paid' | 'paying' | 'sent' | 'none' => {
    const ps = theirs(p);
    if (ps.some(x => x.status === 'paid' && x.amountCents > x.refundedCents)) return 'paid';
    if (ps.some(x => x.status === 'paying')) return 'paying';
    if (ps.some(x => x.status === 'open')) return 'sent';
    return 'none';
  };
  const groups = new Map<number, EventPlayer[]>();
  for (const p of onList) if (p.groupNo != null) groups.set(p.groupNo, [...(groups.get(p.groupNo) ?? []), p]);
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  const ungrouped = onList.filter(p => p.groupNo == null);
  const heldTimes = [...new Set(held.map(h => h.time))];
  // Revamp 3 fix 10: two groups on one hole read 1A / 1B; a group past the times held has none (never another group's).
  const holeLabel = shotgunLabels(sortedGroups.map(([g, ps]) => ({ groupNo: g, startHole: ps[0]?.startHole ?? null })));
  const startOf = (g: number, hole: number | null) => {
    if (e.format === 'shotgun') return `${formatTeeTime(e.startTime)}${hole ? `, hole ${holeLabel.get(g) ?? hole}` : ''}`;
    const t = groupStartTime(g, heldTimes);
    return t ? formatTeeTime(t) : 'No tee time held';
  };
  // EVENTS-1: the organizer's bill covers this many on the list, a full price each, in list order.
  const listOrder = [...onList].sort((a, b) => (a.groupNo ?? 1e9) - (b.groupNo ?? 1e9));
  const covered = orgPays ? coveredCount(money.keptCents, e.pricePerPlayerCents, onList.length) : 0;
  const coveredIds = new Set(listOrder.slice(0, covered).map(p => p.id));

  const open = e.tasks.filter(t => !t.doneAt);
  const overdue = open.filter(t => t.dueDate && t.dueDate < today);
  const steps = eventNextSteps({
    payer: e.payer, priceCents: e.pricePerPlayerCents, heldCount: held.length, toMove: toMove.length, unheld: data.unheld.length,
    onList: onList.length, ungrouped: ungrouped.length, unpaid: onList.filter(p => stateOf(p) !== 'paid').length, signupOpen: e.signupOpen, keptCents: money.keptCents,
    guaranteeDue: data.guaranteeDue ? formatTeeDay(data.guaranteeDue) : null, guaranteedAt: e.guaranteedAt,
    tasksOpen: open.length, tasksOverdue: overdue.length,
  }).filter(s => s.key !== 'checklist');
  const stepsDone = steps.filter(s => s.done).length + (e.tasks.length - open.length);
  const stepsAll = steps.length + e.tasks.length;
  const until = daysUntil(today, e.date);

  /** A write to the event (PATCH), then the page shows the new state. */
  async function act(key: string, body: Record<string, unknown>, done?: (r: EventData & Record<string, unknown>) => string) {
    setBusy(key); setError(''); setNote('');
    const r = await dfetch<EventData & Record<string, unknown>>(`/api/operator/events/${e.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    setBusy('');
    if (!r.ok) { setError(r.error); return false; }
    onChange(r.data);
    if (done) setNote(done(r.data));
    return true;
  }
  /** A payment action (the payments route), then refresh the event in place. */
  async function payAct(key: string, body: Record<string, unknown>, done?: (r: Record<string, unknown>) => string) {
    setBusy(key); setError(''); setNote('');
    const r = await dfetch<Record<string, unknown>>(`/api/operator/events/${e.id}/payments`, { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) { setBusy(''); setError(r.error); return false; }
    await reload();
    setBusy('');
    if (done) setNote(done(r.data ?? {}));
    return true;
  }
  /** A detail of the event changed in place: the same save as Change details, with everything else as it is. */
  const update = (key: string, patch: Record<string, unknown>, done: string) => act(key, { ...formBody(toForm(data)), ...patch, action: 'update' }, () => done);

  const goTo = (t: EventStep['tab']) => { if (t === 'edit') onEdit(); else setTab(t === 'checklist' ? 'overview' : t); };
  const message = (error || note) && <p role={error ? 'alert' : 'status'} className={'print:hidden text-[13.5px] ' + (error ? 'text-bad' : 'text-ink')}>{error || note}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <button type="button" onClick={onBack} className="text-[13px] font-semibold text-ink-soft hover:text-ink">‹ Events</button>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <div className="mr-auto min-w-0">
            <h1 className="font-serif text-[30px] font-semibold leading-none text-ink">{e.name}</h1>
            <p className="text-[12.5px] text-ink-muted mt-1.5">{kindLabel(e.kind)} · {longDay(e.date)} · {formatLine(e)}</p>
            {!live && <div className="mt-2"><StatusDot status="neutral" label="Cancelled. Its tee times went back on sale." /></div>}
          </div>
          {live && <>
            <button type="button" onClick={onEdit} aria-label="Change details" title="Change details" className={ICON_BTN}><PenIcon /></button>
            <button type="button" onClick={() => setCancelling(true)} className={RED_LINK}>Cancel event</button>
          </>}
        </div>
      </div>

      <div className="print:hidden">
        <Stats>
          <Stat label="Registered" value={e.players ? `${onList.length} of ${e.players}` : String(onList.length)}>
            {e.players > 0 && <Bar value={onList.length} of={e.players} />}
            <StatNote>{[e.players > 0 && `${Math.max(0, e.players - onList.length - holding)} spots left`, waiting > 0 && `${waiting} waiting`, !e.players && 'no player limit'].filter(Boolean).join(' · ')}</StatNote>
          </Stat>
          {e.pricePerPlayerCents > 0
            ? <Stat label="Collected" value={`${usd(money.keptCents)} of ${usd(money.keptCents + money.owedCents)}`}>
                <Bar value={money.keptCents} of={money.keptCents + money.owedCents} ok />
                <StatNote>{money.owedCents ? <span className={until <= 0 ? 'text-bad' : ''}>{usd(money.owedCents)} owed</span> : 'All paid'}</StatNote>
              </Stat>
            : <Stat label="Collected" value="—"><StatNote>No price yet</StatNote></Stat>}
          <Stat label="Event day" value={inDays(until)}><StatNote>{longDay(e.date)} · {formatTeeTime(e.startTime)}</StatNote></Stat>
          <Stat label="Set up" value={`${stepsDone} of ${stepsAll} steps`}>
            <Bar value={stepsDone} of={stepsAll} ok={stepsDone === stepsAll} />
            <StatNote>{overdue.length ? <span className="text-bad">{overdue.length} overdue</span> : 'none overdue'}</StatNote>
          </Stat>
        </Stats>
      </div>

      {message}

      {/* Event day (Cam 2026-10-31): on the event's date, who's here and who still owes, first. */}
      {live && e.date === today && onList.length > 0 && (
        <EventDay groups={sortedGroups} ungrouped={ungrouped} startOf={startOf} onList={onList} busy={busy}
          owes={p => playersPay && stateOf(p) !== 'paid' && stateOf(p) !== 'paying'}
          onCheck={(ids, on, key) => { act(key, { action: 'checkin', playerIds: ids, on }); }}
          onTakePayment={canRecord ? p => { setTab('players'); setOpenPlayer(p.id); setPayFor(p.id); } : undefined}
          onPrintSigns={() => printNow('signs')} />
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-[22px] items-start mt-1">
        <section className="min-w-0 flex flex-col">
          <div className="print:hidden">
            <SlidingTabs<Tab> value={tab} onChange={setTab} label="Event"
              tabs={[['overview', 'Overview'], ['players', 'Players'], ['signup', 'Sign-up'], ['money', 'Payments']]} />
          </div>

          <div className={'print:hidden ' + (tab === 'overview' ? '' : 'hidden')}>
            <Section title="On your tee sheet">
              <KV k="Held">
                {held.length === 0 && live
                  ? `No tee times held yet${toMove.length ? '' : '. They’re held as the day’s tee times are made'}`
                  : `${formatTeeTime(e.holdFrom)} to ${formatTeeTime(e.holdTo)}${held.length ? ` · ${plural(held.length, 'tee time')}` : ''}`}
              </KV>
              <KV k="Golfers">{e.shareCourse
                ? `Shares the course${e.holdNineIds.length ? ': only the holes chosen for it are held' : ''}.${e.keepOpen.length ? ` Kept open: ${e.keepOpen.map(formatTeeTime).join(', ')}.` : ''}`
                : 'Can’t book these times online. They go back on sale if the event is cancelled.'}</KV>
              {(toMove.length > 0 || data.unheld.length > 0) && live && (
                <div className="mx-1 my-2 border-l-[3px] border-warn pl-3 text-[13.5px] text-ink">
                  {toMove.length > 0 && <>
                    <p>{plural(toMove.length, 'booked time')} in the hours {toMove.length === 1 ? 'isn’t' : 'aren’t'} held. Move these groups on the tee sheet, then hold the open times:</p>
                    <ul className="mt-1 text-ink-soft">{toMove.map(b => <li key={b.time}>{formatTeeTime(b.time)}: {b.golfers}</li>)}</ul>
                  </>}
                  {data.unheld.length > 0 && <p className={toMove.length ? 'mt-2' : ''}>{data.unheld.map(formatTeeTime).join(', ')} {data.unheld.length === 1 ? 'is' : 'are'} open in the hours and golfers can book {data.unheld.length === 1 ? 'it' : 'them'}.</p>}
                  <button type="button" disabled={!!busy} className={LINK + ' mt-2'} onClick={() => act('rehold', { action: 'rehold' }, r => {
                    const h = (r.hold as { held: number } | undefined)?.held ?? 0;
                    return h ? `Held ${plural(h, 'more tee time')}.` : 'Nothing new to hold. Those times are still booked.';
                  })}>{busy === 'rehold' ? 'Holding…' : 'Hold the open times'}</button>
                </div>
              )}
              {data.blockedOther > 0 && <KV k="Another event">{plural(data.blockedOther, 'time')} in these hours {data.blockedOther === 1 ? 'is' : 'are'} held by another event.</KV>}
            </Section>

            <Section title="Organizer">
              <KV k="Contact">{e.organizerName || 'Not set yet'}</KV>
              {(e.organizerEmail || e.organizerPhone) && (
                <KV k="Reach them">
                  <span className="flex flex-wrap items-center gap-2">
                    {e.organizerEmail && <a className={ICON_BTN} href={`mailto:${e.organizerEmail}`} aria-label={`Email ${e.organizerEmail}`} title={e.organizerEmail}><MailIcon /></a>}
                    {e.organizerPhone && <a className={ICON_BTN} href={`tel:${e.organizerPhone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${e.organizerPhone}`} title={e.organizerPhone}><PhoneIcon /></a>}
                    <span className="text-[12.5px] text-ink-soft font-normal break-all">{[e.organizerEmail, e.organizerPhone].filter(Boolean).join(' · ')}</span>
                  </span>
                </KV>
              )}
            </Section>

            <Section title="What they bought">
              <KV k="Price">{e.pricePerPlayerCents ? `${usd(e.pricePerPlayerCents)} per player` : 'Not set yet'}</KV>
              <KV k="Who pays">{orgPays ? 'The organizer, one bill (deposit, then the balance)' : e.payer === 'players' ? 'Each player, on the sign-up page' : 'Not chosen yet'}</KV>
              {orgPays && data.guaranteeDue && <KV k="Final headcount">{e.guaranteedPlayers != null ? `${e.guaranteedPlayers} players, confirmed` : `Due ${formatTeeDay(data.guaranteeDue)}`}</KV>}
            </Section>

            <Section title="Included" plus={live ? { label: 'Add an included item', onClick: () => setInc({ i: null, value: '' }) } : undefined}>
              {e.includes.length === 0 ? <p className="px-1 py-1 text-[13.5px] text-ink-muted">Nothing yet.</p>
                : e.includes.map((x, i) => <KV key={x + i} onEdit={live ? () => setInc({ i, value: x }) : undefined} editLabel={`Edit ${x}`}>{x}</KV>)}
            </Section>

            <Section title="Notes for staff" plus={live && !e.notes ? { label: 'Add a note', onClick: () => setText({ field: 'notes', title: 'Notes for staff', label: 'Note', value: '' }) } : undefined}>
              {e.notes
                ? <KV onEdit={live ? () => setText({ field: 'notes', title: 'Notes for staff', label: 'Note', value: e.notes }) : undefined} editLabel="Edit the note"><span className="whitespace-pre-line font-normal">{e.notes}</span></KV>
                : <p className="px-1 py-1 text-[13.5px] text-ink-muted">None. Staff see what you add here on this page.</p>}
            </Section>
          </div>

          <div className={'print:hidden ' + (tab === 'signup' ? '' : 'hidden')}>
            <EventSignup live={live} payer={e.payer} url={data.signup.url} priceSet={e.pricePerPlayerCents > 0} capacity={e.players}
              spotsLeft={e.players > 0 ? Math.max(0, e.players - onList.length - holding) : null} waiting={notYet} busy={busy} includes={e.includes} priceCents={e.pricePerPlayerCents}
              settings={{ signupOpen: e.signupOpen, signupPay: e.signupPay, signupMaxGroup: e.signupMaxGroup, signupQuestions: data.signup.questions }}
              terms={e.terms} error={error} onEditTerms={live ? () => setText({ field: 'terms', title: 'Event terms', label: orgPays ? 'Deposit and refund terms' : 'Refund terms', value: e.terms }) : undefined}
              act={(key, body, done) => act(key, body, done ? r => done(r) : undefined)} />
          </div>

          <div className={'print:hidden ' + (tab === 'money' ? '' : 'hidden')}>
            <EventMoney eventId={e.id} live={live} pricePerPlayerCents={e.pricePerPlayerCents} money={money} payments={e.payments} canRefund={canRefund} reload={reload}
              guarantee={e.payer === 'players' ? null : { due: data.guaranteeDue, players: e.guaranteedPlayers, at: e.guaranteedAt, today, onList: onList.length }}
              organizer={{ name: e.organizerName, email: e.organizerEmail, phone: e.organizerPhone }} />
          </div>

          {/* Printing (pairings or cart signs) prints this part from any tab. */}
          <div className={tab === 'players' ? '' : 'hidden print:block'}>
            <EventPlayers data={data} live={live} busy={busy} act={act} payAct={payAct} canRecord={canRecord} setError={setError}
              onList={onList} sortedGroups={sortedGroups} ungrouped={ungrouped} startOf={startOf} stateOf={stateOf} theirs={theirs}
              coveredIds={orgPays && e.pricePerPlayerCents > 0 ? coveredIds : null} printWhat={printWhat} printNow={printNow}
              openPlayer={openPlayer} setOpenPlayer={setOpenPlayer} payFor={payFor} clearPayFor={() => setPayFor(null)} />
          </div>
        </section>

        <aside className="print:hidden max-lg:order-first border border-line rounded-[14px] px-1.5 pt-1 pb-2 lg:sticky lg:top-4">
          <div className="flex items-center gap-1">
            <Fold top open={showList} onToggle={() => setShowList(v => !v)}>Checklist · {stepsDone} of {stepsAll}</Fold>
            {live && <PlusButton label="Add a checklist step" onClick={() => setTask({ id: null, label: '', dueDate: '' })} />}
          </div>
          {showList && <>
            {steps.map(s => {
              const isOpen = openStep === s.key;
              const help = STEP_HELP[s.key as Exclude<EventStepKey, 'checklist'>];
              return (
                <div key={s.key} className="border-t border-line">
                  <button type="button" onClick={() => setOpenStep(isOpen ? null : s.key)} aria-expanded={isOpen}
                    className="w-full flex items-center gap-2.5 text-left px-2 py-2.5 min-h-[44px]">
                    <Box done={s.done} />
                    <span className="flex-1 min-w-0">
                      <b className={'block text-[13px] font-medium ' + (s.done ? 'text-ink-muted' : 'text-ink')}>{s.label}</b>
                      <small className="block text-[12px] text-ink-muted truncate">{s.detail}</small>
                    </span>
                    <ChevIcon open={isOpen} />
                  </button>
                  {isOpen && help && (
                    <div className="pl-9 pr-2 pb-3 flex flex-col gap-1.5 text-[12.5px] text-ink-soft">
                      <p>{help[0]}</p>
                      <p><b className="font-semibold text-ink">How:</b> {help[1]}</p>
                      {!s.done && live && <button type="button" onClick={() => goTo(s.tab)} className={LINK + ' self-start'}>{GO[s.tab]} ›</button>}
                    </div>
                  )}
                </div>
              );
            })}
            {e.tasks.map(t => {
              const late = !t.doneAt && t.dueDate && t.dueDate < today;
              return (
                <div key={t.id} className="border-t border-line flex items-center gap-2.5 px-2 py-2 min-h-[44px]">
                  <button type="button" role="checkbox" aria-checked={!!t.doneAt} aria-label={t.label} disabled={!live || !!busy}
                    onClick={() => act('task:' + t.id, { action: 'task_toggle', taskId: t.id, done: !t.doneAt })} className="disabled:opacity-60">
                    <Box done={!!t.doneAt} />
                  </button>
                  <span className="flex-1 min-w-0">
                    <b className={'block text-[13px] font-medium ' + (t.doneAt ? 'text-ink-muted' : 'text-ink')}>{t.label}</b>
                    <small className={'block text-[12px] ' + (late ? 'text-bad' : 'text-ink-muted')}>
                      {t.doneAt ? `Done${t.doneBy ? ` by ${t.doneBy}` : ''}` : t.dueDate ? `${late ? 'Was due' : 'Due'} ${formatTeeDay(t.dueDate)}` : 'No due date'}
                    </small>
                  </span>
                  {live && <PenButton label={`Edit ${t.label}`} onClick={() => setTask({ id: t.id, label: t.label, dueDate: t.dueDate ?? '' })} />}
                </div>
              );
            })}
          </>}
        </aside>
      </div>

      {cancelling && (
        <Popup title={`Cancel ${e.name}?`} onClose={() => setCancelling(false)}>
          {money.keptCents > 0
            ? <p className="border-l-[3px] border-warn pl-3 text-[13.5px] text-ink">{usd(money.keptCents)} has been paid for this event. Cancelling doesn’t refund it: the money stays on the event, and you refund it under Payments.</p>
            : <p className="text-[13.5px] text-ink-soft">No one has paid for this event, so it can be cancelled now.</p>}
          <div>
            <KV k="Players on the list">{onList.length ? `${onList.length}. They aren’t told automatically, so let them know.` : 'None'}</KV>
            <KV k="Tee times">{held.length ? `${plural(held.length, 'held tee time')} go back on sale` : 'None held'}</KV>
            {money.openCents > 0 && <KV k="Pay links">Unpaid pay links stop working</KV>}
          </div>
          <PopupFoot onCancel={() => setCancelling(false)} cancel="Keep the event">
            <button type="button" disabled={!!busy} className={DANGER} onClick={async () => {
              const ok = await act('cancel', { action: 'cancel' }, r => {
                const errs = (r.linkErrors as string[] | undefined) ?? []; const v = Number(r.linksVoided ?? 0); const rel = Number(r.released ?? 0);
                return `Cancelled. ${plural(rel, 'tee time')} went back on sale.${v ? ` ${plural(v, 'unpaid pay link')} cancelled.` : ''}${errs.length ? ` ${errs.length === 1 ? 'A pay link' : `${errs.length} pay links`} couldn’t be cancelled. Cancel ${errs.length === 1 ? 'it' : 'them'} under Payments: ${errs.join('; ')}` : ''}`;
              });
              if (ok) setCancelling(false);
            }}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel the event'}</button>
          </PopupFoot>
        </Popup>
      )}

      {text && (
        <Popup title={text.title} onClose={() => setText(null)}>
          <label className={LABEL}>{text.label}
            <textarea rows={4} maxLength={4000} className={FIELD} value={text.value} onChange={ev => setText({ ...text, value: ev.target.value })} />
          </label>
          {text.field === 'terms' && <p className="text-[12.5px] text-ink-muted">The course’s own words, shown with the pay link.</p>}
          {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
          <EditFoot onCancel={() => setText(null)} busy={!!busy}
            onRemove={(text.field === 'notes' ? e.notes : e.terms) ? async () => { if (await update('text', { [text.field]: '' }, 'Removed.')) setText(null); } : undefined}>
            <button type="button" disabled={!!busy} className={PRIMARY}
              onClick={async () => { if (await update('text', { [text.field]: text.value }, 'Saved.')) setText(null); }}>{busy === 'text' ? 'Saving…' : 'Save'}</button>
          </EditFoot>
        </Popup>
      )}

      {inc && (
        <Popup title={inc.i == null ? 'Add an included item' : 'Edit an included item'} onClose={() => setInc(null)}>
          <label className={LABEL}>Item
            <input className={FIELD} maxLength={60} value={inc.value} onChange={ev => setInc({ ...inc, value: ev.target.value })} />
          </label>
          <p className="text-[12.5px] text-ink-muted">Shows on the sign-up page and tells your staff what to prepare.</p>
          {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
          <EditFoot onCancel={() => setInc(null)} busy={!!busy}
            onRemove={inc.i != null ? async () => { if (await update('inc', { includes: e.includes.filter((_, j) => j !== inc.i) }, 'Removed.')) setInc(null); } : undefined}>
            <button type="button" disabled={!!busy || !inc.value.trim()} className={PRIMARY} onClick={async () => {
              const v = inc.value.trim();
              const next = inc.i == null ? [...e.includes, v] : e.includes.map((x, j) => j === inc.i ? v : x);
              if (await update('inc', { includes: next }, inc.i == null ? 'Added.' : 'Saved.')) setInc(null);
            }}>{busy === 'inc' ? 'Saving…' : inc.i == null ? 'Add' : 'Save'}</button>
          </EditFoot>
        </Popup>
      )}

      {task && (
        <Popup title={task.id ? 'Edit a checklist step' : 'Add a checklist step'} onClose={() => setTask(null)}>
          <label className={LABEL}>Step
            <input className={FIELD} maxLength={200} value={task.label} onChange={ev => setTask({ ...task, label: ev.target.value })} />
          </label>
          <label className={LABEL + ' max-w-[200px]'}>Due
            <input type="date" className={FIELD} value={task.dueDate} onChange={ev => setTask({ ...task, dueDate: ev.target.value })} />
          </label>
          {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
          <EditFoot onCancel={() => setTask(null)} busy={!!busy}
            onRemove={task.id ? async () => { if (await act('task_remove', { action: 'task_remove', taskId: task.id }, () => 'Removed.')) setTask(null); } : undefined}>
            <button type="button" disabled={!!busy || !task.label.trim()} className={PRIMARY} onClick={async () => {
              const ok = task.id
                ? await act('task_edit', { action: 'task_edit', taskId: task.id, label: task.label, dueDate: task.dueDate || null }, () => 'Saved.')
                : await act('task_add', { action: 'task_add', label: task.label, dueDate: task.dueDate || null }, () => 'Added.');
              if (ok) setTask(null);
            }}>{busy === 'task_add' || busy === 'task_edit' ? 'Saving…' : task.id ? 'Save' : 'Add'}</button>
          </EditFoot>
        </Popup>
      )}
    </div>
  );
}

/** A pop-up's foot when editing a row: Remove (in red) where Cancel would be — the backdrop and Escape still close it. */
function EditFoot({ onCancel, onRemove, busy, children }: { onCancel: () => void; onRemove?: () => void; busy: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      {onRemove ? <button type="button" disabled={busy} onClick={onRemove} className={RED_LINK}>Remove</button> : <button type="button" onClick={onCancel} className={LINK}>Cancel</button>}
      <span className="flex-1" />
      {children}
    </div>
  );
}

/** The checklist's box: ticked in green when done. */
function Box({ done }: { done: boolean }) {
  return <span aria-hidden="true" className={'w-[18px] h-[18px] shrink-0 rounded-[5px] grid place-items-center border-[1.5px] ' + (done ? 'bg-ok border-ok text-white' : 'border-ink-soft')}>{done && <CheckIcon />}</span>;
}
