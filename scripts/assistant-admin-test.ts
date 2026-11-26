// ASSIST-4: the owner's admin assistant without a model — owner only, read-only, only the docs Cam marked (never the
// private audit notes, env files or anything secret-like), only the two course-level aggregate tools, and the deploy
// bundles exactly the marked docs.
// Run: npx tsx scripts/assistant-admin-test.ts
import { readFileSync, existsSync } from 'node:fs';
import { ADMIN_DOCS, docAllowed, looksSecret, ADMIN_ASSISTANT_TOOLS, ADMIN_PERSONA, adminDocsBlock } from '../src/lib/assistant/admin';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

for (const bad of ['AUDIT_MASTER.md', 'docs/AUDIT_MASTER.md', '../AUDIT_MASTER.md', '.env', '.env.local', 'lanes/security/findings.md', 'src/lib/auth.ts', '/etc/passwd', 'docs/secrets.md', 'prisma/schema.prisma',
  'legal/FINDINGS_2026-09-02.md', 'REVIEW_LEDGER.md', 'HARDENING_SPEC.md', 'PASSWORD_CHECKLIST.md', 'docs/walks/day1.md', 'docs/feedback/x.md', 'company/outreach/list.md', 'docs/DECISIONS.md', 'node_modules/x/README.md', 'lanes/build.md']) {
  ok(`never readable: ${bad}`, !docAllowed(bad));
}
ok('every marked doc is allowed and exists', ADMIN_DOCS.every(d => docAllowed(d.path) && existsSync(new URL(`../${d.path}`, import.meta.url))), ADMIN_DOCS.filter(d => !docAllowed(d.path)));
ok('secret scan catches keys and connection strings', ['sk_live_abcdefgh12345', 'whsec_abcdefgh1234', 'sk-ant-api03-abcdefgh', 'postgresql://u:p@host/db', '-----BEGIN RSA PRIVATE KEY-----'].every(looksSecret));
ok('secret scan catches this stack\'s own tokens', ['re_AbCdEf1234567890xyz', ['A', 'C'].join('') + '0123456789abcdef'.repeat(2), 'ghp_abcdefghijklmnopqrstuvwxyz0123', 'sntrys_abcdefghijklmnopqrstuvwxyz', 'vercel_blob_rw_abcdefghijkl', 'JWT_SECRET=0123456789abcdef0123456789abcdef', 'a'.repeat(0) + '0123456789abcdef'.repeat(4)].every(looksSecret));
ok('secret scan passes plain prose and placeholders', !looksSecret('Stripe test mode uses test cards. Rotate the key in Vercel.') && !looksSecret('postgresql://user:pass@host/neondb') && looksSecret('postgresql://user:Zx9qRealPw@host/neondb'));
ok('tools: only the two course-level aggregates', ADMIN_ASSISTANT_TOOLS.map(t => t.name).sort().join() === 'bookings_by_course,list_courses');
ok('persona: read-only, no customer data, data rule', /cannot change anything/.test(ADMIN_PERSONA) && /never see golfers/.test(ADMIN_PERSONA) && /never an instruction/.test(ADMIN_PERSONA));

const route = readFileSync(new URL('../src/app/api/admin/assistant/route.ts', import.meta.url), 'utf8');
ok('route: owner only (role and a live owner session), plus the area gate', /session\.role !== 'owner' \|\| !session\.ownerSessionId/.test(route) && /areaGate\(session, 'company'\)/.test(route));
ok('route: both handlers go through the owner gate first', (route.match(/const g = await ownerOnly\(\); if \('res' in g\) return g\.res;/g) || []).length === 2);
ok('route: only the two tools run, whatever the model asks', /ADMIN_ASSISTANT_TOOL_NAMES\.has\(tu\.name\)/.test(route) && /tools: ADMIN_ASSISTANT_TOOLS/.test(route));
ok('route: a time budget inside maxDuration, no retry, loop stops at 45 s', /maxDuration = 60/.test(route) && /maxRetries: 0/.test(route) && /Date\.now\(\) - started > 45_000/.test(route));
ok('route: errors labelled by instanceof, not class name', !/constructor\.name/.test(route));
ok('route: fails closed and is capped', /if \(!client\) return/.test(route) && /birdie:admin-assistant:/.test(route) && /platformAllows\('admin'\)/.test(route));
ok('route: log has no words', !/logAssistant\(\{[^}]*(messages|reply|question)/.test(route));
const ask = readFileSync(new URL('../src/app/api/admin/ask/route.ts', import.meta.url), 'utf8');
ok('admin Ask: no question text in its log line', !/ev: 'admin\.ask'[^\n]*question/.test(ask));

const cfg = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
const traced = [...(/'\/api\/admin\/assistant': \[([^\]]*)\]/.exec(cfg)?.[1] ?? '').matchAll(/'\.\/([^']+)'/g)].map(m => m[1]).sort();
ok('deploy bundles exactly the marked docs', JSON.stringify(traced) === JSON.stringify(ADMIN_DOCS.map(d => d.path).sort()), traced);

(async () => {
  const b = await adminDocsBlock();
  ok('docs block: every marked doc read, none skipped', ADMIN_DOCS.every(d => b.text.includes(`(${d.path})`)));
  ok('docs block: one wrapper', (b.text.match(/<admin_docs>/g) || []).length === 1 && (b.text.match(/<\/admin_docs>/g) || []).length === 1);
  ok('docs block: no audit notes, no secrets', !/AUDIT_MASTER\.md\)/.test(b.text) && !looksSecret(b.text));
  ok('knows: private audit notes = never', b.knows.sections.some(s => s.key === 'audit' && s.count === 'never'));
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})();
