'use client';
// POS-3 R4 (Cam 2026-10-24): close out the register at the end of the day, on
// the Pro shop page. The day's figures come from the server (lib/register-close
// .ts); staff enter the starting cash and what they counted, see over or short,
// and save the count. A recount adds a new count — the latest stands.
// Revamp 3 dead end 24 (Cam 2026-10-29): a blind count — the day's cash figures and
// what should be in the drawer show only once the count is saved, so nobody counts to
// match; starting cash carries over from the last close-out; any of the last two weeks.
// (Shown in the browser only after counting; the route still returns them for the reveal.)
// DRAWER-1 (Cam 2026-11-09: "if I closed with x amount it should tell me how much is in there and how much I should take
// out and leave a note … for the next person … then you should have to re-open it"): the count also says what stays in
// the drawer for the next opening (the starting cash by default) and what to take out to deposit, takes a note for the
// next person, and closes the register. The next opening shows what was left (OpenRegister).
import { LEDGER_WHAT } from '@/lib/ledger-words';
import { OpenRegister } from '@/components/dashboard/OpenRegister';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { dfetch } from '@/lib/dashboard-fetch';
import { addDaysStr } from '@/lib/course-time';

type Summary = {
  day: string; today: string;
  cashSales: { count: number; cents: number; itemsCents: number; roundsCents: number; untaxed?: number };
  counterRounds: { count: number; cents: number };
  otherCash?: { count: number; cents: number };
  cashRefunds: { count: number; cents: number };
  cashTakenCents: number;
  /** Every cash movement of the day (money ledger), to trace a short drawer. */
  cashMoves?: { at: string; what: string; amountCents: number; note: string }[];
  card: { shopCents: number; roundsCents: number; refundsCents: number; cents: number };
};
type Close = { id: string; day: string; openingFloatCents: number; expectedCashCents: number; countedCashCents: number; differenceCents: number; note: string; closedBy: string; createdAt: string; leaveInCents: number | null; depositCents: number | null };

const usd = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;
const toCents = (v: string) => { const n = Number(v.replace(/[$,\s]/g, '')); return v.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };
const dayLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const overShort = (d: number) => (d === 0 ? { label: 'Even', tone: 'ok' as const } : d > 0 ? { label: `Over ${usd(d)}`, tone: 'warn' as const } : { label: `Short ${usd(-d)}`, tone: 'bad' as const });
const TONE = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' } as const;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// POS-5 (Cam 2026-11-08): on the Close out tab it opens straight to the count. The count stays BLIND (Cam: "shouldn't be
// live so like it's more secure") — what the drawer should hold shows only once the count is saved.
// Bills & coins: count each denomination and the total adds itself up (the same countedCashCents is saved).
const NOTES: [number, string][] = [[10000, '$100'], [5000, '$50'], [2000, '$20'], [1000, '$10'], [500, '$5'], [100, '$1'], [25, '25¢'], [10, '10¢'], [5, '5¢'], [1, '1¢']];

export function RegisterClose({ page = false }: { page?: boolean } = {}) {
  const [openState, setOpen] = useState(false);
  const open = page || openState;
  const access = useDashboardAccess();
  // Cam 2026-11-12 (approved Close out): the drawer is counted by tapping each bill and coin — no typed total.
  const [notes, setNotes] = useState<Record<number, number>>({});
  const [touched, setTouched] = useState(false);
  const [day, setDay] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Close[]>([]);
  const [loadError, setLoadError] = useState('');
  const [float, setFloat] = useState('');
  const [note, setNote] = useState('');
  const [leave, setLeave] = useState('');
  // The leave-in chips sit around this (Build 2026-11-12: the course's last float, nearby amounts, plus Other).
  const [leaveBase, setLeaveBase] = useState<number | null>(null);
  const [leaveOther, setLeaveOther] = useState(false);
  const [status, setStatus] = useState<'not_open' | 'open' | 'closed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Close | null>(null);
  // The past close-out opened from Recent close-outs.
  const [openClose, setOpenClose] = useState<string | null>(null);
  // POS-7: the day's locked starting cash, when the register was opened (null = type it here, as before).
  const [opened, setOpened] = useState<number | null>(null);
  // DRAWER-1: a session reopened after a close-out counts only the cash taken since.
  const [takenBase, setTakenBase] = useState(0);

  const load = useCallback(async (d?: string) => {
    setLoadError('');
    const r = await dfetch<{ summary: Summary; recent: Close[]; opened?: { startingCashCents: number } | null; status?: 'not_open' | 'open' | 'closed' | null; base?: { floatCents: number; takenBaseCents: number; opened: boolean } }>(`/api/operator/register-close${d ? `?day=${d}` : ''}`);
    if (!r.ok) { setLoadError(r.error); return; }
    setSummary(r.data.summary); setRecent(r.data.recent); setDay(r.data.summary.day);
    setOpened(r.data.opened ? r.data.opened.startingCashCents : null);
    setStatus(r.data.status ?? null); setTakenBase(r.data.base?.takenBaseCents ?? 0);
    // What stays for the next opening: the float this drawer started with, unless someone typed another.
    const startWith = r.data.opened ? r.data.opened.startingCashCents : r.data.recent[0]?.leaveInCents ?? r.data.recent[0]?.openingFloatCents;
    if (startWith != null) { setLeave(l => l || (startWith / 100).toFixed(2)); setLeaveBase(b => b ?? startWith); }
    // The drawer usually starts each day with the same float: offer the last one used.
    const last = r.data.recent[0];
    if (last) setFloat(f => f || (last.openingFloatCents / 100).toFixed(2));
  }, []);

  useEffect(() => { if (page) load(); }, [page, load]);
  const notesCents = NOTES.reduce((s, [v]) => s + (notes[v] ?? 0) * v, 0);
  const tap = (v: number, d: number) => { setTouched(true); setNotes(n => ({ ...n, [v]: Math.max(0, Math.min(9999, (n[v] ?? 0) + d)) })); };

  async function close() {
    if (!summary) return;
    setBusy(true); setError(''); setSaved(null);
    const r = await dfetch<{ close: Close }>('/api/operator/register-close', {
      method: 'POST', body: JSON.stringify({ day: summary.day, openingFloatCents: toCents(float) ?? 0, countedCashCents: countedCents, leaveInCents: toCents(leave), note }),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setSaved(r.data.close); setNote(''); setNotes({}); setTouched(false);
    load(summary.day); // the figures may have moved since the page loaded; show what was saved
  }

  const floatCents = opened ?? toCents(float) ?? 0;
  // POS-7: today, a login that can open the register opens it before counting (the count starts from it).
  const needsOpen = !!summary && summary.day === summary.today && opened === null && access.can('shop.open');
  // Any tap — down to zero too — is a count (an empty drawer can be closed out); no tap yet is no count.
  const countedCents = touched ? notesCents : null;
  const expected = summary ? floatCents + summary.cashTakenCents - takenBase : 0;
  const leaveCents = toCents(leave);
  const depositCents = countedCents !== null && leaveCents !== null ? countedCents - leaveCents : null;
  const leaveTooMuch = depositCents !== null && depositCents < 0;
  const diff = countedCents === null ? null : countedCents - expected;
  const dayCloses = recent.filter(c => c.day === summary?.day);
  // A day already counted shows its figures (a recount compares against them); otherwise only after saving.
  const revealed = !!summary && (dayCloses.length > 0 || saved?.day === summary.day);

  const leaveChips = leaveBase === null ? [] : [leaveBase - 10000, leaveBase - 5000, leaveBase, leaveBase + 5000].filter((c, k, a) => c >= 0 && a.indexOf(c) === k);
  const show = (c: number) => (revealed ? usd(c) : '—');
  const row = (label: string, value: string, strong = false) => (
    <div className={'flex justify-between gap-3 py-2 border-t border-line ' + (strong ? 'text-[15px]' : 'text-[13.5px]')}>
      <span className="text-ink">{label}</span><b className={'tabular-nums ' + (strong ? 'text-[16px] font-semibold' : 'font-semibold')}>{value}</b>
    </div>
  );
  // Latest count of each day first; a day's earlier counts stay as "recounted".
  const latest = recent.filter((c, i) => recent.findIndex(x => x.day === c.day) === i).slice(0, 5);

  if (!open) return (
    <Card className="mt-5 px-5 py-4 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-ink">Close out the day</h2>
      <button type="button" onClick={() => { setOpen(true); load(); }} className="text-[13px] text-pine font-medium hover:underline">Count the drawer</button>
    </Card>
  );
  return (
    <div className="mt-5">
      {loadError && <p className="mb-3 text-sm text-bad" role="alert">{loadError} <button type="button" onClick={() => load(day)} className="underline font-medium">Try again</button></p>}
      {!summary && !loadError && <Card className="p-5"><p className="text-sm text-ink-muted">Adding up the day…</p></Card>}
      {summary && (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h2 className="text-[15px] font-semibold text-ink mr-auto">Count the drawer</h2>
              <input type="date" aria-label="Day" value={day ?? summary.day} min={addDaysStr(summary.today, -13)} max={summary.today}
                onChange={e => { if (e.target.value) { setSaved(null); setNotes({}); setTouched(false); load(e.target.value); } }} className={INPUT} />
            </div>
            {/* POS-7: opened today → the locked amount (Change for shop.open_fix); a past day opened → its amount; else type it. */}
            {summary.day === summary.today && (opened !== null || access.can('shop.open'))
              ? <div className="mb-3"><OpenRegister key={saved?.id ?? 'open'} where="close" onOpened={c => setOpened(c)} /></div>
              : opened === null && (
                <label className="mb-3 flex items-center justify-between gap-3 text-[13.5px] text-ink">Starting cash
                  <span className="relative w-32"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                    <input value={float} onChange={e => setFloat(e.target.value)} inputMode="decimal" placeholder="0.00" aria-label="Starting cash" className={INPUT + ' w-full pl-6 text-right tabular-nums'} /></span>
                </label>
              )}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {NOTES.map(([v, l]) => (
                <div key={v} className="flex flex-col gap-1">
                  <span className="text-[12px] text-ink-muted tabular-nums">{l}</span>
                  <div className="flex items-center justify-between bg-page border border-line rounded-[10px] p-[3px]">
                    <button type="button" onClick={() => tap(v, -1)} aria-label={`One less ${l}`} className="w-8 h-8 rounded-[8px] text-[17px] text-ink hover:bg-line">−</button>
                    <b className="text-[15px] font-semibold text-ink tabular-nums">{notes[v] ?? 0}</b>
                    <button type="button" onClick={() => tap(v, 1)} aria-label={`One more ${l}`} className="w-8 h-8 rounded-[8px] text-[17px] text-ink hover:bg-line">+</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">{row('Counted', countedCents === null ? '—' : usd(countedCents), true)}</div>
            <h3 className="text-[15px] font-semibold text-ink mt-5 mb-1">Should be in the drawer</h3>
            {row('Starting cash', show(floatCents))}
            {row('Shop sales in cash', show(summary.cashSales.itemsCents))}
            {row('Rounds paid in cash', show(summary.cashSales.roundsCents))}
            {/* CASH-1: every counter payment is now a register sale; this is only older records' "paid at the counter". */}
            {summary.counterRounds.count > 0 && row('Older rounds marked paid', show(summary.counterRounds.cents))}
            {row('Cash dues and events', show(summary.otherCash?.cents ?? 0))}
            {row('Cash refunds', show(-summary.cashRefunds.cents))}
            {/* DRAWER-1: reopened after a close-out today — the drawer holds only what came in since. */}
            {takenBase !== 0 && row('Counted at an earlier close-out', show(-takenBase))}
            {row('Expected', show(expected), true)}
            <div className="flex justify-between gap-3 py-2 border-t border-line text-[15px]">
              <span className="text-ink">Difference</span>
              {revealed && diff !== null ? <span className={'text-[16px] font-semibold tabular-nums ' + TONE[overShort(diff).tone]}>{overShort(diff).label}</span> : <b className="text-[16px] font-semibold">—</b>}
            </div>
            {!revealed && <p className="mt-1 text-[12.5px] text-ink-muted">Shows once the count is saved.</p>}
            {revealed && (summary.cashSales.untaxed ?? 0) > 0 && <p className="mt-1 text-[12.5px] text-warn">{plural(summary.cashSales.untaxed ?? 0, 'sale')} taken without sales tax</p>}
            {/* Launch walk (Cam 2026-10-31): each cash payment, so a short drawer can be traced. */}
            {revealed && (summary.cashMoves?.length ?? 0) > 0 && (
              <details className="mt-3 text-[13px]">
                <summary className="cursor-pointer text-ink-soft font-medium underline underline-offset-4">Cash payments · {summary.cashMoves!.length}</summary>
                <ul className="mt-1 divide-y divide-line-soft">
                  {summary.cashMoves!.map((m, i) => (
                    <li key={i} className="flex gap-3 py-1.5">
                      <span className="tabular-nums text-ink-muted w-16 shrink-0">{new Date(m.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                      <span className="text-ink truncate">{LEDGER_WHAT[m.what] ?? m.what}{m.note ? ` · ${m.note}` : ''}</span>
                      <span className="ml-auto tabular-nums">{usd(m.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-[15px] font-semibold text-ink mb-2">Close out the day</h2>
            {/* DRAWER-1: what stays for the next opening, and what comes out to deposit. */}
            <div className="text-[12.5px] text-ink-muted mb-1.5">Leave in the drawer</div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Leave in the drawer">
              {leaveChips.map(c => (
                <button key={c} type="button" aria-pressed={!leaveOther && toCents(leave) === c} onClick={() => { setLeaveOther(false); setLeave((c / 100).toFixed(2)); }}
                  className={'px-3 min-h-[34px] rounded-[9px] border text-[13px] tabular-nums ' + (!leaveOther && toCents(leave) === c ? 'bg-ink text-white border-transparent font-semibold' : 'border-line text-ink-soft hover:text-ink')}>{usd(c).replace('.00', '')}</button>
              ))}
              <button type="button" aria-pressed={leaveOther || (leaveChips.length > 0 && !leaveChips.includes(toCents(leave) ?? -1))} onClick={() => setLeaveOther(true)}
                className={'px-3 min-h-[34px] rounded-[9px] border text-[13px] ' + (leaveOther || (leaveChips.length > 0 && !leaveChips.includes(toCents(leave) ?? -1)) ? 'bg-ink text-white border-transparent font-semibold' : 'border-dashed border-line text-ink-soft hover:text-ink')}>Other</button>
            </div>
            {(leaveOther || leaveChips.length === 0 || !leaveChips.includes(toCents(leave) ?? -1)) && (
              <span className="relative block w-36 mt-2"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                <input value={leave} onChange={e => setLeave(e.target.value)} inputMode="decimal" placeholder="0.00" aria-label="Leave in the drawer" aria-invalid={leaveTooMuch} autoFocus={leaveOther}
                  className={INPUT + ' w-full pl-6 text-right tabular-nums' + (leaveTooMuch || leaveCents === null ? ' border-bad' : '')} /></span>
            )}
            <div className="mt-3 flex justify-between gap-3 py-2 border-t border-line text-[13.5px]">
              <span className="text-ink">Take out to deposit</span>
              <b className={'tabular-nums font-semibold ' + (leaveTooMuch ? 'text-bad' : 'text-ink')}>{depositCents === null ? '—' : usd(depositCents)}</b>
            </div>
            {leaveTooMuch && <p className="text-[12.5px] text-bad">You can’t leave more than you counted.</p>}
            <label className="block mt-2 text-[12.5px] text-ink-muted">Note for the next person
              <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} className={INPUT + ' w-full mt-1'} /></label>
            {needsOpen && <p className="mt-2 text-[12.5px] text-warn">Open the register first.</p>}
            <button type="button" onClick={close} disabled={busy || countedCents === null || leaveCents === null || leaveTooMuch || needsOpen}
              className="mt-3 w-full min-h-[48px] bg-pine hover:bg-pine-hover text-white font-bold rounded-[10px] text-[15px] disabled:opacity-50">
              {busy ? 'Saving…' : dayCloses.length && status !== 'open' ? 'Save this recount' : summary.day === summary.today ? 'Close the register' : `Close out ${dayLabel(summary.day)}`}
            </button>
            {countedCents === null && <p className="mt-1.5 text-[12.5px] text-ink-muted">Count the drawer first.</p>}
            {error && <p className="mt-2 text-[13px] text-bad" role="alert">{error}</p>}
            {saved && (
              <div className="mt-3 rounded-[7px] border-l-[3px] border-ok bg-page px-3 py-2.5 text-[13.5px] text-ink" aria-live="polite">
                <p className="font-semibold">{saved.day === summary.today ? 'Register closed.' : 'Saved.'} {overShort(saved.differenceCents).label} against {usd(saved.expectedCashCents)} expected.</p>
                {saved.depositCents != null && <p className="mt-0.5">Take out <b className="tabular-nums">{usd(saved.depositCents)}</b> to deposit · leave <b className="tabular-nums">{usd(saved.leaveInCents ?? 0)}</b> for the next opening.</p>}
              </div>
            )}
            {!saved && status === 'closed' && summary.day === summary.today && dayCloses[0] && (
              <p className="mt-3 text-[13px] text-ink-muted">Closed {new Date(dayCloses[0].createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} by {dayCloses[0].closedBy}{dayCloses[0].leaveInCents != null ? ` · ${usd(dayCloses[0].leaveInCents)} left` : ''}. Reopen it on the Register.</p>
            )}

            <h3 className="text-[15px] font-semibold text-ink mt-5 mb-1">Card, for reference</h3>
            {row('Rounds paid by card', usd(summary.card.roundsCents))}
            {row('Shop sales by card', usd(summary.card.shopCents))}
            {summary.card.refundsCents > 0 && row('Shop card refunds', usd(-summary.card.refundsCents))}
            <p className="text-[12.5px] text-ink-muted mt-1.5">Card goes to Stripe — nothing to count.</p>

            {latest.length > 0 && (
              <>
                <h3 className="text-[15px] font-semibold text-ink mt-5 mb-1">Recent close-outs</h3>
                {latest.map(c => {
                  const os = overShort(c.differenceCents);
                  const counts = recent.filter(x => x.day === c.day);
                  const on = openClose === c.id;
                  // Cam 2026-11-12: the short list (day · who · over/short); a tap opens the full close-out.
                  return (
                    <div key={c.id} className="border-t border-line">
                      <button type="button" onClick={() => setOpenClose(on ? null : c.id)} aria-expanded={on}
                        className="w-full flex justify-between gap-3 py-2 text-left text-[13.5px] hover:bg-page rounded-[6px]">
                        <span className="min-w-0 text-ink">{dayLabel(c.day)}{c.closedBy ? ` · ${c.closedBy}` : ''}{counts.length > 1 ? <span className="text-ink-muted"> · recounted</span> : null}</span>
                        <b className={'font-semibold tabular-nums shrink-0 ' + TONE[os.tone]}>{os.label}</b>
                      </button>
                      {on && (
                        <dl className="mb-2 rounded-[8px] bg-page px-3 py-1 text-[13px]">
                          {([['Expected', usd(c.expectedCashCents)], ['Counted', usd(c.countedCashCents)], ['Left in the drawer', c.leaveInCents == null ? '—' : usd(c.leaveInCents)], ['Deposit', c.depositCents == null ? '—' : usd(c.depositCents)]] as const).map(([l, v]) => (
                            <div key={l} className="flex justify-between gap-3 py-1.5 border-b border-line-soft last:border-b-0"><dt className="text-ink-soft">{l}</dt><dd className="font-semibold tabular-nums text-ink">{v}</dd></div>
                          ))}
                          {c.note && <div className="py-1.5 border-t border-line-soft"><dt className="text-ink-soft">Note</dt><dd className="text-ink whitespace-pre-wrap">{c.note}</dd></div>}
                          {counts.length > 1 && (
                            <div className="py-1.5 border-t border-line-soft"><dt className="text-ink-soft">Earlier counts</dt>
                              {counts.slice(1).map(x => <dd key={x.id} className="text-ink-muted tabular-nums">{new Date(x.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {x.closedBy} · counted {usd(x.countedCashCents)} · {overShort(x.differenceCents).label}</dd>)}
                            </div>
                          )}
                        </dl>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
