'use client';
// BIRDIE_AI_SPEC B4b — a change Birdie drafted, waiting on the operator.
// Nothing has happened when this renders. Confirm calls the SAME dashboard
// route the Schedule page uses (its permission check, agreement check and
// validation decide), then reports the outcome to /api/birdie/chat (PUT) so
// every Birdie-drafted change is logged. No-silent-failures: pending → done,
// or the route's own error with a retry.
import { useState } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { isProposalCard, cardCalls, type ProposalCard } from '@/lib/birdie/proposal-types';

type State = { kind: 'idle' } | { kind: 'applying' } | { kind: 'done' } | { kind: 'error'; message: string } | { kind: 'dismissed' };

export function ConfirmCard({ card }: { card: ProposalCard }) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function confirm() {
    // Belt and braces: the server only builds allow-listed calls, and the
    // widget re-checks before it sends anything.
    if (!isProposalCard(card)) { setState({ kind: 'error', message: 'This draft is not one Birdie is allowed to apply.' }); return; }
    setState({ kind: 'applying' });
    let ok = false;
    let message = '';
    // ACT-2: a card may make several calls (one per tee time). They run in
    // order and stop at the first refusal, which is reported with how far it got.
    const calls = cardCalls(card);
    let done = 0;
    try {
      for (const call of calls) {
        const r = await fetch(call.path, {
          method: call.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(call.body),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          const why = typeof d.error === 'string' ? d.error : `The change was refused (${r.status}).`;
          message = calls.length > 1 ? `${why} Stopped after ${done} of ${calls.length} — the rest were not changed.` : `${why}${typeof d.error === 'string' ? '' : ' Nothing was changed.'}`;
          break;
        }
        done++;
      }
      ok = done === calls.length;
    } catch {
      message = calls.length > 1 && done > 0
        ? `Network error after ${done} of ${calls.length} — the rest were not changed. Check your connection and try again.`
        : 'Network error — nothing was changed. Check your connection and try again.';
    }
    // The log line is best-effort: the change already succeeded or failed on
    // its own route, and that is what the operator is shown.
    fetch('/api/birdie/chat', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applied: { title: card.title, method: card.call.method, path: card.call.path, ok, error: message, calls: calls.length, done } }),
    }).catch(() => undefined);
    setState(ok ? { kind: 'done' } : { kind: 'error', message });
  }

  if (state.kind === 'dismissed') {
    return <div className="mt-2 text-[12px] text-ink-muted">Draft dismissed — nothing was changed.</div>;
  }

  return (
    <div className="mt-2 rounded-md bg-white px-3 py-2.5 shadow-card">
      <div className="text-[13px] font-semibold text-ink">{card.title}</div>
      <div className="mt-1.5 divide-y divide-line">
        {card.changes.map((c, i) => (
          <div key={i} className="py-1.5 text-[12.5px] leading-snug">
            <div className="text-ink-muted">{c.label}</div>
            <div className="text-ink"><span className="line-through decoration-ink-faint">{c.from}</span> → <span className="font-semibold">{c.to}</span></div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-ink leading-snug">{card.note}</p>

      {state.kind === 'done' ? (
        <div className="mt-2"><StatusDot status="ok" label="Done — saved. Reload the page to see it." /></div>
      ) : (
        <>
          {state.kind === 'error' && (
            <div className="mt-2 rounded-md bg-bad/5 border border-bad/20 px-2.5 py-2 text-[12px] text-bad">{state.message}</div>
          )}
          <div className="mt-2.5 flex items-center gap-3">
            <button type="button" onClick={confirm} disabled={state.kind === 'applying'}
              className="px-3 py-1.5 rounded-md bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[12.5px] font-semibold transition-colors">
              {state.kind === 'applying' ? 'Saving…' : state.kind === 'error' ? 'Try again' : 'Confirm'}
            </button>
            {state.kind !== 'applying' && (
              <button type="button" onClick={() => setState({ kind: 'dismissed' })} className="text-[12.5px] text-ink-soft hover:text-ink transition-colors">Not now</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
