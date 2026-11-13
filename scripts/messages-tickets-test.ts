// MSG-1 (Cam 2026-11-09, his notes on the Messages tab): 48 hours, email instead, the assistant for now, "Your ticket
// has been created", a countdown, no Ctrl/Cmd+Enter. Pure + string pins.
import { readFileSync } from 'fs';
import { REPLY_BUSINESS_DAYS, REPLY_PROMISE, replyDueAt, waitingSince, ticketRef, dueIn } from '../src/lib/support-ticket';

let failed = 0;
const ok = (name: string, cond: boolean, extra?: unknown) => { if (cond) console.log('PASS ', name); else { failed++; console.log('FAIL ', name, extra ?? ''); } };
const m = (id: string, senderType: string, createdAt: string, isBroadcast = false) => ({ id, senderType, createdAt, isBroadcast });

// SUPPORT (Cam 2026-11-12): 2 business days, Eastern, weekends skipped (was 48 hours).
ok('2 business days to reply', REPLY_BUSINESS_DAYS === 2 && REPLY_PROMISE === '2 business days');
const t0 = '2026-11-09T10:00:00Z'; // a Monday: 2 business days is 48 hours
ok('a Friday message is due Tuesday at the same time (the weekend skipped)', replyDueAt('2026-11-13T15:00:00Z').toISOString() === '2026-11-17T15:00:00.000Z');
ok('a Saturday message is due Wednesday 00:00 Eastern', replyDueAt('2026-11-14T15:00:00Z').toISOString() === '2026-11-18T05:00:00.000Z');
ok('a Friday countdown runs through the weekend: 95h 59m right after sending', dueIn('2026-11-13T15:00:00Z', Date.parse('2026-11-13T15:00:30Z')).label === '95h 59m');
ok('nothing waiting with no messages', waitingSince([]) === null);
ok('the first message after our last reply is the ticket', waitingSince([m('a', 'operator', t0), m('b', 'admin', t0), m('c', 'operator', t0), m('d', 'operator', t0)])?.id === 'c');
ok('our reply answers it', waitingSince([m('a', 'operator', t0), m('b', 'admin', t0)]) === null);
ok('an announcement is not a reply', waitingSince([m('a', 'operator', t0), m('b', 'admin', t0, true)])?.id === 'a');
ok('ticket reference: last 6, upper case', ticketRef('cmabc123xyz9') === '23XYZ9');
const start = Date.parse(t0);
ok('countdown right after sending: 47h 59m', dueIn(t0, start + 30_000).label === '47h 59m');
ok('countdown near the end: minutes only', dueIn(t0, start + (48 * 60 - 45) * 60_000).label === '45m');
ok('past due', dueIn(t0, start + 49 * 3600_000).overdue);

const page = readFileSync('src/app/dashboard/messages/page.tsx', 'utf8');
ok('no "one business day"', !page.includes('reply within one business day'));
ok('no Ctrl/Cmd+Enter', !page.includes('metaKey') && !page.includes('Cmd/Ctrl + Enter'));
ok('"Your ticket has been created" after sending', page.includes('Your ticket has been created'));
ok('email instead, and the assistant with ready questions', page.includes('Prefer email?') && page.includes('askBirdie(q)') && page.includes('Ask the assistant'));

console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
