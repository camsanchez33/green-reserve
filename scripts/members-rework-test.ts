// Members rework (Cam 2026-10-19: list first). Source guards on the page and
// its dues wording. Run: npx tsx scripts/members-rework-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const p = readFileSync('src/app/dashboard/members/page.tsx', 'utf8');
check('no Tiers / Members switch — the list comes first', !p.includes("setPanel(p)") && p.indexOf('{/* The list */}') < p.indexOf('{/* Memberships (tiers) */}'));
// DENSE-5 (Cam 2026-10-28): the sentence became a strip — active, not renewed, not linked, member rounds this year.
check('the strip on top: active, not renewed, not linked, member rounds this year', p.includes('>Not renewed<') && p.includes('>Not linked<') && p.includes('>Member rounds this year<') && p.includes("duesOf(m, now).kind === 'expired'"));
check('the table: renews, member since, rounds and spend this year (spend only with payments)', p.includes("th('renews', 'Renews'") && p.includes("th('since', 'Member since'") && p.includes("th('rounds', 'Rounds this year'") && p.includes("seesSpend && th('spend'") && readFileSync('src/app/api/operator/members/route.ts', 'utf8').includes("can(session, 'money.payments')"));
check('the Not renewed number and its filter show the same members', p.includes("duesOf(m, now).kind === 'expired').length") && p.includes("!notRenewedOnly || duesOf(m, now).kind === 'expired'") && p.includes('setNotRenewedOnly(true)'));
check('search, membership, status and unpaid filters', p.includes('placeholder="Find a member"') && p.includes('/>Dues unpaid</label>') && p.includes('Every membership'));
check('dues status uses the same overdue rule as Remind (unpaid, or expired and not comped)', p.includes("m.paymentStatus === 'comped'") && p.includes("m.paymentStatus === 'unpaid'") && p.includes('new Date(m.expiresAt) < now'));
check('edit actions only for members.edit', p.includes("const canEdit = pageAccess.can('members.edit');") && p.includes('{canEdit && ('));
check('the 1% dues fee is stated plainly', p.includes('a 1% fee is added to what they pay'));
check('no decorative icons in rows', !p.includes('UserCheck') && !p.includes('Trash2'));
check('a free membership never reads as dues unpaid (owed is checked first)', p.indexOf('owed <= 0') > -1 && p.indexOf('owed <= 0') < p.indexOf("m.paymentStatus === 'unpaid'"));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
