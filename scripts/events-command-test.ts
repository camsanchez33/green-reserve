// EVENTS-1 (Cam 2026-11-04, "events command center"; per player: "Covered count"):
//  1. the strip: registered of the spots offered, spots left (online sign-ups still paying hold a
//     spot), collected and owed from eventMoney(), pay links out, tasks left, overdue, next due;
//  2. an organizer's bill covers whole players, never more than the list, nothing without a price;
//  3. the event page shows the strip on a live event and, for an organizer event, Covered / Not
//     covered yet per player in list order.
// Run: npx tsx scripts/events-command-test.ts
import { readFileSync } from 'fs';
import { eventStrip, coveredCount } from '../src/lib/event-command';
import { eventMoney } from '../src/lib/event-payments';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

const money = eventMoney({ pricePerPlayerCents: 8000, finalHeadcount: null, players: 72, entrants: 60, payer: 'organizer', guaranteedPlayers: null },
  [{ status: 'paid', amountCents: 200000, refundedCents: 10000 }, { status: 'open', amountCents: 50000, refundedCents: 0 }]);
const s = eventStrip({ capacity: 72, onList: 60, holding: 4, money, today: '2026-11-04',
  tasks: [{ doneAt: null, dueDate: '2026-11-01' }, { doneAt: null, dueDate: '2026-11-09' }, { doneAt: null, dueDate: '2026-11-06' }, { doneAt: '2026-11-02T10:00:00Z', dueDate: '2026-10-30' }, { doneAt: null, dueDate: null }] });
ok('registered of the spots offered; spots left count sign-ups still paying', s.registered === 60 && s.capacity === 72 && s.spotsLeft === 8, s);
ok('collected is what was kept, owed is the total less it, pay links out are the open ones', s.collectedCents === 190000 && s.owedCents === 60 * 8000 - 190000 && s.sentCents === 50000, s);
ok('tasks: four left, one overdue, the next one due is the earliest not past', s.tasksLeft === 4 && s.overdue === 1 && s.nextDue === '2026-11-06', s);
ok('no cap set: no spots-left figure', eventStrip({ capacity: 0, onList: 3, holding: 0, money, tasks: [], today: '2026-11-04' }).spotsLeft === null);
ok('never fewer than no spots left', eventStrip({ capacity: 10, onList: 9, holding: 3, money, tasks: [], today: '2026-11-04' }).spotsLeft === 0);

ok('the bill covers whole players', coveredCount(190000, 8000, 60) === 23);
ok('…never more than the list', coveredCount(10_000_000, 8000, 60) === 60);
ok('…nothing without a price or money', coveredCount(190000, 0, 60) === 0 && coveredCount(0, 8000, 60) === 0 && coveredCount(-5, 8000, 60) === 0);

const page = readFileSync('src/components/dashboard/events/EventDetail.tsx', 'utf8');
ok('the strip sits on a live event, from the same money as the Money card', page.includes('{live && (() => {') && page.includes('money: data.money, tasks: e.tasks, today })'));
ok('organizer events: Covered / Not covered yet per player, in list order', page.includes("const orgPays = e.payer === 'organizer';")
  && page.includes('coveredCount(data.money.keptCents, e.pricePerPlayerCents, onList.length)')
  && page.includes('listOrder.slice(0, covered)') && page.includes('<StatusDot status="ok" label={T.covered.label} />'));
ok('players-pay events keep their own Paid column', page.includes('{playersPay && <th className="py-2 pr-3 font-medium">Paid</th>}'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
