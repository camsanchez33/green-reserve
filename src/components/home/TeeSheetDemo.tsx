'use client';
// UI-H-1 (HOMEPAGE_SPEC.md): the homepage's two working demos — the hero's
// tee sheet + golfer phone, and the larger "See it work" section — read ONE
// module-level store, so a booking, check-in or colour change in either shows
// in both. Bundle note (perf rules): this is the page's only client island,
// plain React, no libraries; the sample data is ~1 KB.
import Image from 'next/image';
import { useSyncExternalStore } from 'react';
import s from '@/app/home.module.css';

type Row = { t: string; who?: string; n?: number; st: 'in' | 'due' | 'held' | 'open'; src?: string; amt?: number; isNew?: boolean };
type Day = { chip: string; label: string; today?: boolean; rate: number; rows: Row[] };
type State = {
  days: Day[]; day: number; tab: 'sheet' | 'list'; sel: string | null; n: number;
  done: { label: string; t: string; n: number; total: number } | null; acc: string; view: 'golfer' | 'staff';
};

const INITIAL_DAYS: Day[] = [
  { chip: 'Sat 4', label: 'Sat, Oct 4', today: true, rate: 52, rows: [
    { t: '7:00', who: 'Marino', n: 4, st: 'in', src: 'Online' },
    { t: '7:08', who: 'Okafor', n: 2, st: 'due', src: 'Online' },
    { t: '7:16', who: "Men's league", st: 'held', src: 'Shop hold' },
    { t: '7:24', who: 'Delgado', n: 3, st: 'due', src: 'Member', amt: 68 },
    { t: '7:32', st: 'open' },
    { t: '7:40', st: 'open' } ] },
  { chip: 'Sun 5', label: 'Sun, Oct 5', rate: 52, rows: [
    { t: '7:00', who: 'Kowalski', n: 4, st: 'due', src: 'Online' },
    { t: '7:08', st: 'open' },
    { t: '7:16', who: 'Brennan', n: 2, st: 'due', src: 'Phone' },
    { t: '7:24', st: 'open' },
    { t: '7:32', who: 'Ito', n: 3, st: 'due', src: 'Online' },
    { t: '7:40', st: 'open' } ] },
  { chip: 'Mon 6', label: 'Mon, Oct 6', rate: 44, rows: [
    { t: '7:00', st: 'open' },
    { t: '7:08', who: 'Pratt', n: 1, st: 'due', src: 'Walk-up' },
    { t: '7:16', st: 'open' },
    { t: '7:24', st: 'open' },
    { t: '7:32', who: 'Reyes', n: 2, st: 'due', src: 'Phone' },
    { t: '7:40', st: 'open' } ] },
];

let state: State = { days: INITIAL_DAYS, day: 0, tab: 'sheet', sel: null, n: 2, done: null, acc: '#2B4A38', view: 'golfer' };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const getState = () => state;
function update(fn: (st: State) => State) { state = fn(state); listeners.forEach(l => l()); }
const useDemo = () => useSyncExternalStore(subscribe, getState, getState);

const money = (v: number) => '$' + v.toFixed(2);
const amountOf = (d: Day, r: Row) => r.amt ?? (r.n ?? 0) * d.rate;
const withRow = (st: State, i: number, patch: Partial<Row>): Day[] =>
  st.days.map((d, di) => di !== st.day ? d : { ...d, rows: d.rows.map((r, ri) => ri === i ? { ...r, ...patch } : r) });

const ACCENTS = [
  { c: '#2B4A38', label: 'Pine' },
  { c: '#7A2E2E', label: 'Oxblood' },
  { c: '#23395B', label: 'Navy' },
  { c: '#8A5A1C', label: 'Bronze' },
];

/* ── the staff tee sheet ─────────────────────────────────────────────────── */
function TeeSheet({ big = false }: { big?: boolean }) {
  const st = useDemo();
  const d = st.days[st.day];
  const booked = d.rows.filter(r => r.st === 'due' || r.st === 'in');
  const step = (by: number) => update(x => ({ ...x, day: Math.max(0, Math.min(x.days.length - 1, x.day + by)), sel: null }));
  return (
    <div className={`${s.app} ${big ? s.appBig : ''}`}>
      <div className={s.appBar}>
        <b>Hollow Creek</b>
        <div className={s.tabs} role="tablist" aria-label="Tee sheet view">
          {(['sheet', 'list'] as const).map(t => (
            <button key={t} type="button" role="tab" aria-selected={st.tab === t} className={st.tab === t ? s.on : ''}
              onClick={() => update(x => ({ ...x, tab: t }))}>{t === 'sheet' ? 'Tee sheet' : 'Bookings'}</button>
          ))}
        </div>
        <div className={s.day}>
          <button type="button" aria-label="Previous day" disabled={st.day === 0} onClick={() => step(-1)}>‹</button>
          <span>{d.label}</span>
          <button type="button" aria-label="Next day" disabled={st.day === st.days.length - 1} onClick={() => step(1)}>›</button>
        </div>
      </div>
      {st.tab === 'sheet' ? (
        <table className={s.tt}>
          <thead><tr><th>Time</th><th>Group</th><th className={s.r}>Status</th></tr></thead>
          <tbody>
            {d.rows.map((r, i) => (
              <tr key={r.t} className={`${r.st === 'open' ? s.open : ''} ${r.isNew ? s.new : ''}`}>
                <td className={s.t}>{r.t}</td>
                <td>{r.who ? `${r.who}${r.n ? ` · ${r.n}` : ''}` : '—'}{r.isNew && <span className={s.newTag}>Booked online</span>}</td>
                <td className={s.r}>
                  {r.st === 'in' && <span className={s.in}>Checked in</span>}
                  {r.st === 'held' && <span className={s.hold}>Held</span>}
                  {r.st === 'open' && '4 spots open'}
                  {r.st === 'due' && <>
                    <span className={s.dueTxt}>Due {money(amountOf(d, r))}</span>
                    {d.today && <button type="button" className={s.ci} onClick={() => update(x => ({ ...x, days: withRow(x, i, { st: 'in', isNew: false }) }))}>Check in</button>}
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : booked.length ? (
        <div>
          {booked.map(r => (
            <div key={r.t} className={s.bk}>
              <span className={s.t}>{r.t}</span>
              <span>{r.who} · {r.n} <small>· {r.src}</small></span>
              <span>{r.st === 'in' ? <span className={s.in}>Checked in</span> : <span className={s.dueTxt}>{money(amountOf(d, r))}</span>}</span>
            </div>
          ))}
        </div>
      ) : <div className={s.empty}>No bookings yet.</div>}
      <div className={s.appFoot}>{booked.length} groups booked · 55 tee times{d.today ? ' today' : ''}</div>
    </div>
  );
}

/* ── the golfer's booking page ───────────────────────────────────────────── */
function GolferPhone({ wide = false }: { wide?: boolean }) {
  const st = useDemo();
  const d = st.days[st.day];
  const open = d.rows.filter(r => r.st === 'open');
  const reserve = () => update(x => {
    if (!x.sel) return x;
    const day = x.days[x.day];
    const i = day.rows.findIndex(r => r.t === x.sel);
    return {
      ...x, tab: 'sheet', sel: null,
      days: withRow(x, i, { who: 'Rivera', n: x.n, st: 'due', src: 'Online', isNew: true }),
      done: { label: day.label, t: x.sel, n: x.n, total: x.n * day.rate },
    };
  });
  return (
    <div className={`${s.phone} ${wide ? s.wide : ''}`} style={{ '--acc': st.acc } as React.CSSProperties}>
      <div className={s.phHead}>
        <Image src="/home/course-hollow-creek.jpg" alt="" fill sizes={wide ? '420px' : '300px'} className={s.phImg} />
        {wide && <span className={s.crest}>HC</span>}
        <div><b>Hollow Creek Golf Club</b><span>Suffern, NY · 18 holes{wide ? ' · Par 71' : ''}</span></div>
      </div>
      {st.done ? (
        <div className={s.done}>
          <span className={s.ok}>You&apos;re booked</span>
          <p>{st.done.label} · {st.done.t} · {st.done.n} {st.done.n > 1 ? 'players' : 'player'}</p>
          <small>Pay {money(st.done.total)} at check-in. Nothing charged today.</small>
          <button type="button" className={s.again} onClick={() => update(x => ({ ...x, done: null }))}>Book another time</button>
        </div>
      ) : (
        <>
          <div className={s.dates}>
            {st.days.map((x, i) => (
              <button key={x.chip} type="button" className={i === st.day ? s.on : ''} aria-pressed={i === st.day}
                onClick={() => update(y => ({ ...y, day: i, sel: null }))}>{x.chip}</button>
            ))}
          </div>
          {!open.length && <div className={s.noSlots}>No open times this morning.</div>}
          {open.map(r => (
            <button key={r.t} type="button" className={`${s.slot} ${st.sel === r.t ? s.sel : ''}`} aria-pressed={st.sel === r.t}
              onClick={() => update(x => ({ ...x, sel: x.sel === r.t ? null : r.t }))}>
              <span><b>{r.t}</b><small>4 spots</small></span><em>${d.rate}</em>
            </button>
          ))}
          {st.sel && <>
            <div className={s.pick}>
              <small>Players</small>
              <div className={s.step}>
                <button type="button" aria-label="Fewer players" disabled={st.n <= 1} onClick={() => update(x => ({ ...x, n: x.n - 1 }))}>−</button>
                <b>{st.n}</b>
                <button type="button" aria-label="More players" disabled={st.n >= 4} onClick={() => update(x => ({ ...x, n: x.n + 1 }))}>+</button>
              </div>
            </div>
            <div className={s.tot}>Green fee <b>{money(st.n * d.rate)}</b>, paid at check-in</div>
          </>}
          <button type="button" className={s.reserve} disabled={!st.sel} onClick={reserve}>{st.sel ? `Reserve ${st.sel}` : 'Pick a time'}</button>
          <div className={s.phNote}>Nothing charged today.</div>
        </>
      )}
    </div>
  );
}

/* ── hero: both screens, side by side ────────────────────────────────────── */
export function HeroDemo() {
  return (
    <div className={s.demo}>
      <div className={s.hint}><b>Try it.</b> Book a time on the phone, then check a group in on the tee sheet.</div>
      <div className={s.lbl}>What your staff see</div>
      <TeeSheet />
      <div className={s.phoneWrap}>
        <GolferPhone />
        <div className={s.lbl}>What golfers see</div>
      </div>
    </div>
  );
}

/* ── "See it work": one screen at a time, larger ─────────────────────────── */
export function SeeItWorkDemo() {
  const st = useDemo();
  return (
    <>
      <div className={s.seg} role="tablist" aria-label="Whose view">
        {(['golfer', 'staff'] as const).map(v => (
          <button key={v} type="button" role="tab" aria-selected={st.view === v} className={st.view === v ? s.on : ''}
            onClick={() => update(x => ({ ...x, view: v }))}>{v === 'golfer' ? 'What golfers see' : 'What your staff see'}</button>
        ))}
      </div>
      <div className={s.seeStage}>
        {st.view === 'golfer' ? (
          <div className={s.seeGolfer}>
            <GolferPhone wide />
            <div className={s.sws}>
              <span>Course color</span>
              {ACCENTS.map(a => (
                <button key={a.c} type="button" aria-label={a.label} aria-pressed={st.acc === a.c} className={st.acc === a.c ? s.on : ''}
                  style={{ background: a.c }} onClick={() => update(x => ({ ...x, acc: a.c }))} />
              ))}
            </div>
          </div>
        ) : (
          <div className={s.seeStaff}><TeeSheet big /></div>
        )}
      </div>
    </>
  );
}
