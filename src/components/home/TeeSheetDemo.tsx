'use client';
// HOME-2 (HOMEPAGE_SPEC.md, Cam 2026-10-07: "it needs to actually be accurate"):
// the homepage's working demo — the operator tee sheet on a laptop and the
// golfer's booking page on a phone, both reading ONE module-level store, so a
// time booked on the phone lands on the sheet. Every label, status word and
// button copies the real product: the sheet is seat rows (DENSE-4,
// components/dashboard/TeeSheetRows.tsx: one row per time, price, a cell per
// seat, the fills, the now line, the legend) inside the dashboard's rail and
// number strip (DASH-D), and the time's card (TT-CARD; groupRow() in
// src/app/dashboard/page.tsx: the same status words, Check in, Edit group, Add
// players and Open seats),
// the phone from courses/[slug]/CourseBookingClient.tsx and book/BookClient.tsx.
// CLAUDE.md: change one, check the other.
// Bundle note (perf rules): the page's only client island, plain React, no
// libraries; the sample data is ~1 KB.
import Image from 'next/image';
import { useSyncExternalStore } from 'react';
import { ACCESS_FEE_PER_PLAYER } from '@/lib/booking-fees';
import s from '@/app/home.module.css';

type Src = 'online' | 'phone' | 'walk_in';
type Group = { name: string; n: number; src: Src; done?: boolean; isNew?: boolean };
type Row = { t: string; groups: Group[]; blocked?: boolean; closed?: number };
type Day = { chip: string; num: string; short: string; long: string; today?: boolean; rate: number; rows: Row[] };
type Step = 'pick' | 'confirm' | 'done';
type State = {
  days: Day[]; day: number; n: number; sel: string | null; step: Step;
  acc: string; find: string; toast: string;
  /** The tee time whose card is open. */
  open: string | null;
  /** The group whose Edit group menu is open. */
  edit: string | null;
};

const CAP = 4;
// The sheet's "now" on the demo's today: 7:00 has teed off, 7:15 is next up.
const NOW = '07:05';
const GOLFER = { name: 'Alex Rivera', email: 'alex.rivera@example.com' };

const INITIAL_DAYS: Day[] = [
  { chip: 'Today', num: '4', short: 'Sat, Oct 4', long: 'Saturday, October 4', today: true, rate: 52, rows: [
    { t: '07:00', groups: [{ name: 'Marisa Conti', n: 4, src: 'online', done: true }] },
    { t: '07:15', groups: [{ name: 'Grace Okafor', n: 2, src: 'online' }] },
    { t: '07:30', groups: [], blocked: true },
    { t: '07:45', groups: [{ name: 'Luis Delgado', n: 3, src: 'phone' }] },
    { t: '08:00', groups: [] },
    { t: '08:15', groups: [{ name: 'Ken Ito', n: 2, src: 'online', done: true }, { name: 'Sam Lee', n: 2, src: 'online' }] },
    { t: '08:30', groups: [] },
    { t: '08:45', groups: [{ name: 'Nina Shah', n: 1, src: 'walk_in' }] } ] },
  { chip: 'Sun', num: '5', short: 'Sun, Oct 5', long: 'Sunday, October 5', rate: 52, rows: [
    { t: '07:00', groups: [{ name: 'Pete Kowalski', n: 4, src: 'online' }] },
    { t: '07:15', groups: [] },
    { t: '07:30', groups: [{ name: 'Rob Brennan', n: 2, src: 'phone' }] },
    { t: '07:45', groups: [] },
    { t: '08:00', groups: [{ name: 'Aya Mori', n: 3, src: 'online' }] },
    { t: '08:15', groups: [] },
    { t: '08:30', groups: [] },
    { t: '08:45', groups: [] } ] },
  { chip: 'Mon', num: '6', short: 'Mon, Oct 6', long: 'Monday, October 6', rate: 44, rows: [
    { t: '07:00', groups: [] },
    { t: '07:15', groups: [{ name: 'Jim Pratt', n: 1, src: 'walk_in' }] },
    { t: '07:30', groups: [] },
    { t: '07:45', groups: [] },
    { t: '08:00', groups: [{ name: 'Ana Reyes', n: 2, src: 'phone' }] },
    { t: '08:15', groups: [] },
    { t: '08:30', groups: [] },
    { t: '08:45', groups: [] } ] },
];

let state: State = { days: INITIAL_DAYS, day: 0, n: 2, sel: null, step: 'pick', acc: '#2B4A38', find: '', toast: '', open: null, edit: null };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const getState = () => state;
function update(fn: (st: State) => State) { state = fn(state); listeners.forEach(l => l()); }
const useDemo = () => useSyncExternalStore(subscribe, getState, getState);

const money = (v: number) => '$' + v.toFixed(2);
/** formatTeeTime in lib/format: "7:32 AM". */
const fmt = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const booked = (r: Row) => r.groups.reduce((a, g) => a + g.n, 0);
const roundTotal = (d: Day, n: number) => n * d.rate + n * ACCESS_FEE_PER_PLAYER;
const ACCENTS = [
  { c: '#2B4A38', label: 'Pine' },
  { c: '#7A2E2E', label: 'Oxblood' },
  { c: '#23395B', label: 'Navy' },
  { c: '#8A5A1C', label: 'Bronze' },
];
/** The dashboard rail (OperatorSidebar.tsx, DASH-D): Today · Business · Settings. */
const RAIL: { group?: string; tabs: string[] }[] = [
  { group: 'Today', tabs: ['Home', 'Tee sheet', 'Pro shop', 'Messages'] },
  { group: 'Business', tabs: ['Money', 'Members', 'Events', 'Schedule', 'Analytics'] },
  { tabs: ['Settings'] },
];
/** $1,234 — the strip's money, as dollars. */
const dollars = (v: number) => '$' + Math.round(v).toLocaleString('en-US');

/* ── the operator tee sheet: seat rows (TeeSheetRows.tsx) and its card ───── */
type Tone = 'ok' | 'warn';
/** groupTone() in TeeSheetRows: paid = checked in. */
const toneOf = (g: Group): Tone => g.done ? 'ok' : 'warn';
/** The card's status line once paid (getBookingStatus()). */
const statusOf = (g: Group) => g.src === 'online' ? 'Checked In & Paid' : 'Checked In · Paid at the register';
/** How they booked, for a group that hasn't paid: "Booked online · no card saved". The demo course takes no card. */
const bookedHow = (g: Group) => `${g.src === 'phone' ? 'Phone booking' : g.src === 'walk_in' ? 'Walk-in' : 'Booked online'} · no card saved`;
const hourOf = (t: string) => Number(t.slice(0, 2));
const hourLabel = (h: number) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;

function TeeSheet() {
  const st = useDemo();
  const d = st.days[st.day];
  const groups = d.rows.flatMap(r => r.groups);
  const q = st.find.trim().toLowerCase();
  const rows = q ? d.rows.filter(r => r.groups.some(g => g.name.toLowerCase().includes(q))) : d.rows;
  const nextUp = d.today ? d.rows.find(r => !r.blocked && r.t > NOW)?.t : undefined;
  const step = (by: number) => update(x => ({ ...x, day: Math.max(0, Math.min(x.days.length - 1, x.day + by)), sel: null, step: 'pick', toast: '', open: null, edit: null }));
  const toast = (msg: string) => { update(x => ({ ...x, toast: msg })); };
  // isPast on the real sheet is time <= now.
  const nowAt = d.today ? rows.findIndex(r => r.t > NOW) : -1;
  const panel = st.open ? d.rows.find(r => r.t === st.open) ?? null : null;
  const setRow = (t: string, fn: (r: Row) => Row) => update(x => ({ ...x, days: x.days.map((dd, di) => di !== x.day ? dd : { ...dd, rows: dd.rows.map(r => r.t !== t ? r : fn(r)) }) }));
  // The strip above the sheet (the real one's Players · Checked in · Paid · Not paid yet).
  const players = groups.reduce((n, g) => n + g.n, 0);
  const inPlayers = groups.filter(g => g.done).reduce((n, g) => n + g.n, 0);
  const paid = groups.filter(g => g.done);
  const owes = groups.filter(g => !g.done);
  const spots = d.rows.filter(r => !r.blocked).reduce((n, r) => n + CAP - (r.closed ?? 0), 0);

  return (
    <div className={s.app}>
      <div className={s.rail} aria-hidden="true">
        <div className={s.railCourse}><i style={{ background: st.acc }}>HC</i><span><b>Hollow Creek Golf Club</b><small>Public course</small></span></div>
        {RAIL.map((g, gi) => (
          <div key={gi} className={s.railGrp}>
            {g.group && <small>{g.group}</small>}
            {g.tabs.map(t => <span key={t} className={t === 'Tee sheet' ? s.on : ''}>{t === 'Tee sheet' && <i style={{ background: st.acc }} />}{t}</span>)}
          </div>
        ))}
      </div>
      <div className={s.main}>
        <div className={s.sheetTitle}>{d.long}</div>
        <div className={s.strip}>
          <div><small>Players</small><span><b>{players}</b> of {spots}</span><small>spots booked</small></div>
          <div><small>Checked in</small><span><b>{inPlayers}</b> of {players}</span><small>players</small></div>
          <div><small>Paid</small><span><b>{dollars(paid.reduce((v, g) => v + roundTotal(d, g.n), 0))}</b></span><small>{paid.length} group{paid.length === 1 ? '' : 's'}</small></div>
          <div><small>Not paid yet</small><span><b className={s.due}>{dollars(owes.reduce((v, g) => v + roundTotal(d, g.n), 0))}</b></span><small>{owes.length} group{owes.length === 1 ? '' : 's'}</small></div>
        </div>
        <div className={s.sheetCard}>
          <div className={s.bar}>
            <div className={s.day}>
              <button type="button" aria-label="Previous day" disabled={st.day === 0} onClick={() => step(-1)}>‹</button>
              <span>{d.short}</span>
              <button type="button" aria-label="Next day" disabled={st.day === st.days.length - 1} onClick={() => step(1)}>›</button>
              {!d.today && <button type="button" className={s.todayLink} onClick={() => step(-st.day)}>Today</button>}
            </div>
            <span className={s.views} aria-hidden="true"><b>Grid</b><span>List</span><span>Calendar</span></span>
            <input className={s.find} value={st.find} placeholder="Find golfer" aria-label="Find golfer"
              onChange={e => { const v = e.target.value; update(x => ({ ...x, find: v })); }} />
            <span className={s.addTime} aria-hidden="true">+ Time</span>
          </div>
          <div className={s.bd}>
            {/* The key sits above the sheet, as on the real one. */}
            <div className={s.lg}>{d.today && <span>All on time</span>}<span><i className={s.kOk} />Paid</span><span><i className={s.kWarn} />Owes</span><span><i className={s.kBad} />Declined or no-show</span><i className={s.lgRule} aria-hidden="true" /><span><b>In</b>checked in</span><span><b>M</b>member</span><span><b>R</b>resident</span></div>
            {rows.map((r, i) => {
              const past = d.today && r.t <= NOW;
              const newHour = i === 0 || hourOf(rows[i - 1].t) !== hourOf(r.t);
              const closed = r.closed ?? 0;
              return (
                <div key={r.t}>
                  {newHour && <div className={s.rwHr}>{hourLabel(hourOf(r.t))}</div>}
                  {i === nowAt && nowAt > 0 && <div className={s.rwNow} aria-hidden="true">Now</div>}
                  <button type="button" aria-label={`${fmt(r.t)}${r.t === nextUp ? ', next up' : ''}${r.blocked ? ', blocked' : `, ${booked(r)} of ${CAP} booked`}. Open`} onClick={() => update(x => ({ ...x, open: r.t, edit: null, toast: '' }))}
                    className={[s.rw, past ? s.rwPast : '', r.t === nextUp ? s.rwNext : '', st.open === r.t ? s.rwSel : ''].join(' ')}>
                    <span className={s.rwT}>{fmt(r.t).replace(/ (AM|PM)$/, '')}</span>
                    <span className={s.rwP}>{r.blocked ? '' : `$${d.rate}`}</span>
                    {r.blocked ? <span className={s.rwBlocked}>Blocked</span> : <>
                      {r.groups.map((g, gi) => (
                        <span key={`${g.name}-${gi}`} style={{ gridColumn: `span ${Math.min(g.n, CAP)}` }}
                          className={[s.seat, toneOf(g) === 'ok' ? s.seatPaid : '', g.isNew ? s.seatNew : ''].join(' ')}>
                          <span>{g.name}</span>{g.n > 1 && <small>+{g.n - 1}</small>}{g.done && <b>In</b>}
                        </span>
                      ))}
                      {Array.from({ length: Math.max(0, CAP - booked(r) - closed) }, (_, k) => <span key={k} className={s.seatOpen} />)}
                      {Array.from({ length: closed }, (_, k) => <span key={`c${k}`} className={s.seatClosed}>Closed</span>)}
                    </>}
                  </button>
                </div>
              );
            })}
            {!rows.length && <p className={s.dim}>No golfer matches “{st.find}”.</p>}
          </div>
        </div>
      </div>

      {panel && (() => {
        const free = CAP - booked(panel);
        const closed = panel.closed ?? 0;
        const open = free - closed;
        return (
        <div className={s.pnl} role="dialog" aria-label={`${fmt(panel.t)} tee time`}>
          <div className={s.pnlHd}>
            <div>
              <b>{fmt(panel.t)}{panel.t === nextUp && <em>Next up</em>}</b>
              <span>{d.short}</span>
              <span className={s.pnlFacts}>{panel.blocked ? <i>Blocked</i> : <>{booked(panel)} of {CAP} players · {open <= 0 ? 'Full' : `${open} open`}</>}<span className={s.dim}>18 holes · {money(d.rate)} a player</span></span>
            </div>
            <button type="button" aria-label="Close" onClick={() => update(x => ({ ...x, open: null, edit: null }))}>×</button>
          </div>
          {!panel.groups.length && <p className={s.dim}>{panel.blocked ? 'This time is blocked — golfers can’t book it.' : 'Nobody is booked yet.'}</p>}
          {panel.groups.map((g, gi) => {
            const key = `${panel.t}-${gi}`;
            return (
            <div key={`${g.name}-${gi}`} className={s.pnlG}>
              <div className={s.pnlWho}><span><b>{g.name}</b><span className={s.dim}> · {g.n} player{g.n === 1 ? '' : 's'}</span></span><b>{money(roundTotal(d, g.n))}</b></div>
              {g.done
                ? <span className={s.pnlSt}><i className={s.dOk} />{statusOf(g)}</span>
                : <span className={s.pnlHow}>{bookedHow(g)}</span>}
              {!g.done && <button type="button" className={s.ciWide} onClick={() => {
                setRow(panel.t, r => ({ ...r, groups: r.groups.map((x, i) => i === gi ? { ...x, done: true, isNew: false } : x) }));
                toast(`${g.name} is checked in · ${money(roundTotal(d, g.n))} paid.`);
              }}>Check in</button>}
              {/* The real menu also moves, resizes and no-shows a group; the demo keeps the cancel. */}
              {!g.done && <button type="button" className={s.editLink} aria-expanded={st.edit === key} onClick={() => update(x => ({ ...x, edit: x.edit === key ? null : key }))}>Edit group</button>}
              {!g.done && st.edit === key && (
                <div className={s.editMenu}>
                  <button type="button" onClick={() => {
                    setRow(panel.t, r => ({ ...r, groups: r.groups.filter((_, i) => i !== gi) }));
                    update(x => ({ ...x, edit: null }));
                    toast('Cancelled — no charge was made.');
                  }}><span>Cancel booking</span><span aria-hidden="true">›</span></button>
                </div>
              )}
            </div>
            );
          })}
          <div className={s.pnlSlot}>
            {!panel.blocked && open > 0 && <button type="button" className={s.ci} onClick={() => {
              setRow(panel.t, r => ({ ...r, groups: [...r.groups, { name: 'Dana Price', n: 1, src: 'walk_in' as Src }] }));
              toast('Dana Price added.');
            }}>Add players</button>}
            {!panel.blocked && (open > 0 || closed > 0) && (
              <div className={s.seats}>
                <span>Open seats{closed > 0 && <span className={s.dim}> · {closed} closed</span>}</span>
                <span role="group" aria-label="Open seats on this time">
                  <button type="button" aria-label="Close a seat" disabled={open <= 0} onClick={() => setRow(panel.t, r => ({ ...r, closed: closed + 1 }))}>−</button>
                  <span aria-live="polite"><b>{open}</b> of {free}</span>
                  <button type="button" aria-label="Reopen a seat" disabled={closed <= 0} onClick={() => setRow(panel.t, r => ({ ...r, closed: closed - 1 }))}>+</button>
                </span>
              </div>
            )}
            {panel.blocked && <button type="button" className={s.reopen} onClick={() => setRow(panel.t, r => ({ ...r, blocked: false }))}>Closed · reopen this time</button>}
          </div>
        </div>
        );
      })()}

      {st.toast && <div className={s.appFoot}><span className={s.toast} role="status">{st.toast}</span></div>}
    </div>
  );
}

/* ── the golfer's booking page (CourseBookingClient → /book) ──────────────── */
function GolferPhone() {
  const st = useDemo();
  const d = st.days[st.day];
  const free = (r: Row) => CAP - booked(r) - (r.closed ?? 0);
  const open = d.rows.filter(r => !r.blocked && free(r) >= st.n && !(d.today && r.t < NOW));
  const sel = open.find(r => r.t === st.sel) ?? null;
  const total = roundTotal(d, st.n);
  const pickDay = (i: number) => update(y => ({ ...y, day: i, sel: null, toast: '' }));
  const confirm = () => update(x => {
    if (!x.sel) return x;
    return {
      ...x, step: 'done', find: '',
      days: x.days.map((dd, di) => di !== x.day ? dd : { ...dd, rows: dd.rows.map(r => r.t !== x.sel ? r : { ...r, groups: [...r.groups, { name: GOLFER.name, n: x.n, src: 'online' as Src, isNew: true }] }) }),
      toast: '',
    };
  });

  return (
    <div className={s.phone} style={{ '--acc': st.acc } as React.CSSProperties}>
      <div className={s.phHead}>
        <Image src="/home/course-hollow-creek.jpg" alt="" fill sizes="300px" className={s.phImg} />
        <div><b>Hollow Creek Golf Club</b><span>Suffern, NY · 18 holes</span></div>
      </div>

      {st.step === 'pick' && <>
        <div className={s.ctl}>
          <div className={s.dates}>
            {st.days.map((x, i) => (
              <button key={x.short} type="button" className={i === st.day ? s.on : ''} aria-pressed={i === st.day} aria-label={x.short}
                onClick={() => pickDay(i)}><small>{x.chip}</small>{x.num}</button>
            ))}
          </div>
          <div className={s.step} aria-label="Players">
            <button type="button" aria-label="Fewer players" disabled={st.n <= 1} onClick={() => update(x => ({ ...x, n: x.n - 1, sel: null }))}>−</button>
            <b>{st.n}</b>
            <button type="button" aria-label="More players" disabled={st.n >= CAP} onClick={() => update(x => ({ ...x, n: x.n + 1, sel: null }))}>+</button>
          </div>
        </div>
        <div className={s.ttl}><b>Tee times for {d.short}</b> <span>{open.length} available</span></div>
        <p className={s.trust}><b>Nothing charged today.</b> No card needed — cancel any time. {money(ACCESS_FEE_PER_PLAYER)}/player booking fee.</p>
        <div className={s.slots}>
          {!open.length && <div className={s.noSlots}>Nothing fits {st.n} on {d.short}.</div>}
          {open.map(r => (
            <div key={r.t} className={`${s.slot} ${st.sel === r.t ? s.sel : ''}`}>
              <div className={s.slotRow}>
                <span><b>{fmt(r.t)}</b><small>{free(r)} spots</small></span>
                <span className={s.slotR}><em>${d.rate} / player</em>
                  <button type="button" aria-pressed={st.sel === r.t} onClick={() => update(x => ({ ...x, sel: x.sel === r.t ? null : r.t }))}>{st.sel === r.t ? 'Selected' : 'Select'}</button>
                </span>
              </div>
              {st.sel === r.t && (
                <div className={s.items}>
                  <div><span>Green fee × {st.n}</span><span>{money(st.n * d.rate)}</span></div>
                  <div><span>GR booking fee × {st.n}</span><span>{money(st.n * ACCESS_FEE_PER_PLAYER)}</span></div>
                  <div className={s.itemsTotal}><span>Total</span><span>{money(total)}</span></div>
                  <small>Your green fee goes to the course; the {money(ACCESS_FEE_PER_PLAYER)} per player is GreenReserve&apos;s.</small>
                  <button type="button" className={s.reserve} onClick={() => update(x => ({ ...x, step: 'confirm' }))}>Continue to Book <span aria-hidden="true">→</span></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </>}

      {st.step === 'confirm' && sel && (
        <div className={s.done}>
          <b className={s.confirmH}>Confirm your tee time</b>
          <p>{d.short} · {fmt(sel.t)} · {st.n} {st.n > 1 ? 'players' : 'player'}</p>
          <div className={s.field}><small>Full name</small><span>{GOLFER.name}</span></div>
          <div className={s.field}><small>Email</small><span>{GOLFER.email}</span></div>
          <div className={s.items}>
            <div><span>You&apos;ll pay at check-in</span><span>{money(total)}</span></div>
            <div className={s.itemsTotal}><span>Charged today</span><span>$0.00</span></div>
          </div>
          <button type="button" className={s.reserve} onClick={confirm}>Confirm tee time</button>
          <button type="button" className={s.again} onClick={() => update(x => ({ ...x, step: 'pick' }))}>Back</button>
        </div>
      )}

      {st.step === 'done' && (
        <div className={s.done}>
          <span className={s.ok}>You&apos;re all set</span>
          <p>Your spot is reserved — no card required. Pay at the course or use the check-in link in your confirmation email.</p>
          {st.sel && <small>Check in at {fmt(st.sel)} and pay {money(total)}</small>}
          <button type="button" className={s.again} onClick={() => update(x => ({ ...x, step: 'pick', sel: null }))}>Back to Hollow Creek Golf Club</button>
        </div>
      )}
    </div>
  );
}

/* ── the homepage's "See how it works": laptop + phone, one store ─────────── */
export function LaptopDemo() {
  const st = useDemo();
  return (
    <>
      <div className={s.lbls} aria-hidden="true"><span>What your staff see</span><span>What golfers see</span></div>
      <div className={s.stage}>
        <div className={s.laptop} role="region" aria-label="What your staff see">
          <div className={s.laptopScreen}><TeeSheet /></div>
          <div className={s.laptopBase} aria-hidden="true" />
        </div>
        <div className={s.phoneSide} role="region" aria-label="What golfers see">
          <GolferPhone />
          <div className={s.sws}>
            <span>Course color</span>
            {ACCENTS.map(a => (
              <button key={a.c} type="button" aria-label={a.label} aria-pressed={st.acc === a.c} className={st.acc === a.c ? s.on : ''}
                style={{ background: a.c }} onClick={() => update(x => ({ ...x, acc: a.c }))} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
