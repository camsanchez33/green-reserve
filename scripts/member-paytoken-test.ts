// A self-joined member staff move onto a tier gets a pay token, so the pay
// link, Remind unpaid and the dues cron reach them (they all skip payToken '').
// Run: npx tsx scripts/member-paytoken-test.ts
import { readFileSync } from 'fs';
const src = readFileSync('src/app/api/operator/members/route.ts', 'utf8');
const patch = src.slice(src.indexOf('export async function PATCH'), src.indexOf('export async function DELETE'));
const ok = /!membership\.payToken && \(tierId \?\? membership\.tierId\) \? \{ payToken: randomUUID\(\) \}/.test(patch);
console.log(`${ok ? 'PASS' : 'FAIL'}  PATCH mints a pay token for a tiered membership that has none`);
const keeps = !/payToken: randomUUID\(\)\s*,?\s*\n\s*\}/.test(patch.replace(/\.\.\.\(!membership\.payToken[^\n]*\n/, ''));
console.log(`${keeps ? 'PASS' : 'FAIL'}  an existing token is never replaced`);
if (!ok || !keeps) { console.log('\nFAILED'); process.exit(1); }
console.log('\nALL PASS');

// Self-joined members have no invite address: both dues senders fall back to the account's email.
const cron = readFileSync('src/app/api/cron/send-reminders/route.ts', 'utf8');
for (const [name, file] of [['members route pay link', src], ['renewal cron', cron]] as const) {
  const ok2 = file.includes('const to = m.golfer?.email || m.inviteEmail;') && file.includes('email: to,');
  console.log(`${ok2 ? 'PASS' : 'FAIL'}  ${name} sends to the account's email first`);
  if (!ok2) process.exit(1);
}
