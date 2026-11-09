'use client';
// POS-3 R4 (Cam 2026-10-24): close out the register at the end of the day, on
// the Pro shop page. The day's figures come from the server (lib/register-close
// .ts); staff enter the starting cash and what they counted, see over or short,
// and save the count. A recount adds a new count — the latest stands.
// Revamp 3 dead end 24 (Cam 2026-10-29): a blind count — the day's cash figures and
// what should be in the drawer show only once the count is saved, so nobody counts to
// match; starting cash carries over from the last close-out; any of the last two weeks.
// (Shown in the browser only after counting; the route still returns them for the reveal.)
import { LEDGER_WHAT } from '@/lib/ledger-words';
import { OpenRegister } from '@/components/dashboard/OpenRegister';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
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
type Close = { id: string; day: string; openingFloatCents: number; expectedCashCents: number; countedCashCents: number; differenceCents: number; note: string; closedBy: string; createdAt: string };

const usd = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;
const toCents = (v: string) => { const n = Number(v.replace(/[$,\s]/g, '')); return v.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };
const dayLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const overShort = (d: number) => (d === 0 ? { label: 'Even', tone: 'ok' as const } : d > 0 ? { label: `Over ${usd(d)}`, tone: 'warn' as const } : { label: `Short ${usd(-d)}`, tone: 'bad' as const });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// POS-5 (Cam 2026-11-08): on the Close out tab it opens straight to the count. The count stays BLIND (Cam: "shouldn't be
// live so like it's more secure") — what the drawer should hold shows only once the count is saved.
// Bills & coins: count each denomination and the total adds itself up (the same countedCashCents is saved).
const NOTES: [number, string][] = [[10000, '$100'], [5000, '$50'], [2000, '$20'], [1000, '$10'], [500, '$5'], [100, '$1'], [25, '25¢'], [10, '10¢'], [5, '5¢'], [1, '1¢']];

export function RegisterClose({ page = false }: { page?: boolean } = {}) {
  const [openState, setOpen] = useState(false);
  const open = page || openState;
  const access = useDashboardAccess();
  const [by, setBy] = useState<'total' | 'notes'>('total');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [day, setDay] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Close[]>([]);
  const [loadError, setLoadError] = useState('');
  const [float, setFloat] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Close | null>(null);
  // POS-7: the day's locked starting cash, when the register was opened (null = type it here, as before).
  const [opened, setOpened] = useState<number | null>(null);

  const load = useCallback(async (d?: string) => {
    setLoadError('');
    const r = await dfetch<{ summary: Summary; recent: Close[]; opened?: { startingCashCents: number } | null }>(`/api/operator/register-close${d ? `?day=${d}` : ''}`);
    if (!r.ok) { setLoadError(r.error); return; }
    setSummary(r.data.summary); setRecent(r.data.recent); setDay(r.data.summary.day);
    setOpened(r.data.opened ? r.data.opened.startingCashCents : null);
    // The drawer usually starts each day with the same float: offer the last one used.
    const last = r.data.recent[0];
    if (last) setFloat(f => f || (last.openingFloatCents / 100).toFixed(2));
  }, []);

  useEffect(() => { if (page) load(); }, [page, load]);
  const notesCents = NOTES.reduce((s, [v]) => { const n = Number(notes[v] ?? ''); return s + (Number.isInteger(n) && n > 0 ? n * v : 0); }, 0);
  // Any count typed — zeros too — is a count (an empty drawer can be closed out); nothing typed yet is no count.
  const notesTyped = Object.values(notes).some(v => v !== '');
  useEffect(() => { if (by === 'notes') setCounted(notesTyped ? (notesCents / 100).toFixed(2) : ''); }, [by, notesCents, notesTyped]);

  async function close() {
    if (!summary) return;
    setBusy(true); setError(''); setSaved(null);
    const r = await dfetch<{ close: Close }>('/api/operator/register-close', {
      method: 'POST', body: JSON.stringify({ day: summary.day, openingFloatCents: toCents(float) ?? 0, countedCashCents: toCents(counted), note }),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setSaved(r.data.close); setNote(''); setNotes({});
    load(summary.day); // the figures may have moved since the page loaded; show what was saved
  }

  const floatCents = opened ?? toCents(float) ?? 0;
  // POS-7: today, a login that can open the register opens it before counting (the count starts from it).
  const needsOpen = !!summary && summary.day === summary.today && opened === null && access.can('shop.open');
  const countedCents = toCents(counted);
  const expected = summary ? floatCents + summary.cashTakenCents : 0;
  const diff = countedCents === null ? null : countedCents - expected;
  const dayCloses = recent.filter(c => c.day === summary?.day);
  // A day already counted shows its figures (a recount compares against them); otherwise only after saving.
  const revealed = !!summary && (dayCloses.length > 0 || saved?.day === summary.day);

  return (
    <Card className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold text-ink">Close out the day</h2>
        {!open && !page
          ? <button type="button" onClick={() => { setOpen(true); load(); }} className="text-[13px] text-pine font-medium hover:underline">Count the drawer</button>
          : summary && (
            <input type="date" aria-label="Day" value={day ?? summary.day} min={addDaysStr(summary.today, -13)} max={summary.today}
              onChange={e => { if (e.target.value) { setSaved(null); setCounted(''); setNotes({}); load(e.target.value); } }} className={INPUT} />
          )}
      </div>
      {open && (
        <div className="px-5 pb-5">
          {loadError && <p className="text-sm text-bad" role="alert">{loadError} <button type="button" onClick={() => load(day)} className="underline font-medium">Try again</button></p>}
          {!summary && !loadError && <p className="text-sm text-ink-muted">Adding up the day…</p>}
          {summary && (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-[13.5px] font-semibold text-ink mb-2">Count the drawer</h3>
                {/* POS-7: opened today → the locked amount (Change for shop.open_fix); a past day opened → its amount; else type it. */}
                {summary.day === summary.today && (opened !== null || access.can('shop.open'))
                  ? <OpenRegister where="close" onOpened={c => setOpened(c)} />
                  : <label className="block text-[13px] text-ink">Starting cash
                      <div className="relative mt-1 max-w-[12rem]"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                        {/* A past day the register was opened: its locked amount, read-only. */}
                        <input value={opened !== null ? (opened / 100).toFixed(2) : float} readOnly={opened !== null} onChange={e => setFloat(e.target.value)} inputMode="decimal" placeholder="0.00" className={INPUT + ' w-full pl-6' + (opened !== null ? ' opacity-70' : '')} /></div>
                    </label>}
                <div className="mt-4 inline-flex gap-1 p-1 rounded-[7px] bg-page" role="group" aria-label="Count by">
                  {([['total', 'Total'], ['notes', 'Bills & coins']] as const).map(([k, l]) => (
                    <button key={k} type="button" aria-pressed={by === k} onClick={() => setBy(k)}
                      className={'px-3 min-h-[32px] rounded-[5px] text-[13px] ' + (by === k ? 'bg-white text-ink font-semibold shadow-card' : 'text-ink-soft hover:text-ink')}>{l}</button>
                  ))}
                </div>
                {by === 'total' ? (
                  <label className="mt-3 block text-[13px] text-ink">Cash counted
                    <div className="relative mt-1 max-w-[12rem]"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                      <input value={counted} onChange={e => setCounted(e.target.value)} inputMode="decimal" placeholder="0.00" className={INPUT + ' w-full pl-6'} /></div>
                  </label>
                ) : (
                  <div className="mt-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {NOTES.map(([v, l]) => (
                        <label key={v} className="flex items-center gap-2 rounded-[7px] border border-line px-2.5 py-1.5 text-[13px] text-ink">
                          <span className="w-9 shrink-0 tabular-nums">{l}</span>
                          <input value={notes[v] ?? ''} onChange={e => setNotes(n => ({ ...n, [v]: e.target.value.replace(/\D/g, '').slice(0, 5) }))} inputMode="numeric" placeholder="0" aria-label={`How many ${l}`} className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none" />
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-[14px] text-ink">Counted <b className="tabular-nums">${(notesCents / 100).toFixed(2)}</b></p>
                  </div>
                )}
                {revealed && (
                  <ul className="mt-3 divide-y divide-line-soft text-sm">
                    <li className="flex justify-between py-2"><span className="text-ink">Should be in the drawer</span><span className="tabular-nums font-semibold">{usd(expected)}</span></li>
                    <li className="flex justify-between py-2"><span className="text-ink">Counted</span>{diff === null ? <span className="text-ink-muted">—</span> : <StatusDot status={overShort(diff).tone} label={overShort(diff).label} />}</li>
                  </ul>
                )}
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Note (optional)" aria-label="Note" className={INPUT + ' w-full mt-3'} />
                {needsOpen && <p className="mb-2 text-[12.5px] text-warn">Open the register first.</p>}
                <button type="button" onClick={close} disabled={busy || countedCents === null || needsOpen}
                  className="mt-3 w-full bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-sm py-2.5 disabled:opacity-50">
                  {busy ? 'Saving…' : dayCloses.length ? 'Save this recount' : `Close out ${summary.day === summary.today ? 'today' : dayLabel(summary.day)}`}
                </button>
                {error && <p className="mt-2 text-[13px] text-bad" role="alert">{error}</p>}
                {saved && <p className="mt-2 text-[13px] text-ok flex items-center gap-1.5"><StatusDot status="ok" />Saved — {overShort(saved.differenceCents).label.toLowerCase()} against {usd(saved.expectedCashCents)} expected.</p>}
              </div>
              <div>
                {!revealed ? (
                  <p className="text-[13.5px] text-ink-soft">Count first; the day&apos;s cash shows after.</p>
                ) : <>
                <h3 className="text-[13.5px] font-semibold text-ink mb-1">Cash, {dayLabel(summary.day)}</h3>
                <ul className="divide-y divide-line-soft text-sm">
                  <li className="flex justify-between py-2"><span className="text-ink">Cash sales at the register <span className="text-ink-muted">· {plural(summary.cashSales.count, 'sale')}</span></span><span className="tabular-nums">{usd(summary.cashSales.cents)}</span></li>
                  {summary.cashSales.roundsCents > 0 && <li className="flex justify-between py-1.5 pl-3 text-[12.5px] text-ink-soft"><span>Shop items {usd(summary.cashSales.itemsCents)} · green fees {usd(summary.cashSales.roundsCents)}</span></li>}
                  {(summary.cashSales.untaxed ?? 0) > 0 && <li className="py-1.5 pl-3 text-[12.5px] text-warn">{plural(summary.cashSales.untaxed ?? 0, 'sale')} taken without sales tax</li>}
                  {/* CASH-1: every counter payment is now a register sale; this is only older records' "paid at the counter". */}
                  {summary.counterRounds.count > 0 && <li className="flex justify-between py-2"><span className="text-ink">Marked paid at the counter (no tender recorded) <span className="text-ink-muted">· {plural(summary.counterRounds.count, 'group')}</span></span><span className="tabular-nums">{usd(summary.counterRounds.cents)}</span></li>}
                  {(summary.otherCash?.count ?? 0) > 0 && <li className="flex justify-between py-2"><span className="text-ink">Cash dues and events <span className="text-ink-muted">· {summary.otherCash!.count}</span></span><span className="tabular-nums">{usd(summary.otherCash!.cents)}</span></li>}
                  <li className="flex justify-between py-2"><span className="text-ink">Cash refunds <span className="text-ink-muted">· {summary.cashRefunds.count}</span></span><span className="tabular-nums">{usd(-summary.cashRefunds.cents)}</span></li>
                  <li className="flex justify-between py-2 font-semibold text-ink"><span>Cash taken</span><span className="tabular-nums">{usd(summary.cashTakenCents)}</span></li>
                </ul>
                {summary.counterRounds.count > 0 && <p className="text-[12.5px] text-ink-muted mt-2">Counted as cash.</p>}
                {/* Launch walk (Cam 2026-10-31): each cash payment, so a short drawer can be traced. */}
                {(summary.cashMoves?.length ?? 0) > 0 && (
                  <details className="mt-3 text-[13px]">
                    <summary className="cursor-pointer text-pine font-medium">Cash payments · {summary.cashMoves!.length}</summary>
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
                </>}
                <h3 className="text-[13.5px] font-semibold text-ink mt-5 mb-1">Card, for reference</h3>
                <ul className="divide-y divide-line-soft text-sm">
                  <li className="flex justify-between py-2"><span className="text-ink">Shop sales by card</span><span className="tabular-nums">{usd(summary.card.shopCents)}</span></li>
                  <li className="flex justify-between py-2"><span className="text-ink">Rounds paid by card</span><span className="tabular-nums">{usd(summary.card.roundsCents)}</span></li>
                  {summary.card.refundsCents > 0 && <li className="flex justify-between py-2"><span className="text-ink">Shop card refunds</span><span className="tabular-nums">{usd(-summary.card.refundsCents)}</span></li>}
                </ul>
                <p className="text-[12.5px] text-ink-muted mt-2">Card goes to Stripe — nothing to count.</p>
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div className="mt-6">
              <h3 className="text-[13.5px] font-semibold text-ink mb-1">Recent close-outs</h3>
              <table className="w-full text-[13.5px]">
                <thead><tr className="text-left text-ink-muted"><th className="font-normal py-1.5">Day</th><th className="font-normal">Expected</th><th className="font-normal">Counted</th><th className="font-normal">Over or short</th><th className="font-normal hidden md:table-cell">By</th></tr></thead>
                <tbody className="divide-y divide-line-soft">
                  {recent.map((c, i) => {
                    // The latest count of a day stands; earlier ones are kept as recounted.
                    const superseded = recent.findIndex(x => x.day === c.day) !== i;
                    const os = overShort(c.differenceCents);
                    return (
                      <tr key={c.id} className={superseded ? 'text-ink-muted' : 'text-ink'}>
                        <td className="py-2">{dayLabel(c.day)}{superseded ? ' (recounted)' : ''}</td>
                        <td className="tabular-nums">{usd(c.expectedCashCents)}</td>
                        <td className="tabular-nums">{usd(c.countedCashCents)}</td>
                        <td>{superseded ? os.label : <StatusDot status={os.tone} label={os.label} />}{c.note ? <span className="block text-[12px] text-ink-muted">{c.note}</span> : null}</td>
                        <td className="hidden md:table-cell text-ink-muted">{c.closedBy}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
