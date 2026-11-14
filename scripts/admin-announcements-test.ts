// ADMIN-REDO Announcements (Cam approved the mockup 2026-11-12, ADMIN_REDO_SPEC.md "Admin Announcements").
// Pins the page's helpers and the behaviour it must keep from before the redo. Run: npx tsx scripts/admin-announcements-test.ts
import { readFileSync } from 'fs';
import { pl, firstLine, listDate, matches, outcomeLine, outcomeBad, reachLine, isBroadcasts, type Broadcast, type SendOutcome } from '../src/app/admin/announcements/logic';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };

const b: Broadcast = { id: 'a', title: 'Maintenance Sunday', body: '\n  Booking pages pause 2–3am.\nNothing else.', emailSent: true, sentByName: 'X', createdAt: '2026-11-12T15:00:00Z', dismissalCount: 2 };
check('plural', pl(1, 'operator') === '1 operator' && pl(0, 'operator') === '0 operators');
check('preview is the first non-empty line', firstLine(b.body) === 'Booking pages pause 2–3am.');
check('search: title or message, any case; empty matches all', matches(b, 'MAINT') && matches(b, 'pause') && matches(b, '  ') && !matches(b, 'refund'));
check('list date: no year this year, year otherwise', listDate('2026-11-10T15:00:00Z', new Date('2026-11-12T12:00:00Z')) === 'Nov 10' && listDate('2025-12-31T15:00:00Z', new Date('2026-11-12T12:00:00Z')) === 'Dec 31, 2025');
check('shape guard', isBroadcasts([b]) && !isBroadcasts({}) && !isBroadcasts([{ id: 1 }]));

const ok: SendOutcome = { courses: 12, emailRequested: true, emailRecipients: 15, emailsSent: 15, emailFailures: [] };
check('result line counts what the send reports', outcomeLine(ok) === 'Posted to 12 course dashboards · 15 of 15 emails delivered to Resend');
check('no email', outcomeLine({ ...ok, emailRequested: false, emailRecipients: 0, emailsSent: 0 }) === 'Posted to 12 course dashboards · no email');
check('green when every email went', !outcomeBad(ok) && !outcomeBad({ ...ok, emailRequested: false, emailRecipients: 0, emailsSent: 0 }));
check('amber when some emails failed', outcomeBad({ ...ok, emailsSent: 14, emailFailures: ['a@b'] }) && outcomeBad({ ...ok, emailsSent: 0 }));
check('amber when email was asked for but there was nobody to send to (0 of 0)', outcomeBad({ courses: 3, emailRequested: true, emailRecipients: 0, emailsSent: 0, emailFailures: [] }));
check('reach line', reachLine({ courses: 1, operators: 3 }, true) === 'Shows on 1 course dashboard and emails 3 operators.'
  && reachLine({ courses: 4, operators: 3 }, false) === 'Shows on 4 course dashboards. No email.'
  && reachLine(null, true).startsWith('Shows on every live course'));

const page = readFileSync('src/app/admin/announcements/page.tsx', 'utf8');
check('only the owner gets the +, and ?new=1 opens nothing for anyone else', /\{isOwner && \(\s*<button[^\n]*aria-label="New announcement"/.test(page) && /params\.get\('new'\) === '1' && isOwner/.test(page));
check('the broadcasts route is unchanged: list, recipients, send, test', /'\/api\/admin\/broadcasts'/.test(page) && /broadcasts\?recipients=1/.test(page) && /test: true/.test(page) && /sendEmail: draft\.sendEmail/.test(page));
check('review step: Preview with Edit, cannot be recalled, Back to edit / Send test to me / Confirm & send',
  />Edit</.test(page) && /This cannot be recalled\./.test(page) && />Back to edit</.test(page) && /'Send test to me'/.test(page) && /'Confirm & send'/.test(page));
check('dropped headings stay dropped', !/Review before sending|>New announcement<|>Sent</.test(page));
check('no silent failures: load, test and send all show their error', /setLoadErr\(\{ msg: res\.message/.test(page) && (page.match(/setSendErr\(\{ msg: res\.message, kind: res\.kind \}\)/g) ?? []).length === 2);
check('the send lives on the page, not the composer: browser Back can never start a second send', /const busy = useRef\(false\)/.test(page) && (page.match(/busy\.current\) return;/g) ?? []).length === 2 && /disabled=\{sending\} aria-label="New announcement"/.test(page) && !/function Composer[\s\S]*useState\(false\);[\s\S]*setSending/.test(page));
check('a send error shows on the list too, and a stale result is cleared when a send starts', /const sendStatus =/.test(page) && (page.match(/\{sendStatus\}/g) ?? []).length === 2 && /setOutcome\(null\); \/\/ a stale result/.test(page));
check('a session that ended on send or test offers Sign in', /err\.kind === 'unauthorized' && <> <Link href="\/admin\/login">/.test(page));
check('nothing that recalls, schedules or drafts', !/method: '(DELETE|PATCH|PUT)'/.test(page) && !/schedule/i.test(page));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
