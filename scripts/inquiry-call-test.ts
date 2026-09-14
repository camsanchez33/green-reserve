// IC-1 §6 — three fake inquiries through queueSignal and stillNeed.
// Run: npx tsx scripts/inquiry-call-test.ts
import { queueSignal } from '../src/lib/inquiry-status';
import { stillNeed } from '../src/lib/inquiry-needs';

const now = new Date('2026-09-14T15:00:00Z');
const day = 86_400_000;
const base = { createdAt: new Date(now.getTime() - 3 * day), greenFeeRange: '', teeTimesPerDay: null, currentBookingMethod: '' };

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

// 1. pending, no review event, no call → not your move by call, and "needs" is empty (Not reviewed yet)
const pending = { ...base, status: 'pending', events: [], calls: [] };
const s1 = queueSignal(pending, now);
const n1 = stillNeed(pending, null, null, []);
check('pending + no call: needs is empty ("Not reviewed yet")', n1.length === 0, JSON.stringify(n1));
check('pending + no call: reason is the stage copy', !/call/i.test(s1.reason), s1.reason);

// 2. in review, call scheduled in 2 days → not your move, not stalled, reason names the call
const future = { ...base, status: 'in_review', events: [{ fromStatus: 'pending', toStatus: 'in_review', actorName: 'Admin', createdAt: new Date(now.getTime() - 20 * day) }], calls: [{ scheduledAt: new Date(now.getTime() + 2 * day), outcome: 'scheduled' }] };
const s2 = queueSignal(future, now);
check('future call: not your move', s2.yourMove === false, `${s2.yourMove}`);
check('future call: pressure is negative (not due)', s2.pressureDays < 0, `${s2.pressureDays}`);
check('future call: reason starts with "Call"', /^Call /.test(s2.reason), s2.reason);
check('future call: a 20-day-old stage does not read as stalled', !/review for/i.test(s2.reason), s2.reason);

// 3. overdue call (3 days ago, never logged) → your move, "Log the call"
const overdue = { ...future, calls: [{ scheduledAt: new Date(now.getTime() - 3 * day), outcome: 'scheduled' }] };
const s3 = queueSignal(overdue, now);
check('overdue call: your move', s3.yourMove === true, `${s3.yourMove}`);
check('overdue call: reason is "Log the call from …"', /^Log the call from/.test(s3.reason), s3.reason);
check('overdue call: pressure = days since the call', s3.pressureDays === 3, `${s3.pressureDays}`);

// 4. needs: details_requested with nothing answered lists the sheet and the open agenda items
const asked = { ...base, status: 'details_requested', events: [{ fromStatus: 'in_review', toStatus: 'details_requested', actorName: 'Admin', createdAt: now }] };
const n4 = stillNeed(asked, null, null, []);
check('details_requested: first need is the setup sheet', n4[0]?.key === 'sheet', JSON.stringify(n4.map(n => n.key)));
check('details_requested: people/fee_model are never "needed" from them', !n4.some(n => n.key === 'people' || n.key === 'fee_model'));

// 5. a logged call answers items
const logged = [{ scheduledAt: new Date(now.getTime() - day), outcome: 'talked', answersJson: JSON.stringify({ green_fees: '$62 wd / $85 we', cancellation: '24h, $10' }) }];
const n5 = stillNeed(asked, null, null, logged);
check('talked call: answered items drop out of needs', !n5.some(n => n.key === 'green_fees' || n.key === 'cancellation'), JSON.stringify(n5.map(n => n.key)));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
