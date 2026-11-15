// PLATFORM ACTIVITY (Cam approved 2026-11-15, lanes/admin.md; mockup lanes/admin/system-mockup.html).
// Pins the board's rules: one line per service, the summary line, worst first, "Can't see here" for what the route
// doesn't return yet, the owner tools only for the owner, and every old System feature still on the page.
// Run: npx tsx scripts/admin-system-test.ts
import { readFileSync } from 'fs';
import { services, localSt, tools, summary, worst, matches, CANT, type SystemData } from '../src/app/admin/system/services';

let failed = 0;
const page0 = () => readFileSync('src/app/admin/system/page.tsx', 'utf8');
const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !info ? '' : ` — ${info}`}`); if (!ok) failed++; };

const run = (status: 'ok' | 'bad' | 'warn') => ({ status, note: status === 'bad' ? 'Last run failed: Resend rate limit reached' : '', last: { startedAt: '2026-11-14T14:00:00Z', finishedAt: null, outcome: status, detail: '', error: status === 'bad' ? 'Resend rate limit reached' : '' } });
const base: SystemData = {
  lastStripeTouch: null,
  links: { backups: 'b', ci: 'c', commits: 'https://github.com/o/r/commits/main', vercel: 'v', vercelIsDeep: false, sentry: 's', sentryIsDeep: false, stripeWebhooks: 'w' },
  crons: ['generate-tee-times', 'send-reminders', 'hourly', 'cancellation-cutoff', 'chase-onboarding', 'monthly-review']
    .map(p => ({ path: `/api/cron/${p}`, schedule: '0 3 * * *', human: 'Daily at 03:00 UTC', health: run('ok') })),
  stripeWebhook: { at: '2026-11-14T13:48:00Z', outcome: 'ok', detail: 'invoice.payment_succeeded', error: '' },
  calcom: { state: 'on', url: 'https://cal.com/x/y', webhookSecretSet: true },
  birdie: { enabled: true, keySet: true, flag: true, todayReplies: 142, dailyCap: 2000, model: 'm' },
  platform: { accessFeeCents: 150, env: 'production', commitSha: '3f9c2ab', commitMessage: '', branch: 'main', publicUrl: '',
    integrations: { stripe: true, stripeWebhook: true, resend: true, twilio: true, sentry: true, blob: true, privateBlob: true } },
};

const all = services(base);
check('eleven services, one line each', all.length === 11 && new Set(all.map(s => s.id)).size === 11);
check('the assistant is never called by its product name on the board', all.every(s => !/birdie/i.test(`${s.t} ${s.does} ${s.state}`)));
check('Neon and GitHub read "Can’t see here" / "Check on GitHub" until Build adds them', all.find(s => s.id === 'neon')!.state === CANT && all.find(s => s.id === 'github')!.state === 'Check on GitHub');
check('summary counts only the amber or red services', summary(all).text === 'All 11 services running' && summary(all).st === 'ok', summary(all).text);

const broken: SystemData = { ...base,
  crons: base.crons.map(c => c.path.endsWith('chase-onboarding') ? { ...c, health: run('bad') } : c.path.endsWith('monthly-review') ? { ...c, health: null } : c),
  twilio: { accountSidSet: true, authTokenSet: false, fromNumberSet: true } };
const b = services(broken);
const jobs = b.find(s => s.id === 'jobs')!, tw = b.find(s => s.id === 'twilio')!;
check('a failing job makes the jobs line red and names it', jobs.st === 'bad' && jobs.state === '1 failing: chase-onboarding', jobs.state);
check('Twilio names how many keys are missing once the route says which', tw.st === 'warn' && tw.state === '1 key missing', tw.state);
check('summary: "2 need a look", red when one is red', summary(b).text === '2 need a look' && summary(b).st === 'bad', JSON.stringify(summary(b)));
check('worst first', worst(b)[0].id === 'jobs' && worst(b)[1].id === 'twilio');
check('Twilio without the per-key split still says a key is missing', services({ ...base, platform: { ...base.platform, integrations: { ...base.platform.integrations, twilio: false } } }).find(s => s.id === 'twilio')!.state === 'A key is missing');
check('Filter and wordless search', matches(jobs, 'bad', '') && !matches(jobs, 'ok', '') && matches(jobs, 'all', 'CHASE') && !matches(jobs, 'all', 'stripe'));

const told = services({ ...base, services: { neon: { state: 'ok', note: 'Up · backup done' }, assistant: { state: 'unknown', note: '' }, stripe: { state: 'bad', note: 'Webhook failing' } } });
check('Build’s verdict is used as-is: colour and words', told.find(s => s.id === 'neon')!.st === 'ok' && told.find(s => s.id === 'neon')!.state === 'Up · backup done' && told.find(s => s.id === 'stripe')!.st === 'bad');
check('"unknown" from the route reads "Can’t see here" with a grey dot', told.find(s => s.id === 'anthropic')!.st === '' && told.find(s => s.id === 'anthropic')!.state === CANT);
check('no "server says" block on the owner tools or without a server verdict', ['data', 'agree', 'wipe', 'jobs'].every(id => localSt(base, id) === null)
  && localSt({ ...base, services: { stripe: { state: 'bad', note: 'x' } } }, 'agree') === null);
check('…but there is one when the server says red and the page’s own reads say green', localSt({ ...base, services: { stripe: { state: 'bad', note: 'x' } } }, 'stripe') === 'ok');
check('a card-charging job never gets a Re-run button (canRerun false hides it)', page0().includes("c.canRerun === false") && page0().includes('charges ? null'));

const fresh = services({ ...base, crons: base.crons.map(c => ({ ...c, health: null })) });
check('jobs that have not run yet are grey and not counted in "need a look"', fresh.find(s => s.id === 'jobs')!.st === '' && fresh.find(s => s.id === 'jobs')!.state === '6 not run yet' && summary(fresh).st === 'ok');
check('…even when the route calls them amber', services({ ...base, crons: base.crons.map(c => ({ ...c, health: null })), services: { jobs: { state: 'warn', note: '6 not run yet' } } }).find(s => s.id === 'jobs')!.st === '');
const overdue = services({ ...base, crons: base.crons.map((c, i) => i === 0 ? { ...c, health: { ...run('ok'), status: 'warn' as const, note: 'Overdue' } } : c) });
check('an overdue job (it ran before, not since) is red and named', overdue.find(s => s.id === 'jobs')!.st === 'bad' && overdue.find(s => s.id === 'jobs')!.state === '1 overdue: generate-tee-times', overdue.find(s => s.id === 'jobs')!.state);
check('the jobs lead line says overdue is red', page0().includes('Red means it failed, never finished or is overdue'));
check('the assistant switched off is grey, even if the route says ok', services({ ...base, birdie: { ...base.birdie!, enabled: false }, services: { assistant: { state: 'ok', note: 'Off' } } }).find(s => s.id === 'anthropic')!.st === '');
check('a route red on the assistant is never hidden by the "Off is grey" rule', services({ ...base, birdie: { ...base.birdie!, enabled: false }, services: { assistant: { state: 'bad', note: 'x' } } }).find(s => s.id === 'anthropic')!.st === 'bad');
check('the two dialogs close on Escape and keep Tab inside', page0().includes("e.key === 'Escape'") && page0().includes("e.key !== 'Tab'") && (page0().match(/<Dialog labelledBy/g) ?? []).length === 2);

const orphans = { checked: false, items: [], acknowledged: [], note: '' };
check('a manager sees only the Data check among the owner tools', tools({ isOwner: false, orphans, versions: null, versionsErr: '', wipe: null, wipeErr: '', wiped: null }).map(t => t.id).join() === 'data');
const own = tools({ isOwner: true, orphans, versions: null, versionsErr: 'no', wipe: { open: true, closesAt: '2026-12-01T05:00:00Z', confirmWords: 'WIPE TEST DATA', wiped: { Course: 14, Booking: 4798 }, kept: {} }, wipeErr: '', wiped: null });
check('the owner sees all three tools', own.map(t => t.id).join() === 'data,agree,wipe');
check('the wipe line says until when and how many', own[2].state === 'Open until Dec 1 · 4,812 records', own[2].state);

// Every feature of the old System page is still on it, folded into its service.
const page = page0();
for (const [what, needle] of [
  ['job runs', '/api/admin/system'], ['re-run', '/api/admin/system/rerun-job'], ['platform balance', '/api/admin/platform-stripe'], ['Sentry test error', '/api/admin/sentry-test'],
  ['orphan sweep', '/api/admin/orphan-sweep'], ['force delete', 'forceDeleteId'], ['agreement publishing', '/api/admin/agreement-versions'],
  ['launch wipe', '/api/admin/data-reset'], ['backups link', 'L!.backups'], ['CI link', 'L!.ci'], ['commit history', 'L!.commits'],
  ['Stripe webhooks link', 'L!.stripeWebhooks'], ['Cal.com webhook', '/api/calcom/webhook'], ['assistant spend', 'dailyCap'], ['How to fix', 'How to fix'],
] as const) check(`kept: ${what}`, page.includes(needle));
const css = readFileSync('src/app/admin/system/system.module.css', 'utf8');
const ovZ = Number(/\.ov \{[^}]*z-index: (\d+)/.exec(css)?.[1]);
check('this page’s dialogs sit under the shared Modal (z-50), so "Confirm it’s you" opens on top of Publish', ovZ > 30 && ovZ < 50, String(ovZ));
check('the Sentry test shows the route’s own 503/504 words (raw fetch, d.error)', /fetch\('\/api\/admin\/sentry-test'/.test(page) && page.includes('d.error ||'));
check('the wipe asks for a reason of 4+ characters, as the route does', page.includes('wipeReason.trim().length < 4'));
check('no "Birdie" shown to the reader (the log key birdie.reply stays)', !/>[^<]*\bBirdie\b/.test(page));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
