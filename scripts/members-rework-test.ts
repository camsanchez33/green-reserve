// Members rework (Cam 2026-10-19: list first). Source guards on the page and
// its dues wording. Run: npx tsx scripts/members-rework-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const p = readFileSync('src/app/dashboard/members/page.tsx', 'utf8');
check('no Tiers / Members switch — the list comes first', !p.includes("setPanel(p)") && p.indexOf('{/* The list */}') < p.indexOf('{/* Memberships (tiers) */}'));
check('counts on top: active, unpaid, renewing', p.includes('active · {unpaid} with dues unpaid · {renewing} renewing in the next 30 days'));
check('search, membership, status and unpaid filters', p.includes('placeholder="Find a member"') && p.includes('Dues unpaid only') && p.includes('Every membership'));
check('dues status uses the same overdue rule as Remind (unpaid, or expired and not comped)', p.includes("m.paymentStatus === 'comped'") && p.includes("m.paymentStatus === 'unpaid'") && p.includes('new Date(m.expiresAt) < now'));
check('edit actions only for members.edit', p.includes("const canEdit = pageAccess.can('members.edit');") && p.includes('{canEdit && ('));
check('the 1% dues fee is stated plainly', p.includes('a 1% fee is added to what they pay'));
check('no decorative icons in rows', !p.includes('UserCheck') && !p.includes('Trash2'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
