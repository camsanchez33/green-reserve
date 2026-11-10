// Security lane 2026-11-10 (High): the member sign-in link sender is rate-limited and answers the same for members and
// non-members (the lookup and the send happen after the response). Run: npx tsx scripts/member-link-rate-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const src = readFileSync('src/app/api/member/[courseSlug]/send-code/route.ts', 'utf8');
const post = src.slice(src.indexOf('export async function POST'));

ok('capped per connection, with a security event', /rateLimit\(`member-code:ip:\$\{evidentiaryIp\(req\)\}`, 10, 600\)/.test(post) && post.includes("kind: 'rate_limited', surface: 'member'"));
ok('capped per address on the course, answering as if sent', /rateLimit\(`member-code:\$\{course\.id\}:\$\{email\}`, 3, 3600\)\)\) \{[\s\S]*?return SUCCESS\(\);/.test(post));
ok('the membership lookup and the send happen after the response', post.includes('after(sendLink(') && !post.includes('courseMembership') && !post.includes('await sendMemberMagicLink'));
ok('member or not, the same answer', (post.match(/return SUCCESS\(\);/g) ?? []).length === 2 && !post.includes("status: 500"));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
