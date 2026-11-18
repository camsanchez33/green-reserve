// Admin Course support (ADMIN-REDO, Cam approved 2026-11-12): the page's pure rules and its gates.
// Run: npx tsx scripts/admin-support-test.ts
import { readFileSync } from 'fs';
import { isList, isThread, ago, replyText, preview, MAX_REPLY } from '../src/app/admin/support/logic';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) failed++; };
const NOW = new Date('2026-11-12T20:00:00Z');

check('a list answer needs threads', isList({ threads: [] }) && !isList({}) && !isList(null));
check('a chat answer needs its messages', isThread({ id: 'a', messages: [] }) && !isThread({ id: 'a' }));
check('ago: now, minutes, hours, days', ago('2026-11-12T19:59:40Z', NOW) === 'now' && ago('2026-11-12T19:55:00Z', NOW) === '5m ago' && ago('2026-11-11T23:00:00Z', NOW) === '21h ago' && ago('2026-11-10T20:00:00Z', NOW) === '2d ago');
check('ago: a week or more is the date', ago('2026-11-01T15:00:00Z', NOW) === 'Nov 1');
check('a reply is trimmed; empty or too long is refused', replyText('  hi  ') === 'hi' && replyText('   ') === null && replyText('x'.repeat(MAX_REPLY + 1)) === null && replyText('x'.repeat(MAX_REPLY)) !== null);
check('our last message previews as "You: …"', preview({ lastFrom: 'us', lastText: 'Yes.' }) === 'You: Yes.' && preview({ lastFrom: 'course', lastText: 'Hi' }) === 'Hi');

const page = readFileSync('src/app/admin/support/page.tsx', 'utf8');
check('reads Build\'s support routes only', /\/api\/admin\/support/.test(page) && !/\/api\/admin\/messages/.test(page));
check('no take, assign or snooze action', !/action: '(take|assign|snooze)'|>(Take it|Assign|Snooze)</i.test(page));
check('a later search wins over an earlier answer', /mine !== seq\.current/.test(page));
check('the open chat is in the URL', /\?id=\$\{encodeURIComponent/.test(page));
const nav = readFileSync('src/components/admin/AdminSidebar.tsx', 'utf8');
check('the menu: Course support, support+, Messages area', /key: 'support', label: 'Course support', href: '\/admin\/support', minRole: SUPPORT_PLUS, area: 'messages'/.test(nav));
check('Problems is off the rail: its list is Overview\'s Needs attention', !/key: 'problems'/.test(nav) && /<Link href="\/admin" className=\{g\.ibtn\}/.test(nav));

check('the reply limit is Build\'s', MAX_REPLY === 5000 && /export const MAX_MESSAGE = 5000;/.test(readFileSync('src/lib/support-chats.ts', 'utf8')));
check('the shapes are Build\'s own types', /import type \{ AdminThread, AdminMessage \} from '@\/lib\/support-chats'/.test(readFileSync('src/app/admin/support/logic.ts', 'utf8')));
check('the top search opens Course support, not the retired Messages page', (() => { const sr = readFileSync('src/app/api/admin/search/route.ts', 'utf8'); return /'nav:support'/.test(sr) && !/'nav:messages'/.test(sr) && !/\/admin\/messages\?courseId/.test(sr) && /'\/admin\/support': 'messages'/.test(sr); })());
check('a course found by search opens its chats (?q=), and a new ?q= while open re-seeds the list', /<ChatList key=\{initialQ \+ '\|' \+ courseId\} initialQ=\{initialQ\}/.test(page) && /const initialQ = params\.get\('q'\) \?\? ''/.test(page));
check('a course link (?courseId=) shows only that course\'s chats and opens its one chat', /const courseId = params\.get\('courseId'\)/.test(page) && /all\.filter\(t => t\.courseId === courseId\)/.test(page) && /if \(only\) onOpen\(only, true\)/.test(page));
check('the old Messages address redirects to Course support, keeping ?id= and ?courseId=', (() => { const m = readFileSync('src/app/admin/messages/page.tsx', 'utf8'); return /redirect\(id \? `\/admin\/support\?id=/.test(m) && /\/admin\/support\?courseId=/.test(m); })());
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
