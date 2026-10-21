// AW-6a: the Inquiries board — which column an inquiry sits in, and its one
// next step. Pure. Run: npx tsx scripts/inquiry-board-test.ts
import { boardColumn, nextStep, type BoardInquiry } from '../src/lib/inquiry-board';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ' — ' + detail : ''}`); if (!ok) failed++; };
const now = new Date('2030-06-12T16:00:00Z'); // noon Eastern, Wednesday
const days = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const inq = (status: string, o: Partial<BoardInquiry> = {}): BoardInquiry => ({
  id: 'i1', status, createdAt: days(10),
  events: [{ fromStatus: 'pending', toStatus: status, actorName: 'Cam', createdAt: days(5) }],
  calls: [], ...o,
});
const step = (i: BoardInquiry) => nextStep(i, undefined, now);

check('pending and in review are Talking', boardColumn('pending') === 'talking' && boardColumn('in_review') === 'talking');
check('sheet out, sheet in and building are Setting up', ['details_requested', 'details_submitted', 'building'].every(s => boardColumn(s) === 'setup'));
check('live is Live', boardColumn('live') === 'live');
check('rejected and archived are off the board', boardColumn('rejected') === null && boardColumn('archived') === null);

check('no call yet → Book a call', step(inq('in_review'))?.label === 'Book a call');
check('a call booked later → Get ready for the call', step(inq('in_review', { calls: [{ scheduledAt: new Date(now.getTime() + 2 * 86_400_000).toISOString(), outcome: 'scheduled' }] }))?.label === 'Get ready for the call');
check('a call today → Call at <time>', /^Call at 2:00/.test(step(inq('pending', { calls: [{ scheduledAt: '2030-06-12T18:00:00Z', outcome: 'scheduled' }] }))?.label ?? ''), step(inq('pending', { calls: [{ scheduledAt: '2030-06-12T18:00:00Z', outcome: 'scheduled' }] }))?.label);
check('a call that passed unlogged → Log the call', step(inq('in_review', { calls: [{ scheduledAt: days(2), outcome: 'scheduled' }] }))?.label === 'Log the call');
check('call done → Send the setup sheet', step(inq('in_review', { calls: [{ scheduledAt: days(1), outcome: 'talked' }] }))?.label === 'Send the setup sheet');
check('call skipped with a reason → Send the setup sheet', step(inq('in_review', { callSkippedReason: 'Knows us already' }))?.label === 'Send the setup sheet');
const sheet = step(inq('details_requested'));
check('sheet out → Resend the sheet, in place', sheet?.label === 'Resend the sheet' && sheet.action === 'resend_sheet');
check('sheet in → Build the course', step(inq('details_submitted'))?.label === 'Build the course');
check('live → no button', step(inq('live')) === null);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
