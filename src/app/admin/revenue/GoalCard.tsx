'use client';

import { useState } from 'react';
import { stepUpFetch } from '@/lib/step-up-client';
import { goalPace, elapsedShare } from '@/lib/goal-pace';
import g from '../admin-glass.module.css';
import c from '../courses/courses.module.css';
import s from './revenue.module.css';
import { TERMS, SESSION_ENDED } from './terms';
import { type RevenueGoal, parseGoalCents, fillPct } from './logic';

// Revenue goal (ADMIN_REDO_SPEC "Goals: one pace rule everywhere"; Build 2026-11-12): owner only, This month only. The
// bar fills with revenue so far; its colour is the ONE shared pace rule (src/lib/goal-pace.ts, kind 'reach'): green on
// pace to hit, yellow within 10% short, red on pace to miss, grey for the first days. Set with PUT /api/admin/revenue-goal
// (step-up). Data: revenueGoal on GET /api/admin/revenue?period=month.

// Cents shown, as on the Revenue cards beside it; a negative month (more given back than taken) reads −$5.00.
const usd = (cents: number) => (cents < 0 ? '−$' : '$') + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const WORDS = { done: 'Goal reached', ok: 'On pace to hit it', warn: 'Close to the goal', bad: 'On pace to miss it', early: 'Too early to tell' } as const;

export default function GoalCard({ goal, onSaved }: { goal: RevenueGoal; onSaved: (targetCents: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const monthName = new Date(goal.month + '-15T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long' });
  const target = goal.targetCents;
  const pace = target ? goalPace({ progress: goal.progressCents, target, share: elapsedShare(goal.dayOfPeriod, goal.daysInPeriod), kind: 'reach', daysElapsed: goal.dayOfPeriod }) : null;

  async function save(clear = false) {
    const cents = clear ? null : parseGoalCents(draft ?? '');
    if (!clear && cents === null) { setErr('The goal must be an amount from $0.01 to $20,000,000, like 4000.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await stepUpFetch('/api/admin/revenue-goal', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: goal.month, cents }) });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) setErr(SESSION_ENDED);
      else if (!res.ok) setErr(body.error || `Couldn't save the goal (error ${res.status}). Try again.`);
      else { onSaved(typeof body.targetCents === 'number' || body.targetCents === null ? body.targetCents : cents); setDraft(null); }
    } catch { setErr("Couldn't save the goal — check your connection and try again."); }
    setBusy(false);
  }

  return (
    <div className={`${g.glass} ${s.rkc}`}>
      <div className={s.lrow}>
        <span className={s.l} title={TERMS.goal}>{monthName} goal</span>
        {draft === null && <button type="button" className={c.plink} onClick={() => { setDraft(target ? (target / 100).toFixed(2) : ''); setErr(''); }}>{target ? 'Change' : 'Set'}</button>}
      </div>
      {draft !== null ? (
        <form className={s.gform} onSubmit={e => { e.preventDefault(); if (!busy) save(); }}>
          <input inputMode="decimal" aria-label={`${monthName} revenue goal`} value={draft} onChange={e => setDraft(e.target.value)} placeholder="$0" autoFocus />
          <div className={s.gbtns}>
            <button type="submit" className={s.gpri} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            {target ? <button type="button" onClick={() => save(true)} disabled={busy}>Clear</button> : null}
            <button type="button" onClick={() => { setDraft(null); setErr(''); }} disabled={busy}>Cancel</button>
          </div>
        </form>
      ) : target ? (
        <>
          <b className={s.v}>{usd(goal.progressCents)} <span className={s.of}>of {usd(target)}</span></b>
          <div className={s.gbar}><i className={pace && pace.tone !== 'early' ? s[pace.tone] : undefined} style={{ width: `${fillPct(goal.progressCents, target)}%` }} /></div>
          {/* Words only — no month-end figure (a forecast is Cam's call, not yet approved for Revenue). */}
          {goal.progressCents >= target ? <span className={s.c}><span className={g.up}>{WORDS.done}</span></span>
            : pace && (pace.tone === 'early'
            ? <span className={s.c}>{WORDS.early}</span>
            : <span className={s.c}><span className={pace.tone === 'ok' ? g.up : pace.tone === 'warn' ? g.wa : g.down}>{WORDS[pace.tone]}</span></span>)}
        </>
      ) : (
        <><b className={s.na}>Not set</b><span className={s.c}>{usd(goal.progressCents)} so far</span></>
      )}
      {err && <p className={s.err} role="alert">{err}</p>}
    </div>
  );
}
