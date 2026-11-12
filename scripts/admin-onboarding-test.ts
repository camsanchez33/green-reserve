// ADMIN-REDO Onboarding: pins the page's rules (src/app/api/admin/onboarding/plan.ts) — which statuses are
// onboarding, the order (overdue, then call or email, then our setup; longest wait first), the 8-step checklist,
// the next step in plain words, and the history wording.
import { STAGES, isOnboardingStatus, needOf, rankOf, compareRows, isOverdue, OVERDUE_DAYS, checklist, STEPS, inquiryNext, historyLine } from '../src/app/api/admin/onboarding/plan';

let failed = 0;
const check = (name: string, ok: boolean, info?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || info === undefined ? '' : `  ${JSON.stringify(info)}`}`); if (!ok) failed++; };
const now = new Date('2026-11-12T17:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);

// Which statuses are onboarding
check('the five open stages are onboarding', ['pending', 'in_review', 'details_requested', 'details_submitted', 'building'].every(isOnboardingStatus) && STAGES.length === 5);
check('leads, live and closed are not', !['lead', 'live', 'rejected', 'archived'].some(isOnboardingStatus));
check('stage names say "inquiry", never "enquiry"', STAGES[0][1] === 'New inquiry' && !STAGES.some(s => /enquir/i.test(s[1])));

// Order
check('new, reviewing and waiting on them are call or email', ['pending', 'in_review', 'details_requested'].every(s => needOf(s) === 'call'));
check('details in, building and built by hand are our setup', needOf('details_submitted') === 'setup' && needOf('building') === 'setup' && needOf(null) === 'setup');
check('overdue is 7+ days', OVERDUE_DAYS === 7 && isOverdue({ name: 'a', status: 'building', daysWaiting: 7, snoozed: false }) && !isOverdue({ name: 'a', status: 'building', daysWaiting: 6, snoozed: false }));
check('a snoozed inquiry is never overdue', !isOverdue({ name: 'a', status: 'pending', daysWaiting: 30, snoozed: true }));
const rows = [
  { name: 'Setup 4', status: 'building', daysWaiting: 4, snoozed: false },
  { name: 'Call 1', status: 'pending', daysWaiting: 1, snoozed: false },
  { name: 'Overdue 9', status: 'details_requested', daysWaiting: 9, snoozed: false },
  { name: 'Call 3', status: 'in_review', daysWaiting: 3, snoozed: false },
  { name: 'Overdue 12 setup', status: 'details_submitted', daysWaiting: 12, snoozed: false },
  { name: 'Hand 2', status: null, daysWaiting: 2, snoozed: false },
];
const order = rows.slice().sort(compareRows).map(r => r.name);
check('sorted: overdue (longest first), then call or email, then our setup', JSON.stringify(order) === JSON.stringify(['Overdue 12 setup', 'Overdue 9', 'Call 3', 'Call 1', 'Setup 4', 'Hand 2']), order);
check('ranks 0 / 1 / 2', rankOf(rows[2]) === 0 && rankOf(rows[1]) === 1 && rankOf(rows[0]) === 2);

// Checklist
const none = { infoIn: false, built: false, schedule: false, approved: false, login: false, agreement: false, stripe: false, live: false };
check('8 steps', STEPS.length === 8 && checklist(none).total === 8);
const c0 = checklist(none);
check('nothing done → step 1 of 8, get the setup sheet back', c0.done === 0 && c0.current === 0 && c0.todo === 'Get their setup sheet back');
const c1 = checklist({ ...none, infoIn: true, built: true, agreement: true });
check('steps are independent; the current one is the first not done', c1.done === 3 && c1.current === 2 && c1.steps[5].done, c1);
const c8 = checklist({ infoIn: true, built: true, schedule: true, approved: true, login: true, agreement: true, stripe: true, live: true });
check('all done → no current step', c8.done === 8 && c8.current === null && c8.todo === null);

// Next step in plain words
const ev0 = (fromStatus: string, toStatus: string, actorName: string) => ({ fromStatus, toStatus, actorName, createdAt: ago(1) });
const inq = (status: string, extra: Record<string, unknown> = {}) => ({ id: 'x', status, createdAt: ago(2), events: [], calls: [], ...extra });
check('a new inquiry is answered first (the pipeline\'s rule)', inquiryNext(inq('pending'), now) === 'Reply to their question');
check('…then a call is booked', inquiryNext(inq('in_review', { events: [ev0('pending', 'in_review', 'Cam'), ev0('in_review', 'in_review', 'Replied by email by Cam')] }), now) === 'Book a call with them', inquiryNext(inq('in_review', { events: [ev0('pending', 'in_review', 'Cam'), ev0('in_review', 'in_review', 'Replied by email by Cam')] }), now));
check('a call on the books → its day and time', /^Call on .+ at .+/.test(inquiryNext(inq('in_review', { calls: [{ scheduledAt: new Date(now.getTime() + 3 * 86_400_000), outcome: 'scheduled' }] }), now)));
check('sheet sent → follow up on it (no "chase")', inquiryNext(inq('details_requested'), now) === 'Follow up on the setup sheet');
check('sheet in → build their page', inquiryNext(inq('details_submitted'), now) === 'Build their course page');
check('building, no preview yet → send the preview', inquiryNext(inq('building'), now) === 'Send them the preview of their page');
check('no next step says "chase", "enquiry" or "with Cam"', ['pending', 'in_review', 'details_requested', 'details_submitted', 'building'].every(st => !/chase|enquir|with cam/i.test(inquiryNext(inq(st), now))));

// History wording
const ev = (fromStatus: string, toStatus: string, actorName: string | null) => ({ fromStatus, toStatus, actorName, createdAt: now });
check('a move by a person: "Moved to Building", by them', JSON.stringify(historyLine(ev('details_submitted', 'building', 'Cam'))) === JSON.stringify({ text: 'Moved to Building', detail: 'by Cam' }));
check('a move with a sentence keeps the sentence', historyLine(ev('in_review', 'building', 'Stage overridden by Cam'))?.detail === 'Stage overridden by Cam');
check('a marker shows its words, never the encoded payload', historyLine(ev('building', 'building', 'Course submitted the interest form again::{"a":1}'))?.text === 'Course submitted the interest form again');
check('an empty marker is left out', historyLine(ev('building', 'building', null)) === null);
check('contact updates read in plain words', historyLine(ev('contact_updated', 'contact_updated', 'Cam'))?.text === 'Contact details updated');

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
