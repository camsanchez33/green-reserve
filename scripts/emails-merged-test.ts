// Emails and texts redo (Cam 2026-11-19, mockup inventory): the three dead emails are gone and the
// near-duplicate pairs are one email each — dashboard access, going live, and the after-call recap.
// Pure.   npx tsx scripts/emails-merged-test.ts
import { readFileSync } from 'fs';
import * as S from '../src/lib/email-staff';
import { esc } from '../src/lib/email-layout';

process.env.NEXT_PUBLIC_URL = 'https://greenreserve.app';
let failed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) { failed++; if (extra !== undefined) console.log('   ', typeof extra === 'string' ? extra.slice(0, 500) : extra); } };
const has = (e: S.BuiltEmail, ...m: string[]) => m.every(x => (e.html + e.text + e.subject).includes(x));
const head = (e: S.BuiltEmail, line: string) => e.html.includes(`>${esc(line)}</h1>`) && e.text.startsWith(line);
const src = readFileSync('src/lib/email.ts', 'utf8');
const all = (dir: string[]) => dir.map(f => readFileSync(f, 'utf8')).join('\n');

// Removed: no caller left, or golfer accounts are retired.
for (const n of ['sendGolferPasswordResetEmail', 'sendPreviewEmail', 'sendAdminSetPasswordEmail', 'sendPageReadyInDashboardEmail', 'sendGoLiveSimpleEmail', 'sendCallFollowupEmail'])
  check(`${n} is gone, with no caller left`, !src.includes(`function ${n}(`) && !all(['src/app/api/admin/inquiries/route.ts', 'src/app/api/preview/send/route.ts', 'src/app/api/admin/create-course/route.ts', 'src/app/api/admin/course-detail/route.ts']).includes(n));
check('no email is on the old layout any more', !src.includes('baseTemplate'));

// Dashboard access: one email, two cases.
const setup = S.dashboardAccessEmail({ operatorName: 'Dana Ortiz', operatorEmail: 'd@example.test', courseName: 'Maple Run', setupUrl: 'https://greenreserve.app/dashboard/setup?t=x', pageReady: true, linkDays: 7 });
check('dashboard access, never signed in: set your password, then the steps', head(setup, 'Your booking page is ready for a look, Dana.') && has(setup, 'Set your password&nbsp;&rarr;', 'Then your dashboard walks you through', 'expires in 7 days', 'Your Maple Run booking page is ready for a look'));
const already = S.dashboardAccessEmail({ operatorName: 'Dana Ortiz', operatorEmail: 'd@example.test', courseName: 'Maple Run', setupUrl: null, pageReady: true, linkDays: 0 });
check('dashboard access, already signs in: straight to the dashboard, no password link', head(already, 'Your booking page is ready for a look, Dana.') && has(already, 'Review it in your dashboard&nbsp;&rarr;', '/dashboard') && !has(already, 'Set your password') && !has(already, 'expires in'));
check('…both callers that told the two apart now send setupUrl: null', readFileSync('src/app/api/admin/inquiries/route.ts', 'utf8').includes('if (alreadyIn) await sendDashboardSetupEmail({ operatorName: op.name, operatorEmail: op.email, courseName: inquiry.courseName, setupUrl: null,') && readFileSync('src/app/api/preview/send/route.ts', 'utf8').includes('if (hasSetUp(op)) await sendDashboardSetupEmail({ operatorName: op.name, operatorEmail: op.email, courseName, setupUrl: null,'));

// Going live: one email; the dashboard map only for an owner who hadn't had access.
const tour = S.goLiveEmail({ courseName: 'Maple Run', courseSlug: 'maple-run', tour: true });
const short = S.goLiveEmail({ courseName: 'Maple Run', courseSlug: 'maple-run', tour: false });
check('go-live with the map of the dashboard, and LQ-2’s fee words', head(tour, 'Maple Run is live on GreenReserve.') && has(tour, 'Where everything lives', 'greenreserve.app/courses/maple-run', S.FEE_SENTENCES, 'Open your dashboard&nbsp;&rarr;'));
check('both go-live versions link to the booking page', [tour, short].every(e => e.html.includes('href="https://greenreserve.app/courses/maple-run"') && e.text.includes('See your booking page: https://greenreserve.app/courses/maple-run')));
check('go-live, short, for an owner who already had access', head(short, 'Maple Run is live on GreenReserve.') && !has(short, 'Where everything lives') && has(short, "You're live! Maple Run is now bookable on GreenReserve"));
check('…the route picks the short one exactly when dashboard access was sent', readFileSync('src/app/api/admin/inquiries/route.ts', 'utf8').includes('sendCourseLiveOrientationEmail({ ...d, tour: !hasDashboardAccess })'));
check('no banned fee phrase', !/keep 100%|never touches your Stripe|our only fee/i.test(tour.text));

// After the call: one plain email from Cam.
const recap = S.callRecapEmail({ contactName: 'Sam Lee', courseName: 'Maple Run', scheduledAt: new Date('2026-11-24T19:00:00Z'), items: [['Holes', '18'], ['Green fee', '$52 <weekday>']] });
check('recap after a logged call: what we wrote down, no setup link', has(recap, 'Hi Sam,', 'Here’s what we wrote down:', '- Green fee: $52 &lt;weekday&gt;', 'What we captured on our call – Maple Run') && !has(recap, 'setup sheet, built'));
const follow = S.callRecapEmail({ contactName: 'Sam', courseName: 'Maple Run', recap: ['18 holes, walking allowed'], detailsLink: 'https://greenreserve.app/details/x', liveTarget: 'early december' });
check('recap with the setup sheet: the link (clickable), next steps, LQ-2 fee words', has(follow, 'href="https://greenreserve.app/details/x"', 'aiming for early december', S.FEE_SENTENCES, 'Maple Run: recap of our call and your setup sheet', '- 18 holes, walking allowed'));
check('…plain, no layout', !/<h1|width="139"/.test(follow.html + recap.html));
check('…both kinds stay in the send log', src.includes("kind: data.detailsLink ? 'call_followup_email' : 'call_recap_email'"));

// The count: 78 in the mockup's inventory, less 3 removed and 3 merged (the 4th pair, "added as member", was already one email).
const senders = (src.match(/^export async function send\w+\(/gm) ?? []).length;
check(`email.ts has 74 senders (80 before: 3 removed, 3 merged away)`, senders === 74, senders);

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
if (failed) process.exit(1);
