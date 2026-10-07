'use client';
// HOME-2 (HOMEPAGE_SPEC.md, Cam 2026-10-07: "it needs to actually be accurate"):
// the homepage's working demo — the operator tee sheet on a laptop and the
// golfer's booking page on a phone, both reading ONE module-level store, so a
// time booked on the phone lands on the sheet. Every label, status word and
// button copies the real product: the sheet from src/app/dashboard/page.tsx
// (slotStatus / the row's Pay · Check in · Walk-in button / the header line),
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
};

const CAP = 4;
const HOLES = 18;
// The sheet's "now" on the demo's today: 7:00 has teed off, 7:08 is next up.
const NOW = '07:05';
const GOLFER = { name: 'Alex Rivera', email: 'alex.rivera@example.com' };

const INITIAL_DAYS: Day[] = [
  { chip: 'Today', num: '4', short: 'Sat, Oct 4', long: 'Saturday, October 4', today: true, rate: 52, rows: [
    { t: '07:00', groups: [{ name: 'Marisa Conti', n: 4, src: 'online', done: true }] },
    { t: '07:08', groups: [{ name: 'Grace Okafor', n: 2, src: 'online' }] },
    { t: '07:16', groups: [], blocked: true },
    { t: '07:24', groups: [{ name: 'Luis Delgado', n: 3, src: 'phone' }] },
    { t: '07:32', groups: [] },
    { t: '07:40', groups: [{ name: 'Ken Ito', n: 2, src: 'online' }, { name: 'Sam Lee', n: 2, src: 'online' }] },
    { t: '07:48', groups: [] } ] },
  { chip: 'Sun', num: '5', short: 'Sun, Oct 5', long: 'Sunday, October 5', rate: 52, rows: [
    { t: '07:00', groups: [{ name: 'Pete Kowalski', n: 4, src: 'online' }] },
    { t: '07:08', groups: [] },
    { t: '07:16', groups: [{ name: 'Rob Brennan', n: 2, src: 'phone' }] },
    { t: '07:24', groups: [] },
    { t: '07:32', groups: [{ name: 'Aya Mori', n: 3, src: 'online' }] },
    { t: '07:40', groups: [] },
    { t: '07:48', groups: [] } ] },
  { chip: 'Mon', num: '6', short: 'Mon, Oct 6', long: 'Monday, October 6', rate: 44, rows: [
    { t: '07:00', groups: [] },
    { t: '07:08', groups: [{ name: 'Jim Pratt', n: 1, src: 'walk_in' }] },
    { t: '07:16', groups: [] },
    { t: '07:24', groups: [] },
    { t: '07:32', groups: [{ name: 'Ana Reyes', n: 2, src: 'phone' }] },
    { t: '07:40', groups: [] },
    { t: '07:48', groups: [] } ] },
];

let state: State = { days: INITIAL_DAYS, day: 0, n: 2, sel: null, step: 'pick', acc: '#2B4A38', find: '', toast: '' };
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
const patchGroup = (st: State, t: string, gi: number, patch: Partial<Group>): Day[] =>
  st.days.map((d, di) => di !== st.day ? d : { ...d, rows: d.rows.map(r => r.t !== t ? r : { ...r, groups: r.groups.map((g, i) => i === gi ? { ...g, ...patch, isNew: false } : g) }) });

const ACCENTS = [
  { c: '#2B4A38', label: 'Pine' },
  { c: '#7A2E2E', label: 'Oxblood' },
  { c: '#23395B', label: 'Navy' },
  { c: '#8A5A1C', label: 'Bronze' },
];
const TABS = ['Tee sheet', 'Analytics', 'Schedule', 'Members', 'Money', 'Messages', 'Settings'];

/* ── the operator tee sheet (dashboard/page.tsx) ─────────────────────────── */
function slotStatus(r: Row) {
  if (r.blocked) return <span className={s.hold}>Blocked</span>;
  if (!r.groups.length) return <span className={s.dim}>{CAP} spots open</span>;
  if (r.groups.every(g => g.done)) return <span className={s.in}>Checked in</span>;
  const left = CAP - booked(r);
  return left === 0 ? <span className={s.full}>Full</span> : <span className={s.dueTxt}>{left} left</span>;
}

function TeeSheet() {
  const st = useDemo();
  const d = st.days[st.day];
  const groups = d.rows.flatMap(r => r.groups);
  const q = st.find.trim().toLowerCase();
  const rows = q ? d.rows.filter(r => r.groups.some(g => g.name.toLowerCase().includes(q))) : d.rows;
  const nextUp = d.today ? d.rows.find(r => !r.blocked && r.t > NOW)?.t : undefined;
  const step = (by: number) => update(x => ({ ...x, day: Math.max(0, Math.min(x.days.length - 1, x.day + by)), sel: null, step: 'pick', toast: '' }));
  const toast = (msg: string) => { update(x => ({ ...x, toast: msg })); };

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
      <table className={s.tt}>
        <thead><tr><th>Time</th><th>Group</th><th className={s.r}>Status</th><th><span className={s.sr}>Action</span></th></tr></thead>
        <tbody>
          {rows.map(r => {
            const live = r.groups.filter(g => !g.done);
            const one = live.length === 1 ? live[0] : null;
            const gi = one ? r.groups.indexOf(one) : -1;
            const past = d.today && r.t < NOW && !r.blocked;
            return (
              <tr key={r.t} className={`${r.blocked ? s.blocked : ''} ${past ? s.past : ''} ${r.t === nextUp ? s.next : ''} ${r.groups.some(g => g.isNew) ? s.new : ''}`}>
                <td className={s.t}>{fmt(r.t)}</td>
                <td>
                  {r.groups.length ? r.groups.map(g => `${g.name} · ${g.n}`).join(', ') : r.t !== nextUp && <span className={s.dim}>—</span>}
                  {r.t === nextUp && <span className={s.nextTag}>Next up</span>}
                </td>
                <td className={s.r}>{slotStatus(r)}</td>
                <td className={s.r}>
                  {one && one.src !== 'online' && (
                    <button type="button" className={s.ci} onClick={() => { update(x => ({ ...x, days: patchGroup(x, r.t, gi, { done: true }) })); toast(`${one.name} checked in — paid at the counter.`); }}>Pay</button>
                  )}
                  {one && one.src === 'online' && (
                    <button type="button" className={s.ci} onClick={() => { update(x => ({ ...x, days: patchGroup(x, r.t, gi, { done: true }) })); toast(`Checked in — charged ${money(roundTotal(d, one.n))}.`); }}>Check in</button>
                  )}
                  {!live.length && !r.blocked && booked(r) < CAP && (
                    <button type="button" className={s.wk} onClick={() => {
                      update(x => ({ ...x, days: x.days.map((dd, di) => di !== x.day ? dd : { ...dd, rows: dd.rows.map(rr => rr.t !== r.t ? rr : { ...rr, groups: [...rr.groups, { name: 'Dana Price', n: 1, src: 'walk_in' as Src }] }) }) }));
                      toast('Dana Price added.');
                    }}>Walk-in</button>
                  )}
                </td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={4} className={s.dim}>No golfer matches “{st.find}”.</td></tr>}
        </tbody>
      </table>
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
