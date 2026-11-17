'use client';
// EVENTS-3 (Cam 2026-11-17; mockup lanes/dashboard/events-mockup.html, Players tab): the players in their groups.
// A search without placeholder words, Pair in list order, Email pairings, the print buttons and a bare plus to add
// players; each group is a card with a pencil to move its players; a player opens their own pop-up (contact, answers,
// group, payment, Swap and Remove). Everything the old players table did is here, in the pop-ups:
// - Swap (Events audit 10): a substitute takes the spot in place, so what was paid stays with it.
// - Paying (W2-9c): a player's own pay link, or "Paid at the course" (needs "Mark paid at the counter"), a captain
//   paying for their whole sign-up; a link already out is the one that gets closed, never a second charge.
// - The organizer's bill (EVENTS-1): which players it covers so far.
// Printing: the pairings sheet or a cart sign per group prints from any tab (the page keeps this part mounted).
import { useEffect, useState } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { formatTeeDay, formatTeeTime } from '@/lib/format';
import { STRIP_TERMS as T } from '@/lib/event-command';
import { Popup, PopupFoot, PenButton, PlusButton, Block, LINK, PRIMARY, FIELD, LABEL } from '@/components/dashboard/schedule/ui';
import { CartSigns } from './EventDay';
import type { EventData, EventPlayer } from './EventDetail';
import { KV, GroupIcon, MailIcon, PrintIcon, SearchIcon, TOOL, FIELD_SM, plural, RED_LINK } from './ui';

type Act = (key: string, body: Record<string, unknown>, done?: (r: EventData & Record<string, unknown>) => string) => Promise<boolean>;
type PayAct = (key: string, body: Record<string, unknown>, done?: (r: Record<string, unknown>) => string) => Promise<boolean>;
type PayState = 'paid' | 'paying' | 'sent' | 'none';
const NO_EMAIL = '@noemail.greenreserve.app';
const hasEmail = (p: EventPlayer) => !!p.email && !p.email.endsWith(NO_EMAIL);

export default function EventPlayers({ data, live, busy, act, payAct, canRecord, setError, onList, sortedGroups, ungrouped, startOf, stateOf, theirs, coveredIds, printWhat, printNow, openPlayer, setOpenPlayer, payFor, clearPayFor }: {
  data: EventData; live: boolean; busy: string; act: Act; payAct: PayAct; canRecord: boolean; setError: (s: string) => void;
  onList: EventPlayer[]; sortedGroups: [number, EventPlayer[]][]; ungrouped: EventPlayer[];
  startOf: (g: number, hole: number | null) => string; stateOf: (p: EventPlayer) => PayState; theirs: (p: EventPlayer) => EventData['event']['payments'];
  /** Organizer events with a price: the players the organizer's money covers so far; null = not shown. */
  coveredIds: Set<string> | null;
  printWhat: 'pairings' | 'signs'; printNow: (what: 'pairings' | 'signs') => void;
  openPlayer: string | null; setOpenPlayer: (id: string | null) => void;
  /** Event day "Take payment": open this player's "Paid at the course" straight away. */
  payFor: string | null; clearPayFor: () => void;
}) {
  const e = data.event;
  const playersPay = e.payer !== 'organizer';
  const shotgun = e.format === 'shotgun';
  const maxHole = Math.min(e.holes, data.courseHoles);
  const price = e.pricePerPlayerCents ? (e.pricePerPlayerCents / 100).toFixed(2) : '';
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [pairing, setPairing] = useState<number | null>(null);
  const [group, setGroup] = useState<{ g: number; hole: string; moves: Record<string, string> } | null>(null);
  const [swap, setSwap] = useState<{ name: string; email: string; phone: string } | null>(null);
  // team: a captain paying for their whole sign-up (Revamp 3 fix 10).
  const [paidHere, setPaidHere] = useState<{ amount: string; method: string; team?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  useEffect(() => {
    if (!payFor) return;
    setSwap(null); setPaidHere({ amount: price, method: 'cash' }); clearPayFor();
  }, [payFor, price, clearPayFor]);
  const unpaid = onList.filter(p => stateOf(p) === 'none').length;
  const questions = data.signup.questions;
  const match = (p: EventPlayer) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase());
  const player = openPlayer ? onList.find(p => p.id === openPlayer) ?? null : null;
  const closePlayer = () => { setOpenPlayer(null); setSwap(null); setPaidHere(null); };
  const groupNos = sortedGroups.map(([g]) => g);
  const nextGroup = (groupNos.length ? Math.max(...groupNos) : 0) + 1;

  const status = (p: EventPlayer) => {
    if (coveredIds) return coveredIds.has(p.id) ? <StatusDot status="ok" label={T.covered.label} /> : <StatusDot status="warn" label={T.notCovered.label} />;
    if (!playersPay) return null;
    const st = stateOf(p);
    return st === 'paid' ? <StatusDot status="ok" label="Paid" /> : st === 'paying' ? <StatusDot status="warn" label="Paying now" /> : st === 'sent' ? <StatusDot status="warn" label="Link sent" /> : <StatusDot status="warn" label="Not paid" />;
  };
  const playerBtn = (p: EventPlayer) => (
    <button key={p.id} type="button" id={`player-${p.id}`} onClick={() => { setOpenPlayer(p.id); setSwap(null); setPaidHere(null); }}
      className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 min-h-[38px] border-t border-line text-[13.5px] text-ink hover:bg-paper">
      <span className="truncate">{p.name}</span><span className="text-[12.5px] shrink-0">{status(p)}</span>
    </button>
  );

  async function saveGroup() {
    if (!group) return;
    const members = sortedGroups.find(([g]) => g === group.g)?.[1] ?? [];
    const hole = group.hole === '' ? null : Number(group.hole);
    for (const p of members) {
      const to = group.moves[p.id] === '' ? null : Number(group.moves[p.id] ?? p.groupNo);
      const startHole = to === group.g ? (shotgun ? hole : p.startHole) : p.startHole;
      if (to === p.groupNo && startHole === p.startHole) continue;
      if (!(await act('set:' + p.id, { action: 'player_set', playerId: p.id, groupNo: to, startHole }))) return;
    }
    setGroup(null);
  }

  return (
    <div className="flex flex-col">
      <div className="print:hidden flex flex-wrap items-center gap-2 pt-3.5 pb-2.5">
        <label className="flex items-center gap-2 border border-line bg-paper rounded-[10px] px-2.5 text-ink-muted max-md:flex-[1_1_100%] md:min-w-[220px]">
          <SearchIcon />
          <input aria-label="Search players" value={q} onChange={ev => setQ(ev.target.value)} className="w-full bg-transparent border-0 outline-none py-[9px] text-[13.5px] text-ink" />
        </label>
        <span className="flex-1" />
        {live && onList.length > 0 && <button type="button" className={TOOL} disabled={!!busy} onClick={() => setPairing(4)}><GroupIcon /><span className="max-md:hidden">Pair in list order</span><span className="md:hidden sr-only">Pair in list order</span></button>}
        {live && sortedGroups.length > 0 && (
          <button type="button" className={TOOL} disabled={!!busy} onClick={() => act('send', { action: 'pairings_send' }, r => {
            const sent = Number(r.sent ?? 0); const failed = (r.failed as string[] | undefined) ?? []; const none = Number(r.noEmail ?? 0); const notSent = (r.notSent as string[] | undefined) ?? [];
            return [`Emailed ${plural(sent, 'player')} their group.`, notSent.length ? `Ran out of time before emailing ${notSent.join(', ')}. Press it again for them, or print theirs.` : '', failed.length ? `Couldn’t reach ${failed.join(', ')}. Try again or print theirs.` : '', none ? `${none} without an email: give them a printed copy.` : ''].filter(Boolean).join(' ');
          })}><MailIcon /><span className="max-md:sr-only">{busy === 'send' ? 'Emailing…' : 'Email pairings'}</span></button>
        )}
        {sortedGroups.length > 0 && <>
          <button type="button" className={TOOL} onClick={() => printNow('pairings')}><PrintIcon /><span className="max-md:sr-only">Print pairings</span></button>
          <button type="button" className={TOOL} onClick={() => printNow('signs')}><PrintIcon /><span className="max-md:sr-only">Cart signs</span></button>
        </>}
        {live && <PlusButton label="Add players" onClick={() => setAdding('')} />}
      </div>

      {/* Cam 2026-10-24: players pay on the event's page, whose link the organizer passes on. */}
      {live && e.payer === 'players' && (
        <div className="print:hidden flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pb-3 text-[13px] text-ink-soft">
          <span className="flex-1 min-w-[16em]">
            {e.signupOpen ? `Players ${e.signupPay === 'now' ? 'sign up and pay' : 'sign up'} on the event’s page. Send its link to the organizer to pass on.` : 'Players sign up on the event’s page once it’s open (Sign-up tab).'}
            {unpaid > 0 && ` ${plural(unpaid, 'player')} on the list ${unpaid === 1 ? 'hasn’t' : 'haven’t'} paid: open a player to send their own link or take it at the course.`}
          </span>
          {e.signupOpen && <button type="button" className={LINK} onClick={async () => { try { await navigator.clipboard.writeText(data.signup.url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); } catch { setError('Couldn’t copy. See the Sign-up tab.'); } }}>{linkCopied ? 'Copied' : 'Copy the link'}</button>}
        </div>
      )}

      {/* What prints: the pairings sheet alone, or a cart sign per group. */}
      {printWhat === 'signs' && <CartSigns eventName={e.name} groups={sortedGroups} startOf={startOf} />}
      <div className={'hidden mb-4 ' + (printWhat === 'signs' ? '' : 'print:block')}>
        <h1 className="font-serif text-[26px] font-semibold text-ink">{e.name}</h1>
        <p className="text-[14px] text-ink">{formatTeeDay(e.date)} · {shotgun ? `Shotgun at ${formatTeeTime(e.startTime)}` : `Tee times from ${formatTeeTime(e.startTime)}`}</p>
      </div>

      {sortedGroups.length > 0 && (
        <div className={'grid sm:grid-cols-2 xl:grid-cols-3 gap-3 print:grid-cols-3' + (printWhat === 'signs' ? ' print:hidden' : '')}>
          {sortedGroups.map(([g, ps]) => {
            const shown = ps.filter(match);
            if (q.trim() && !shown.length) return null;
            const start = startOf(g, ps[0]?.startHole ?? null);
            return (
              <div key={g} className="border border-line rounded-[12px] overflow-hidden break-inside-avoid">
                <div className="flex items-center gap-2 pl-3 pr-1.5 py-1.5">
                  <b className="text-[13.5px] font-semibold text-ink">{shotgun && ps[0]?.startHole ? `Hole ${start.split('hole ')[1] ?? ps[0].startHole}` : shotgun ? formatTeeTime(e.startTime) : start}</b>
                  <span className="text-[12.5px] text-ink-muted">Group {g}</span>
                  <span className="flex-1" />
                  {live && <span className="print:hidden"><PenButton label={`Edit group ${g}`} onClick={() => setGroup({ g, hole: ps[0]?.startHole != null ? String(ps[0].startHole) : '', moves: {} })} /></span>}
                </div>
                <div className="print:hidden">{shown.map(playerBtn)}</div>
                <ul className="hidden print:block px-3 pb-2 text-[13.5px] text-ink">{ps.map(p => <li key={p.id}>{p.name}</li>)}</ul>
              </div>
            );
          })}
        </div>
      )}

      {ungrouped.length > 0 && (
        <div className="print:hidden mt-3">
          <h3 className="px-1 pt-2 pb-1.5 text-[12px] font-semibold text-ink-muted">{sortedGroups.length ? 'Not in a group yet' : 'On the list'} · {ungrouped.length}</h3>
          <div className="border border-line rounded-[12px] overflow-hidden [&>button:first-child]:border-t-0">{ungrouped.filter(match).map(playerBtn)}</div>
        </div>
      )}
      {onList.length === 0 && <p className="print:hidden px-1 py-4 text-[13.5px] text-ink-muted">No players on the list yet.{live ? ' Add them with the plus, or open the sign-up page.' : ''}</p>}
      {live && sortedGroups.length > 0 && (
        <button type="button" disabled={!!busy} className={LINK + ' print:hidden self-start mt-3 ml-1'} onClick={() => act('clear', { action: 'pairings_clear' }, () => 'Groups cleared.')}>Clear groups</button>
      )}

      {adding !== null && (
        <Popup title="Add players" onClose={() => setAdding(null)}>
          <label className={LABEL}>One per line: name, email, phone
            <textarea rows={6} className={FIELD} value={adding} onChange={ev => setAdding(ev.target.value)} />
          </label>
          <p className="text-[12.5px] text-ink-muted">Only the name is needed. They go on the list in this order.</p>
          <PopupFoot onCancel={() => setAdding(null)}>
            <button type="button" className={PRIMARY} disabled={!!busy || !adding.trim()} onClick={async () => { if (await act('players_add', { action: 'players_add', text: adding }, () => 'Players added.')) setAdding(null); }}>
              {busy === 'players_add' ? 'Adding…' : 'Add players'}
            </button>
          </PopupFoot>
        </Popup>
      )}

      {pairing !== null && (
        <Popup title="Pair in list order" onClose={() => setPairing(null)}>
          <p className="text-[13.5px] text-ink-soft">Groups the players in list order. People who signed up together stay together.{sortedGroups.length ? ' The groups you have now are replaced.' : ''}</p>
          <label className={LABEL + ' max-w-[200px]'}>Players in a group
            <select className={FIELD} value={pairing} onChange={ev => setPairing(Number(ev.target.value))}>{[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <PopupFoot onCancel={() => setPairing(null)}>
            <button type="button" className={PRIMARY} disabled={!!busy} onClick={async () => { if (await act('auto', { action: 'pairings_auto', size: pairing }, () => 'Grouped in list order; sign-ups stay together.')) setPairing(null); }}>
              {busy === 'auto' ? 'Pairing…' : 'Pair them'}
            </button>
          </PopupFoot>
        </Popup>
      )}

      {group && (() => {
        const members = sortedGroups.find(([g]) => g === group.g)?.[1] ?? [];
        return (
          <Popup title={`Group ${group.g}`} onClose={() => setGroup(null)}>
            {shotgun && (
              <label className={LABEL + ' max-w-[160px]'}>Starting hole
                <input type="number" min={1} max={maxHole} inputMode="numeric" className={FIELD} value={group.hole} onChange={ev => setGroup({ ...group, hole: ev.target.value })} />
              </label>
            )}
            <Block label="Players">
              {members.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 text-[13.5px]">
                  <span className="text-ink truncate">{p.name}</span>
                  <select aria-label={`Group for ${p.name}`} className={FIELD_SM} value={group.moves[p.id] ?? String(p.groupNo ?? '')} onChange={ev => setGroup({ ...group, moves: { ...group.moves, [p.id]: ev.target.value } })}>
                    {[...groupNos, nextGroup].map(n => <option key={n} value={String(n)}>{n === nextGroup ? `New group ${n}` : `Group ${n}`}</option>)}
                    <option value="">No group</option>
                  </select>
                </div>
              ))}
            </Block>
            <PopupFoot onCancel={() => setGroup(null)}>
              <button type="button" className={PRIMARY} disabled={!!busy} onClick={saveGroup}>{busy.startsWith('set:') ? 'Saving…' : 'Save pairing'}</button>
            </PopupFoot>
          </Popup>
        );
      })()}

      {player && (() => {
        const p = player;
        const st = stateOf(p);
        const openLink = theirs(p).find(x => x.status === 'open');
        // Their sign-up's other players with nothing paid or sent: a captain can pay for all of them.
        const team = p.groupKey ? onList.filter(o => o.groupKey === p.groupKey && stateOf(o) === 'none') : [];
        const answers = questions.filter(x => p.answers?.[x.id]);
        return (
          <Popup title={p.name} onClose={closePlayer}>
            {swap ? (
              <Block label="Who takes the spot">
                <p className="text-[12.5px] text-ink-muted -mt-1">The spot keeps its group, hole and anything paid for it.</p>
                <label className={LABEL}>Name<input className={FIELD} value={swap.name} onChange={ev => setSwap({ ...swap, name: ev.target.value })} /></label>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className={LABEL}>Email<input type="email" className={FIELD} value={swap.email} onChange={ev => setSwap({ ...swap, email: ev.target.value })} /></label>
                  <label className={LABEL}>Phone<input type="tel" className={FIELD} value={swap.phone} onChange={ev => setSwap({ ...swap, phone: ev.target.value })} /></label>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" className={LINK} onClick={() => setSwap(null)}>Back</button>
                  <span className="flex-1" />
                  <button type="button" className={PRIMARY} disabled={!!busy || !swap.name.trim()} onClick={async () => {
                    if (await act('swap' + p.id, { action: 'player_edit', playerId: p.id, name: swap.name, email: swap.email, phone: swap.phone }, () => `${swap.name.trim()} has the spot.`)) closePlayer();
                  }}>{busy === 'swap' + p.id ? 'Saving…' : 'Save'}</button>
                </div>
              </Block>
            ) : <>
              <div>
                <KV k="Email">{hasEmail(p) ? p.email : '—'}</KV>
                <KV k="Phone">{p.phone || '—'}</KV>
                {answers.map(x => <KV key={x.id} k={x.label}>{p.answers[x.id]}</KV>)}
                <KV k="Group">{p.groupNo != null ? `Group ${p.groupNo} · ${startOf(p.groupNo, p.startHole)}` : 'Not in a group yet'}</KV>
                {coveredIds && <KV k="Organizer’s bill">{coveredIds.has(p.id) ? 'Covers this player' : 'Doesn’t reach this player yet'}</KV>}
                {playersPay && <KV k="Payment">{status(p)}</KV>}
              </div>

              {playersPay && live && st !== 'paid' && st !== 'paying' && (
                paidHere ? (
                  <Block label="Paid at the course">
                    {!openLink && team.length > 1 && (
                      <label className="flex items-center gap-2 text-[13.5px] text-ink"><input type="checkbox" checked={!!paidHere.team}
                        onChange={ev => setPaidHere({ ...paidHere, team: ev.target.checked, amount: price ? (Number(price) * (ev.target.checked ? team.length : 1)).toFixed(2) : paidHere.amount })} />For all {team.length} in their sign-up</label>
                    )}
                    <div className="grid sm:grid-cols-2 gap-3">
                      {/* With a link out, it's that link that gets paid — its amount, not a new one. */}
                      {openLink
                        ? <p className="text-[13px] text-ink-soft self-end">Closes their {`$${(openLink.amountCents / 100).toFixed(2)}`} link.</p>
                        : <label className={LABEL}>Amount<input inputMode="decimal" className={FIELD} value={paidHere.amount} onChange={ev => setPaidHere({ ...paidHere, amount: ev.target.value })} /></label>}
                      <label className={LABEL}>How they paid
                        <select className={FIELD} value={paidHere.method} onChange={ev => setPaidHere({ ...paidHere, method: ev.target.value })}>
                          <option value="cash">Cash</option><option value="check">Check</option><option value="card_counter">Card at the course</option><option value="other">Other</option>
                        </select>
                      </label>
                    </div>
                    <p className="text-[12.5px] text-ink-muted">Nothing is charged. This records money the course already took.</p>
                    <div className="flex items-center gap-3">
                      <button type="button" className={LINK} onClick={() => setPaidHere(null)}>Back</button>
                      <span className="flex-1" />
                      <button type="button" className={PRIMARY} disabled={!!busy || (!openLink && !paidHere.amount)} onClick={async () => {
                        // A link they were sent is closed first, so they can't pay twice.
                        const ok = openLink
                          ? await payAct('here' + p.id, { action: 'paid_other', paymentId: openLink.id, method: paidHere.method }, () => `${p.name} marked paid; their link was closed.`)
                          : await payAct('here' + p.id, { action: 'record', playerId: p.id, amount: paidHere.amount, method: paidHere.method, forGroup: !!paidHere.team }, () => paidHere.team ? `${p.name} paid for ${team.length}.` : `${p.name} marked paid.`);
                        if (ok) setPaidHere(null);
                      }}>{busy === 'here' + p.id ? 'Saving…' : 'Mark paid'}</button>
                    </div>
                  </Block>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {st === 'sent' && openLink?.payUrl && <button type="button" className={LINK} onClick={async () => { try { await navigator.clipboard.writeText(openLink.payUrl!); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError('Couldn’t copy. Open Payments to see the link.'); } }}>{copied ? 'Copied' : 'Copy their link'}</button>}
                    {st === 'none' && (hasEmail(p) || p.phone.replace(/\D/g, '').length >= 10) && (
                      <button type="button" className={LINK} disabled={!!busy || !price} title={price ? undefined : 'Set a price per player first'}
                        onClick={() => payAct('link' + p.id, { action: 'link', playerId: p.id, amount: price, via: hasEmail(p) ? 'email' : 'sms' }, r => r.sent ? `Pay link sent to ${p.name}.` : `Link made for ${p.name}, but it didn’t send${r.sendError ? `: ${String(r.sendError)}` : ''}. Copy it from their pop-up.`)}>
                        {busy === 'link' + p.id ? 'Sending…' : 'Send their pay link'}
                      </button>
                    )}
                    {canRecord && <button type="button" className={LINK} onClick={() => setPaidHere({ amount: price, method: 'cash' })}>Paid at the course</button>}
                  </div>
                )
              )}

              <div className="flex items-center gap-3 pt-1">
                {live && <button type="button" disabled={!!busy} className={RED_LINK} onClick={() => {
                  // What they paid stays on the event either way; say so before the spot goes.
                  if (playersPay && st === 'paid' && !confirm(`${p.name} has paid; the money stays on the event. For a substitute, use Swap. Remove anyway?`)) return;
                  act('del:' + p.id, { action: 'player_remove', playerId: p.id }, () => `${p.name} removed.`).then(ok => { if (ok) closePlayer(); });
                }}>{busy === 'del:' + p.id ? 'Removing…' : 'Remove'}</button>}
                <span className="flex-1" />
                {live && <button type="button" className={LINK} onClick={() => setSwap({ name: p.name, email: hasEmail(p) ? p.email : '', phone: p.phone })}>Swap</button>}
                <button type="button" className={LINK} onClick={closePlayer}>Close</button>
              </div>
            </>}
          </Popup>
        );
      })()}
    </div>
  );
}
