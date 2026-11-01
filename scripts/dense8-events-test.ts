// DENSE-8 Events (Cam 2026-11-01: the list as a table with "Money owed" and "Open tasks"):
// the list shows what each event still owes, by the same sum as the event's own page.
// No database needed. Run: npx tsx scripts/dense8-events-test.ts
import { readFileSync } from 'fs';
import { eventMoney } from '../src/lib/event-payments';

let failed = 0;
const check = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

const route = read('src/app/api/operator/events/route.ts');
const detail = read('src/app/api/operator/events/[id]/route.ts');
check('the list loads each event\'s payments and works out what is owed with eventMoney', route.includes('payments: { select: { status: true, amountCents: true, refundedCents: true } },') && route.includes("owedCents: e.pricePerPlayerCents > 0 ? eventMoney({ ...e, entrants: _count.entrants }, payments).owedCents : 0,"));
check('…counting only players on the list, as the event page does', route.includes("_count: { select: { entrants: { where: { status: 'in' } }") && detail.includes("eventMoney({ ...event, entrants: event.entrants.filter(p => p.status === 'in').length }, event.payments)"));
check('…behind the same events.manage gate as the event page', route.includes("requirePermission(session, 'events.manage')"));

// The sum itself: $95 × 4 on the list, $190 paid, $95 refunded of it, a $95 link open → $285 still owed.
const m = eventMoney({ pricePerPlayerCents: 9500, finalHeadcount: null, players: 8, entrants: 4, payer: 'players' },
  [{ status: 'paid', amountCents: 19000, refundedCents: 9500 }, { status: 'open', amountCents: 9500, refundedCents: 0 }]);
check('owed = price × headcount − (paid − refunded); an unpaid link is not paid', m.owedCents === 28500, m);

const page = read('src/app/dashboard/events/page.tsx');
check('the list is a table: Event · Date · Players · Owed · To do', page.includes('<span>Event</span><span>Date</span><span>Players</span><span className="text-right">Owed</span><span>To do</span>'));
check('Owed is blank for a cancelled event or one with no price, "Paid" when nothing is owed', page.includes("e.status === 'cancelled' || !e.pricePerPlayerCents ? '' : e.owedCents ? <>{usd(e.owedCents)}<span className=\"sm:hidden\"> owed</span></> : 'Paid'"));
check('open and overdue tasks keep their dot', page.includes('label={`${e.tasksOverdue} overdue`}') && page.includes('label={`${e.tasksOpen} to do`}'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
