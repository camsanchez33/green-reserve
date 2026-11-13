// MSG-1 (Cam 2026-11-09, his notes on the Messages tab): 48 hours, email instead, the assistant for now, "Your ticket
// has been created", a countdown, no Ctrl/Cmd+Enter. Pure + string pins.
import { readFileSync } from 'fs';
import { REPLY_HOURS, waitingSince, ticketRef, dueIn } from '../src/lib/support-ticket';

let failed = 0;
const ok = (name: string, cond: boolean, extra?: unknown) => { if (cond) console.log('PASS ', name); else { failed++; console.log('FAIL ', name, extra ?? ''); } };
const m = (id: string, senderType: string, createdAt: string, isBroadcast = false) => ({ id, senderType, createdAt, isBroadcast });

ok('48 hours to reply', REPLY_HOURS === 48);
const t0 = '2026-11-09T10:00:00Z';
ok('nothing waiting with no messages', waitingSince([]) === null);
ok('the first message after our last reply is the ticket', waitingSince([m('a', 'operator', t0), m('b', 'admin', t0), m('c', 'operator', t0), m('d', 'operator', t0)])?.id === 'c');
ok('our reply answers it', waitingSince([m('a', 'operator', t0), m('b', 'admin', t0)]) === null);
ok('an announcement is not a reply', waitingSince([m('a', 'operator', t0), m('b', 'admin', t0, true)])?.id === 'a');
ok('ticket reference: last 6, upper case', ticketRef('cmabc123xyz9') === '23XYZ9');
const start = Date.parse(t0);
ok('countdown right after sending: 47h 59m', dueIn(t0, start + 30_000).label === '47h 59m');
ok('countdown near the end: minutes only', dueIn(t0, start + (48 * 60 - 45) * 60_000).label === '45m');
ok('past due', dueIn(t0, start + 49 * 3600_000).overdue);

// SUPPORT-1 (Cam 2026-11-12): Messages is Support — one chat per question; the reply time sits on the chat itself and the
// three top cards (reply time, email, the assistant) are gone.
const page = readFileSync('src/app/dashboard/support/page.tsx', 'utf8');
ok('no "one business day"', !page.includes('reply within one business day'));
ok('no Ctrl/Cmd+Enter', !page.includes('metaKey') && !page.includes('Cmd/Ctrl + Enter'));
ok('a chat waiting on us says when we reply', page.includes("'Waiting on us · we reply within 2 business days'"));
ok('the top cards are gone (Cam 2026-11-12)', !page.includes('Prefer email?') && !page.includes('askBirdie') && !page.includes('Reply time'));
ok('old links land on Support with their query (?prefill= starts a new chat)', readFileSync('src/app/dashboard/messages/page.tsx', 'utf8').includes("redirect(`/dashboard/support${qs ? `?${qs}` : ''}`);") && page.includes("if (!open && params.get('prefill')) router.replace(`/dashboard/support?c=${NEW}`);"));

ok('a reply email\'s ?chat=<id> link opens that chat', page.includes("const open = params.get('c') ?? params.get('chat');"));
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
