// Platform activity (Cam 2026-11-15): the board's one rule per service (lib/platform-status
// serviceStates), the GitHub run reading, and which jobs "Re-run job" may run.
// Pure. Run: npx tsx scripts/platform-status-test.ts
import { serviceStates, runOf, canRerun, CHARGING_JOBS, SENDING_DOMAIN, twilioStatus, type ServiceInput } from '../src/lib/platform-status';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

const now = new Date('2026-11-15T12:00:00Z');
const run = (at: string, conclusion: 'success' | 'failure' | 'running') => ({ at, conclusion, url: 'https://github.com/x/y/actions/runs/1' });
const base: ServiceInput = {
  now,
  crons: [{ job: 'hourly', status: 'ok' }, { job: 'monthly-review', status: 'ok' }],
  commitSha: '3f9c2ab',
  neon: { db: 'up', checkedAt: now.toISOString(), backup: run('2026-11-15T08:01:00Z', 'success') },
  github: { readable: true, backup: run('2026-11-15T08:01:00Z', 'success'), ci: { ...run('2026-11-15T10:00:00Z', 'success'), branch: 'main', name: 'Tests' } },
  resend: { keySet: true, domain: 'greenreserve.app', domainVerified: true },
  twilio: { accountSidSet: true, authTokenSet: true, fromNumberSet: true },
  stripe: { keySet: true, webhookSecretSet: true, lastWebhook: { at: now.toISOString(), outcome: 'ok' } },
  calcom: { state: 'on', webhookSecretSet: true },
  sentry: true,
  assistant: { enabled: true, flag: true, keySet: true },
  blob: { publicSet: true, privateSet: true },
};
const S = (over: Partial<ServiceInput>) => serviceStates({ ...base, ...over });

const all = S({});
ok('everything set: every service is ok', Object.values(all).every(s => s.state === 'ok'), all);
ok('eleven services', Object.keys(all).length === 11, Object.keys(all));
ok('vercel names the live commit', all.vercel.note === 'Commit 3f9c2ab live', all.vercel);
ok('no commit reported → unknown', S({ commitSha: '' }).vercel.state === 'unknown');

ok('a failing job turns jobs red and names it', S({ crons: [{ job: 'chase-onboarding', status: 'bad' }, { job: 'hourly', status: 'warn' }] }).jobs.note === '1 failing: chase-onboarding');
ok('a job not run yet is amber', S({ crons: [{ job: 'monthly-review', status: 'warn' }] }).jobs.state === 'warn');

ok('database down is red', S({ neon: { ...base.neon, db: 'down' } }).neon.state === 'bad');
ok('backup failed is red', S({ neon: { ...base.neon, backup: run('2026-11-15T08:01:00Z', 'failure') } }).neon.state === 'bad');
ok('backup over 30 hours old is amber', S({ neon: { ...base.neon, backup: run('2026-11-14T04:00:00Z', 'success') } }).neon.state === 'warn');
ok('backup running is not late', S({ neon: { ...base.neon, backup: run('2026-11-13T08:00:00Z', 'running') } }).neon.state === 'ok');
ok('backup unseen: database still up, says so', S({ neon: { ...base.neon, backup: null } }).neon.note === 'Up · backup can’t be seen here');

ok('GitHub unreadable → unknown ("Can’t see here")', S({ github: { readable: false, backup: null, ci: null } }).github.state === 'unknown');
ok('tests failing on main → amber', S({ github: { ...base.github, ci: { ...base.github.ci!, conclusion: 'failure' } } }).github.state === 'warn');
ok('backup failing → red on GitHub too', S({ github: { ...base.github, backup: run('2026-11-15T08:01:00Z', 'failure') } }).github.state === 'bad');

ok('no Stripe key → red', S({ stripe: { ...base.stripe, keySet: false } }).stripe.state === 'bad');
ok('no webhook event yet → amber', S({ stripe: { ...base.stripe, lastWebhook: null } }).stripe.state === 'warn');
ok('last webhook failed → amber', S({ stripe: { ...base.stripe, lastWebhook: { at: '', outcome: 'error' } } }).stripe.state === 'warn');

const tw = S({ twilio: { accountSidSet: true, authTokenSet: false, fromNumberSet: true } }).twilio;
ok('one Twilio key missing → amber, counted', tw.state === 'warn' && tw.note === '1 key missing', tw);
ok('two keys missing reads plural', S({ twilio: { accountSidSet: false, authTokenSet: false, fromNumberSet: true } }).twilio.note === '2 keys missing');
ok('twilioStatus reports presence only', JSON.stringify(twilioStatus({ TWILIO_ACCOUNT_SID: 'AC_secret', TWILIO_AUTH_TOKEN: '' } as unknown as NodeJS.ProcessEnv)) === '{"accountSidSet":true,"authTokenSet":false,"fromNumberSet":false}');

ok('no Resend key → red', S({ resend: { keySet: false, domain: 'greenreserve.app', domainVerified: null } }).resend.state === 'bad');
ok('domain not verified → red', S({ resend: { ...base.resend, domainVerified: false } }).resend.state === 'bad');
ok('domain unreadable → ok, key set', S({ resend: { ...base.resend, domainVerified: null } }).resend.note === 'Key set');
ok('sending domain comes from contact.ts', SENDING_DOMAIN === 'greenreserve.app', SENDING_DOMAIN);

ok('Cal.com off → amber', S({ calcom: { state: 'off' } }).calcom.state === 'warn');
ok('Cal.com invalid → red', S({ calcom: { state: 'invalid' } }).calcom.state === 'bad');
ok('assistant on without a key → red', S({ assistant: { enabled: false, flag: true, keySet: false } }).assistant.state === 'bad');
ok('assistant off by choice → ok', S({ assistant: { enabled: false, flag: false, keySet: false } }).assistant.note === 'Off');
ok('private blob store missing → amber', S({ blob: { publicSet: true, privateSet: false } }).blob.state === 'warn');
ok('no Sentry → amber', S({ sentry: false }).sentry.state === 'warn');

ok('a run still going reads running', runOf({ status: 'in_progress', conclusion: null, html_url: 'u', created_at: 'a' })?.conclusion === 'running');
ok('a cancelled run reads as failure', runOf({ status: 'completed', conclusion: 'cancelled', html_url: 'u', created_at: 'a' })?.conclusion === 'failure');
ok('no run → null', runOf(undefined) === null);

ok('charging jobs cannot be re-run', ['hourly', 'cancellation-cutoff', 'send-reminders'].every(j => !canRerun(j)) && CHARGING_JOBS.size === 3);
ok('the other jobs can', ['generate-tee-times', 'chase-onboarding', 'monthly-review'].every(canRerun));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
