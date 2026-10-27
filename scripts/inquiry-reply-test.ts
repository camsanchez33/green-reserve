// Cam 2026-10-26 walk: "I have no way to reply … through the admin page" and
// "pipeline says no inquiries waiting on you, but who would it be waiting on".
// A new question is our move the moment it lands; a reply from the admin moves
// it to waiting on them until they go quiet for 3 days; the board's next step is
// Reply, then Book a call. Run: npx tsx scripts/inquiry-reply-test.ts
import { readFileSync } from 'fs';
import { queueSignal, REPLY_EVENT_PREFIX } from '../src/lib/inquiry-status';
import { nextStep } from '../src/lib/inquiry-board';

let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

const now = new Date('2031-05-10T15:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const base = { id: 'i1', status: 'pending', createdAt: hoursAgo(2), events: [] as { fromStatus: string; toStatus: string; actorName: string | null; createdAt: Date }[], calls: [], callInviteSentAt: hoursAgo(2) };

const fresh = queueSignal(base, now);
ok('a question that just arrived is our move', fresh.waitingOn === 'us' && fresh.yourMove === true, fresh);
ok("…and the board's next step is Reply", nextStep(base, fresh, now)?.key === 'reply');

const replied = { ...base, events: [{ fromStatus: 'pending', toStatus: 'pending', actorName: `${REPLY_EVENT_PREFIX} by Cam`, createdAt: hoursAgo(1) }] };
const after = queueSignal(replied, now);
ok('once we reply, it is waiting on them and not our move', after.waitingOn === 'them' && after.yourMove === false, after);
ok('…and the next step moves on to Book a call', nextStep(replied, after, now)?.key === 'book_call', nextStep(replied, after, now));

const quiet = { ...replied, createdAt: hoursAgo(5 * 24), events: [{ ...replied.events[0], createdAt: hoursAgo(4 * 24) }] };
const stale = queueSignal(quiet, now);
ok('4 days with no answer, it comes back to us', stale.yourMove === true && /no answer/.test(stale.reason), stale);

const talked = { ...base, calls: [{ scheduledAt: hoursAgo(1), outcome: 'talked' }] };
const talkedSig = queueSignal(talked, now);
ok('a question answered on a call is not "New question — reply"', !talkedSig.reason.startsWith('New question') && nextStep(talked, talkedSig, now)?.key === 'send_sheet', { r: talkedSig.reason, step: nextStep(talked, talkedSig, now) });
const skipped = { ...base, callSkippedReason: 'They asked for email only' };
ok('…nor is one whose call was skipped (next step: send the sheet)', nextStep(skipped, queueSignal(skipped, now), now)?.key === 'send_sheet');
const moved = { ...replied, status: 'in_review', events: [{ ...replied.events[0], createdAt: hoursAgo(10 * 24) }, { fromStatus: 'pending', toStatus: 'in_review', actorName: 'Moved by Cam', createdAt: hoursAgo(24) }] };
const movedSig = queueSignal(moved, now);
ok('a reply from an earlier stage does not anchor the new stage', movedSig.reason.startsWith('In review'), movedSig.reason);

const route = readFileSync('src/app/api/admin/inquiries/route.ts', 'utf8');
const r = route.slice(route.indexOf("if (action === 'reply')"), route.indexOf("if (action === 'add_note')"));
ok('the reply route sends first and records the reply only after it went', r.indexOf('await sendInquiryReply(') > 0 && r.indexOf('REPLY_EVENT_PREFIX') > r.indexOf('await sendInquiryReply(') && /status: 502/.test(r));
const email = readFileSync('src/lib/email.ts', 'utf8');
const reply = email.slice(email.indexOf('export async function sendInquiryReply'));
ok('replies go from admin@ and are logged against the inquiry', /from: FROM_ADMIN/.test(reply.slice(0, 1600)) && /kind: 'inquiry_reply', inquiryId/.test(reply.slice(0, 1600)));
const alert = email.slice(email.indexOf('export async function sendInquiryNotification'), email.indexOf('export async function sendInquiryReply'));
ok('the new-question alert opens that inquiry and its reply box', alert.includes('/admin/inquiries/${encodeURIComponent(data.inquiryId)}') && alert.includes('?reply=1'));
ok('…and its caller passes the inquiry id', readFileSync('src/app/api/inquiries/route.ts', 'utf8').includes('inquiryId: inquiry.id,'));

// Cam 2026-10-27: once answered, the box folds away and the conversation goes on in the course's Messages.
const inqPage = readFileSync('src/app/admin/inquiries/[id]/page.tsx', 'utf8');
ok('an answered question folds the reply box away', inqPage.includes('if (lastReply && !replyOpen) return (') && inqPage.includes('setReplyOpen(false);'));
ok('…and points at Messages on the built course', inqPage.includes('href={`/admin/courses/${inq.builtCourseId}?tab=contact`}'));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('inquiry-reply: all passed');
