// Members audit 10 (archive, never delete): "Remove" hard-deleted a membership, and the schema's cascade
// (MemberCharge / MemberStatement onDelete: Cascade) took its account lines and statements — unpaid
// balances included — with it. Now only a membership with no history can be removed; one with account
// lines, statements, ledger rows or a dues payment is refused (staff set it Not active instead).
// Pure. Run: npx tsx scripts/member-remove-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const check = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const src = readFileSync('src/app/api/operator/members/route.ts', 'utf8');
const schema = readFileSync('prisma/schema.prisma', 'utf8');
const del = src.slice(src.indexOf('export async function DELETE'));

check('the cascade this guards against is real', /model MemberCharge \{[\s\S]*?membership +CourseMembership @relation\(fields: \[membershipId\], references: \[id\], onDelete: Cascade\)/.test(schema));
check('DELETE counts account lines, statements and ledger rows, and checks a dues payment', del.includes('prisma.memberCharge.count({ where: { membershipId: id } })') && del.includes('prisma.memberStatement.count({ where: { membershipId: id } })') && del.includes('prisma.moneyMove.count({ where: { membershipId: id } })') && del.includes('membership.lastPaidAt') && del.includes('membership.duesChargeStartedAt || membership.duesIntentId'));
check('…and refuses (409, says to set Not active) before anything is deleted', del.indexOf('status: 409') > 0 && del.indexOf('status: 409') < del.indexOf('courseMembership.delete(') && del.includes('set them to Not active instead'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
