// My profile (Cam 2026-11-15): /admin/profile shows "Changed <date>" from
// AdminUser.passwordChangedAt. The date is only true if EVERY write of an admin
// or owner password also writes it. A guard over src/app/api and src/lib: each
// Prisma `data: { ... }` object that sets passwordHash must set
// passwordChangedAt too, so a new password route that forgets it fails here.
// Also: the admin layout (the one place the session is resolved) passes it on
// AdminSessionView, reading only that field of the signed-in admin's own row.
// Run: npx tsx scripts/password-changed-at-test.ts
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); if (!ok) failed++; };

const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
walk('src/app/api'); walk('src/lib');

// The balanced-brace body of every `data: { ... }` in a file.
const dataBlocks = (src: string): string[] => {
  const out: string[] = [];
  const re = /data:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1, i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; }
    out.push(src.slice(m.index, i));
  }
  return out;
};

const writers: string[] = [];
const missing: string[] = [];
for (const f of files) {
  for (const b of dataBlocks(readFileSync(f, 'utf8'))) {
    if (!/\bpasswordHash\b/.test(b)) continue;
    writers.push(f);
    if (!/\bpasswordChangedAt\b/.test(b)) missing.push(f);
  }
}
// bootstrap, employees (create + reset), set-password, change-password today.
check('the guard finds the five known password writes', writers.length >= 5, writers);
for (const f of ['src/app/api/admin/bootstrap/route.ts', 'src/app/api/admin/employees/route.ts', 'src/app/api/admin/set-password/route.ts', 'src/app/api/admin/change-password/route.ts']) {
  check(`${f} writes a password`, writers.includes(f));
}
check('every password write also writes passwordChangedAt', missing.length === 0, missing);

const layout = readFileSync('src/app/admin/layout.tsx', 'utf8');
check('the admin layout passes passwordChangedAt to the session view', /passwordChangedAt:\s*row\?\.passwordChangedAt\?\.toISOString\(\)\s*\?\?\s*null/.test(layout));
check('the layout reads only the signed-in admin\'s own row', /findUnique\(\{\s*where:\s*\{\s*id:\s*s\.adminId\s*\}/.test(layout));
check('the layout selects only passwordChangedAt', /select:\s*\{\s*passwordChangedAt:\s*true\s*\}/.test(layout));
check('AdminSessionView declares passwordChangedAt: string | null', /passwordChangedAt:\s*string\s*\|\s*null;/.test(readFileSync('src/lib/admin-session-context.tsx', 'utf8')));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
