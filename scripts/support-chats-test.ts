// SUPPORT (Cam 2026-11-12): the pure rules of lib/support-chats — the subject from the first message, and a chat's
// state (waiting on us / new reply / answered) with its reply promise (2 business days, lib/support-ticket).
//   npx tsx scripts/support-chats-test.ts
import { subjectFrom, chatSummary, messageText, MAX_MESSAGE, type Row } from '../src/lib/support-chats';

let failed = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!cond) failed++;
};
let n = 0;
const row = (senderType: string, at: string, o: Partial<Row> = {}): Row => ({ id: String(++n), senderType, senderName: senderType === 'admin' ? 'Cam' : 'Pat', body: 'hi', createdAt: new Date(at), readAt: null, isBroadcast: false, ...o });

// Subjects.
ok('the subject is the first line', subjectFrom('Cart path question\nThe 9th is flooded.') === 'Cart path question');
ok('…skipping blank lines and squashing spaces', subjectFrom('\n\n   Tee   sheet   help  \nmore') === 'Tee sheet help');
const long = 'Our tee sheet shows the wrong price for twilight rounds on weekends and holidays';
const s = subjectFrom(long);
ok('a long first line is cut at a word, about 60 characters, with an ellipsis', s.length <= 61 && s.endsWith('…') && long.startsWith(s.slice(0, -1)) && !s.slice(0, -1).endsWith(' '), s);
ok('a 60-character line stays whole', subjectFrom('x'.repeat(60)) === 'x'.repeat(60));
ok('an empty message has a fallback subject', subjectFrom('   ') === 'New message');

// Message text.
ok('an empty message is refused', !messageText('  ').ok && !messageText(undefined).ok && !messageText(42).ok);
ok('a message over the limit is refused', !messageText('x'.repeat(MAX_MESSAGE + 1)).ok && messageText('x'.repeat(MAX_MESSAGE)).ok);
ok('a message is trimmed', (() => { const t = messageText('  hello  '); return t.ok && t.text === 'hello'; })());

// State.
const now = new Date('2026-11-12T20:00:00Z'); // Thu 3pm Eastern
const w = chatSummary([row('operator', '2026-11-13T15:00:00Z')], now);
ok('the course wrote last → waiting on us, due 2 business days later (Fri 10am → Tue 10am)', w.state === 'waiting' && w.unanswered && w.dueAt?.toISOString() === '2026-11-17T15:00:00.000Z' && !w.overdue, w);
const two = chatSummary([row('admin', '2026-11-09T15:00:00Z', { readAt: new Date() }), row('operator', '2026-11-09T16:00:00Z'), row('operator', '2026-11-12T19:00:00Z')], now);
ok('the promise runs from the first unanswered message (Mon 11am → Wed 11am: overdue on Thursday)', two.state === 'waiting' && two.dueAt?.toISOString() === '2026-11-11T16:00:00.000Z' && two.overdue, two);
ok('we replied, not yet read → new reply', chatSummary([row('operator', '2026-11-10T15:00:00Z'), row('admin', '2026-11-11T15:00:00Z')], now).state === 'reply');
const ans = chatSummary([row('operator', '2026-11-10T15:00:00Z'), row('admin', '2026-11-11T15:00:00Z', { readAt: new Date() })], now);
ok('we replied and it was read → answered, nothing due', ans.state === 'answered' && ans.dueAt === null && !ans.unanswered, ans);
const bc = chatSummary([row('operator', '2026-11-10T15:00:00Z'), row('admin', '2026-11-11T15:00:00Z', { isBroadcast: true })], now);
ok('an old announcement copy is not a reply (still waiting)', bc.state === 'waiting' && bc.last?.senderType === 'operator', bc);
ok('no messages → answered, no last', (() => { const e = chatSummary([], now); return e.state === 'answered' && e.last === null; })());

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
