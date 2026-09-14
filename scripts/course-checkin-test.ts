// CS-1 §5 — three fake courses through setupProgress, checkInSignal and the
// action-queue rows. Run: npx tsx scripts/course-checkin-test.ts
import { setupProgress } from '../src/lib/course-setup';
import { checkInSignal, lastContact, fmtLastContact } from '../src/lib/course-checkin';
import { buildCourseCheckInRows } from '../src/lib/course-action-queue';

const now = new Date('2026-09-14T15:00:00Z');
const day = 86_400_000;

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

// 1. Getting live: setup 2/5 (draft + verified), a scheduled DISCOVERY call on the inquiry, no check-in.
const gettingLive = {
  id: 'c1', name: 'Hollow Creek', active: false, liveStatus: 'draft', stripeAccountActive: false,
  approvalStatus: 'none', operator: { emailVerified: true, name: 'Pat' }, nextCheckInAt: null,
  calls: [],
};
const p1 = setupProgress(gettingLive);
check('getting live: 2 of 5 done', p1.done === 2, `${p1.done}`);
check('getting live: next step is Approved', p1.next?.key === 'approved', p1.next?.key);
const s1 = checkInSignal(gettingLive, gettingLive.calls, now);
check('getting live: no check-in', s1.state === 'none', s1.state);

// 2. Live, nextCheckInAt 5 days ago, no call → overdue by 5, in the queue.
const overdue = {
  id: 'c2', name: 'Pine Ridge', active: true, liveStatus: 'live', stripeAccountActive: true,
  approvalStatus: 'approved', operator: { emailVerified: true, name: 'Sam' },
  nextCheckInAt: new Date(now.getTime() - 5 * day), calls: [],
};
const p2 = setupProgress(overdue);
check('live: 5 of 5 done, no next step', p2.done === 5 && p2.next === null, `${p2.done}`);
const s2 = checkInSignal(overdue, overdue.calls, now);
check('overdue: state overdue, 5 days', s2.state === 'overdue' && s2.days === 5, `${s2.state} ${s2.days}`);
check('overdue: last contact is never', fmtLastContact(lastContact(overdue.calls)) === 'Never talked');

// 3. Live, a scheduled check-in tomorrow, a talked discovery call on file → due, not overdue.
const tomorrow = {
  id: 'c3', name: 'Elk Meadow', active: true, liveStatus: 'live', stripeAccountActive: true,
  approvalStatus: 'approved', operator: { emailVerified: true, name: 'Jo' },
  nextCheckInAt: new Date(now.getTime() + 20 * day),
  calls: [
    { kind: 'checkin', scheduledAt: new Date(now.getTime() + 1 * day), outcome: 'scheduled' },
    { kind: 'discovery', scheduledAt: new Date(now.getTime() - 40 * day), outcome: 'talked', completedAt: new Date(now.getTime() - 40 * day) },
  ],
};
const s3 = checkInSignal(tomorrow, tomorrow.calls, now);
check('tomorrow: the scheduled call wins over the bare date', s3.hasCall && s3.state === 'due' && s3.days === 1, `${s3.state} ${s3.days} hasCall=${s3.hasCall}`);
check('tomorrow: last contact was the discovery call', /discovery call/.test(fmtLastContact(lastContact(tomorrow.calls))), fmtLastContact(lastContact(tomorrow.calls)));

// 4. Live, scheduled check-in in 10 days → scheduled, not in the queue.
const later = { ...tomorrow, id: 'c4', name: 'Far Off', calls: [{ kind: 'checkin', scheduledAt: new Date(now.getTime() + 10 * day), outcome: 'scheduled' }] };
const s4 = checkInSignal(later, later.calls, now);
check('later: scheduled, 10 days out', s4.state === 'scheduled' && s4.days === 10, `${s4.state} ${s4.days}`);

const rows = buildCourseCheckInRows([gettingLive, overdue, tomorrow, later], now);
check('queue: overdue + due rows only, overdue first', rows.length === 2 && rows[0].id === 'ci-c2' && rows[1].id === 'ci-c3', JSON.stringify(rows.map(r => r.id)));
check('queue: overdue row names the days', /overdue by 5 days/.test(rows[0].why), rows[0].why);
check('queue: doThis names the operator', /Call Sam/.test(rows[0].doThis), rows[0].doThis);
check('queue: due row says when', /Check-in due/.test(rows[1].why), rows[1].why);

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
