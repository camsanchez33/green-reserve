// EVENTS-2 (Cam 2026-11-09, his Events notes): the setup fits each kind, required fields go red where they are,
// Review has a purpose, and the event's page guides the course from saved to played.
// Run: npx tsx scripts/events-2-test.ts
import { readFileSync } from 'fs';
import { eventNextSteps, type StepsInput } from '../src/lib/event-command';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

const base: StepsInput = { payer: 'organizer', priceCents: 8500, heldCount: 18, toMove: 0, unheld: 0, onList: 0, ungrouped: 0, unpaid: 0, signupOpen: false, keptCents: 0, guaranteeDue: 'Nov 20', guaranteedAt: null, tasksOpen: 5, tasksOverdue: 0 };
const keys = (i: StepsInput) => eventNextSteps(i).map(s => s.key).join(',');
const next = (i: StepsInput) => eventNextSteps(i).find(s => !s.done)?.key;

// 1. Which steps apply follows who pays.
ok('organizer: hold, price, deposit, headcount, their list, pairings, checklist', keys(base) === 'hold,price,deposit,headcount,list,pairings,checklist', keys(base));
ok('…no headcount step when the course doesn\'t ask for one', !keys({ ...base, guaranteeDue: null }).includes('headcount'));
ok('players pay: hold, price, sign-up open, everyone paid, pairings, checklist', keys({ ...base, payer: 'players' }) === 'hold,price,signup,paid,pairings,checklist');
ok('an event made before the question (payer \'\'): the sign-up step, no "everyone paid"', keys({ ...base, payer: '' }) === 'hold,price,signup,pairings,checklist');

// 2. Done or not from the event's own state; the first not done is next.
ok('a fresh organizer event: the deposit is next', next(base) === 'deposit');
ok('no tee times made yet (weeks out): the hold is done — they are made held', eventNextSteps({ ...base, heldCount: 0 })[0].done);
ok('booked groups in the way: the hold is not done, and says so', (() => { const h = eventNextSteps({ ...base, toMove: 2 })[0]; return !h.done && h.detail === '2 booked groups in the way'; })());
ok('no price: price is next and opens Change details', (() => { const p = eventNextSteps({ ...base, priceCents: 0 })[1]; return !p.done && p.tab === 'edit' && next({ ...base, priceCents: 0 }) === 'price'; })());
ok('players pay: "Everyone paid" needs a list and nobody unpaid', (() => {
  const p = (i: Partial<StepsInput>) => eventNextSteps({ ...base, payer: 'players', ...i }).find(s => s.key === 'paid')!;
  return !p({ onList: 0 }).done && !p({ onList: 8, unpaid: 3 }).done && p({ onList: 8, unpaid: 0 }).done && p({ onList: 8, unpaid: 3 }).detail === '3 not paid';
})());
ok('pairings: done only when everyone on the list is in a group', !eventNextSteps({ ...base, onList: 8, ungrouped: 2 }).find(s => s.key === 'pairings')!.done && eventNextSteps({ ...base, onList: 8, ungrouped: 0 }).find(s => s.key === 'pairings')!.done);
ok('everything done: nothing next', next({ ...base, keptCents: 100, guaranteedAt: '2026-11-19', onList: 8, tasksOpen: 0 }) === undefined);

// 3. The page wiring.
const detail = read('src/components/dashboard/events/EventDetail.tsx');
ok('the page shows "Next up" from eventNextSteps on a live event', detail.includes('const steps = eventNextSteps({') && detail.includes('>Next up</h2>'));
ok('the event is in tabs: Overview · Players · Sign-up · Money · Checklist', detail.includes("['overview', 'Overview']") && detail.includes("['signup', 'Sign-up'], ['money', 'Money']") && detail.includes("['checklist', `Checklist"));
ok('parts stay mounted (hidden), and the Players part still prints from any tab', detail.includes("tab === k ? '' : 'hidden'") && detail.includes("(tab === 'players' ? '' : 'hidden print:block')"));
ok('"Everyone paid" counts a player with a link out as not paid (only paid is paid)', detail.includes("unpaid: onList.filter(p => stateOf(p) !== 'paid').length,"));
ok('Review\'s checklist dates never fall before today (the server clamps them too); editing loads the hold at once', read('src/components/dashboard/events/EventSetup.tsx').includes('due: due && due < today ? today : due') && read('src/components/dashboard/events/EventSetup.tsx').includes('useEffect(() => { if (eventId) loadPreview(); }, []);'));
ok('"Take payment" on the day view opens the Players tab first', detail.includes("setTab('players'); setTimeout(() => document.getElementById(`player-${p.id}`)"));

const setup = read('src/components/dashboard/events/EventSetup.tsx');
ok('each kind carries its own starting answers; a new event takes them', setup.includes("defaults: { format: 'shotgun', payer: 'organizer', guaranteeDaysBefore: '7' }") && setup.includes("defaults: { format: 'tee_times', payer: 'players'") && setup.includes('if (!eventId && k?.defaults)'));
ok('required fields go red under themselves (no line at the bottom for them)', setup.includes("const IN = (k: Field) => err[k] ? INPUT.replace('border-line', 'border-bad') : INPUT;") && setup.includes('<Msg k="name" />') && setup.includes('<Msg k="payer" />') && !setup.includes('setError(e); setStep(s)'));
ok('the organizer\'s one bill needs a name and a way to reach them', setup.includes("e.organizerName = 'Who is the bill for?'") && setup.includes('e.organizerContact ='));
ok('Review: the tee sheet first, details with Change, what is still missing, the checklist with dates', setup.includes('What saving does to the tee sheet') && setup.includes('<ChangeLink to={s} />') && setup.includes('Still to add') && setup.includes('The checklist it starts with'));
ok('the list reads Active, then Past', read('src/app/dashboard/events/page.tsx').includes('>Active</h2>') && read('src/app/dashboard/events/page.tsx').includes('>Past</h2>'));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('events-2: all passed');
