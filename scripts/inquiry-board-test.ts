// AW-6a: the Inquiries board — which column an inquiry sits in, and its one
// next step. Pure. Run: npx tsx scripts/inquiry-board-test.ts
import { boardColumn, nextStep, BOARD_COLUMNS, type BoardInquiry } from '../src/lib/inquiry-board';
import { queueSignal, KNOWN_STATUSES, ALIVE_STATUSES, ACTIVE_STATUSES } from '../src/lib/inquiry-status';
import { encodeChangesRequested, encodeChangeAddressed } from '../src/lib/change-requests';

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

// AW-6c: leads.
check('the board is Leads → Talking → Setting up → Live', BOARD_COLUMNS.map(c => c.key).join(',') === 'leads,talking,setup,live');
check('a lead is in Leads', boardColumn('lead') === 'leads');
const lead = inq('lead', { events: [{ fromStatus: 'lead', toStatus: 'lead', actorName: 'Lead added by Cam', createdAt: days(10) }] });
check('a lead → Move to Talking, in place', step(lead)?.label === 'Move to Talking' && step(lead)?.action === 'start_talking');
check('a lead never nags (not your move, so not on Today)', queueSignal(lead, now).yourMove === false);
check('a lead is a known status', (KNOWN_STATUSES as readonly string[]).includes('lead'));
check('…but outside the alive/active lists the public form, Cal.com and Today read', !(ALIVE_STATUSES as readonly string[]).includes('lead') && !(ACTIVE_STATUSES as readonly string[]).includes('lead'));
check('a snoozed lead says snoozed', step(inq('lead', { snoozeUntil: new Date(now.getTime() + 5 * 86_400_000).toISOString() }))?.key === 'snoozed');

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

// Building — read from the ledger.
const ev = (actorName: string, d: number) => ({ fromStatus: 'building', toStatus: 'building', actorName, createdAt: days(d) });
const built = (extra: ReturnType<typeof ev>[] = [], o: Partial<BoardInquiry> = {}) => inq('building', { events: [{ fromStatus: 'details_submitted', toStatus: 'building', actorName: 'Cam', createdAt: days(6) }, ...extra], ...o });
check('built, no preview yet → Send the preview (opens it)', step(built())?.label === 'Send the preview' && step(built())?.action === 'open');
const out = built([ev('Preview sent by Cam', 4)]);
check('preview out, no answer → Resend the preview, in place', step(out)?.label === 'Resend the preview' && step(out)?.action === 'resend_preview');
check('…even with a follow-up due today', step(built([ev('Preview sent by Cam', 4)], { nextFollowUpAt: days(0) }))?.label === 'Resend the preview');
const asked = ev(encodeChangesRequested([{ category: 'pricing', detail: 'twilight rate' }]), 3);
check('changes asked for, not done → Make their changes', step(built([ev('Preview sent by Cam', 4), asked]))?.label === 'Make their changes');
check('changes all done, no new preview → Send the updated preview', step(built([ev('Preview sent by Cam', 4), asked, ev(encodeChangeAddressed('pricing', 'Cam'), 1)]))?.label === 'Send the updated preview');
check('approved → Finish and go live', step(built([ev('Preview sent by Cam', 4), ev('Course approved their page', 2)]))?.label === 'Finish and go live');


console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
