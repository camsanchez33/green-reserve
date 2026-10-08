'use client';
// HOME-2 (HOMEPAGE_SPEC.md, Cam 2026-10-07: "it needs to actually be accurate"):
// the homepage's working demo — the operator tee sheet on a laptop and the
// golfer's booking page on a phone, both reading ONE module-level store, so a
// time booked on the phone lands on the sheet. Every label, status word and
// button copies the real product: the sheet is the board (SHEET-2,
// components/dashboard/TeeSheetBoard.tsx: one row per hour, a square per time,
// the money edge, "Next up", the legend) and its side panel (groupRow() in
// src/app/dashboard/page.tsx: the same status words and buttons),
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
type Row = { t: string; groups: Group[]; blocked?: boolean };
type Day = { chip: string; num: string; short: string; long: string; today?: boolean; rate: number; rows: Row[] };
type Step = 'pick' | 'confirm' | 'done';
type State = {
  days: Day[]; day: number; n: number; sel: string | null; step: Step;
  acc: string; find: string; toast: string;
  /** The board square whose panel is open. */
  open: string | null;
};

const CAP = 4;
const HOLES = 18;
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

let state: State = { days: INITIAL_DAYS, day: 0, n: 2, sel: null, step: 'pick', acc: '#2B4A38', find: '', toast: '', open: null };
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
const TABS = ['Tee sheet', 'Analytics', 'Schedule', 'Members', 'Money', 'Messages', 'Settings'];

/* ── the operator tee sheet: the board (TeeSheetBoard.tsx) and its panel ──── */
type Tone = 'ok' | 'warn';
/** groupTone() in TeeSheetBoard: paid = checked in. */
const toneOf = (g: Group): Tone => g.done ? 'ok' : 'warn';
const slotTone = (r: Row): Tone | null => !r.groups.length ? null : r.groups.every(g => g.done) ? 'ok' : 'warn';
/** getBookingStatus() labels, as the panel shows them. */
const statusOf = (g: Group) => g.done ? (g.src === 'online' ? 'Checked In & Paid' : 'Checked In · Paid at counter') : g.src === 'online' ? 'Card on File' : 'Pay at counter';
const seats = (r: Row) => r.blocked ? <i className={s.dim}>Blocked</i> : CAP - booked(r) <= 0 ? <span className={s.full}>Full</span> : <span className={s.dim}>{CAP - booked(r)} open</span>;
const hourOf = (t: string) => Number(t.slice(0, 2));
const hourLabel = (h: number) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;

function TeeSheet() {
  const st = useDemo();
  const d = st.days[st.day];
  const groups = d.rows.flatMap(r => r.groups);
  const q = st.find.trim().toLowerCase();
  const rows = q ? d.rows.filter(r => r.groups.some(g => g.name.toLowerCase().includes(q))) : d.rows;
  const nextUp = d.today ? d.rows.find(r => !r.blocked && r.t > NOW)?.t : undefined;
  const step = (by: number) => update(x => ({ ...x, day: Math.max(0, Math.min(x.days.length - 1, x.day + by)), sel: null, step: 'pick', toast: '', open: null }));
  const toast = (msg: string) => { update(x => ({ ...x, toast: msg })); };
  const hours = [...new Set(rows.map(r => hourOf(r.t)))];
  const perHour = Math.max(1, ...hours.map(h => rows.filter(r => hourOf(r.t) === h).length));
  const panel = st.open ? d.rows.find(r => r.t === st.open) ?? null : null;
  const setRow = (t: string, fn: (r: Row) => Row) => update(x => ({ ...x, days: x.days.map((dd, di) => di !== x.day ? dd : { ...dd, rows: dd.rows.map(r => r.t !== t ? r : fn(r)) }) }));

  return (
    <div className={s.app}>
      <div className={s.top} style={{ background: st.acc }}>
        <b className={s.topName}>Hollow Creek Golf Club</b>
        <span className={s.topTabs} aria-hidden="true">{TABS.map((t, i) => <span key={t} className={i === 0 ? s.on : ''}>{t}</span>)}</span>
      </div>
      <div className={s.sheetHead}>
        <div>
          <div className={s.sheetTitle}>{d.long}</div>
          <div className={s.sheetLine}>{groups.length} booked · {groups.filter(g => g.done).length} checked in <span className={s.dim}>· {HOLES} holes · ${d.rate}</span></div>
        </div>
        <input className={s.find} value={st.find} placeholder="Find golfer..." aria-label="Find golfer"
          onChange={e => { const v = e.target.value; update(x => ({ ...x, find: v })); }} />
      </div>
      <div className={s.day}>
        <button type="button" aria-label="Previous day" disabled={st.day === 0} onClick={() => step(-1)}>‹</button>
        <span>{d.short}</span>
        <button type="button" aria-label="Next day" disabled={st.day === st.days.length - 1} onClick={() => step(1)}>›</button>
        {!d.today && <button type="button" className={s.todayLink} onClick={() => step(-st.day)}>Today</button>}
      </div>
      <div className={s.bd}>
        {hours.map(h => (
          <div key={h} className={s.bdRow}>
            <b className={s.bdHr}>{hourLabel(h)}</b>
            <div className={s.bdGrid} style={{ '--cols': perHour } as React.CSSProperties}>
              {rows.filter(r => hourOf(r.t) === h).map(r => {
                const tone = slotTone(r);
                const past = d.today && r.t < NOW && !r.blocked;
                return (
                  <button key={r.t} type="button" aria-label={`${fmt(r.t)}. Open`} onClick={() => update(x => ({ ...x, open: r.t, toast: '' }))}
                    className={[s.sq, r.blocked ? s.sqBlocked : '', tone === 'ok' ? s.eOk : tone === 'warn' ? s.eWarn : '', past ? s.sqPast : '', r.t === nextUp ? s.sqNext : '', st.open === r.t ? s.sqSel : '', r.groups.some(g => g.isNew) ? s.sqNew : ''].join(' ')}>
                    <span className={s.sqTop}><b>{fmt(r.t)}</b>{r.t === nextUp && <em>Next up</em>}</span>
                    <span className={s.sqGs}>{r.groups.map(g => (
                      <span key={g.name} className={s.sqG}><i className={toneOf(g) === 'ok' ? s.dOk : s.dWarn} /><span>{g.name}</span><small>{g.n}</small></span>
                    ))}</span>
                    <span className={s.sqFoot}><span className={s.dim}>{r.blocked ? '' : `${booked(r)} of ${CAP}`}</span>{seats(r)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!rows.length && <p className={s.dim}>No golfer matches “{st.find}”.</p>}
        <div className={s.lg}><span><i className={s.dOk} />Paid</span><span><i className={s.dWarn} />Booked, not paid yet</span><span><i className={s.dBad} />Needs attention</span></div>
      </div>

      {panel && (
        <div className={s.pnl} role="dialog" aria-label={`${fmt(panel.t)} tee time`}>
          <div className={s.pnlHd}>
            <div><b>{fmt(panel.t)}</b><span>{d.short} · {booked(panel)} of {CAP} players{panel.t === nextUp ? ' · Next up' : ''}</span></div>
            <button type="button" aria-label="Close" onClick={() => update(x => ({ ...x, open: null }))}>×</button>
          </div>
          {!panel.groups.length && <p className={s.dim}>No bookings yet.</p>}
          {panel.groups.map((g, gi) => (
            <div key={g.name} className={s.pnlG}>
              <div><b>{g.name}</b> <span className={s.dim}>{g.n} player{g.n === 1 ? '' : 's'}</span>{g.src !== 'online' && <span className={s.dim}> {g.src === 'phone' ? 'Phone' : 'Walk-in'}</span>}</div>
              <div className={s.pnlAct}>
                <span className={s.pnlSt}><i className={toneOf(g) === 'ok' ? s.dOk : s.dWarn} />{statusOf(g)}</span>
                {!g.done && <button type="button" className={s.ci} onClick={() => {
                  setRow(panel.t, r => ({ ...r, groups: r.groups.map((x, i) => i === gi ? { ...x, done: true, isNew: false } : x) }));
                  toast(g.src === 'online' ? `Checked in — charged ${money(roundTotal(d, g.n))}.` : `${g.name} checked in — paid at the counter.`);
                }}>{g.src === 'online' ? 'Check in' : 'Check in · paid at counter'}</button>}
                {!g.done && <button type="button" className={s.cx} onClick={() => {
                  setRow(panel.t, r => ({ ...r, groups: r.groups.filter((_, i) => i !== gi) }));
                  toast('Cancelled — no charge was made.');
                }}>Cancel booking</button>}
              </div>
            </div>
          ))}
          <div className={s.pnlSlot}>
            {!panel.blocked && booked(panel) < CAP && <button type="button" className={s.wk} onClick={() => {
              setRow(panel.t, r => ({ ...r, groups: [...r.groups, { name: 'Dana Price', n: 1, src: 'walk_in' as Src }] }));
              toast('Dana Price added.');
            }}>Walk-in or phone booking</button>}
            {!panel.groups.length && <button type="button" className={s.wk} onClick={() => setRow(panel.t, r => ({ ...r, blocked: !r.blocked }))}>{panel.blocked ? 'Unblock' : 'Block'}</button>}
          </div>
        </div>
      )}

      <div className={s.appFoot}>
        <span className={s.toast} role="status">{st.toast}</span>
        <span>{groups.length} group{groups.length === 1 ? '' : 's'} booked · {d.rows.filter(r => !r.blocked).length} tee times</span>
      </div>
    </div>
  );
}

/* ── the golfer's booking page (CourseBookingClient → /book) ──────────────── */
function GolferPhone() {
  const st = useDemo();
  const d = st.days[st.day];
  const open = d.rows.filter(r => !r.blocked && CAP - booked(r) >= st.n && !(d.today && r.t < NOW));
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
                <span><b>{fmt(r.t)}</b><small>{CAP - booked(r)} spots</small></span>
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
