// Admin cleanup (Cam 2026-11-18): no link in the app points at an admin page that doesn't exist, and the old Messages
// screen's links land on Course support. Reads the sources. Run: npx tsx scripts/admin-links-test.ts
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

let failed = 0;
const check = (l: string, c: boolean, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + d}`); if (!c) failed++; };
const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : []; });

// Every literal /admin/<segment> in src (links, redirects, emails) has a page at src/app/admin/<segment>/page.tsx.
const missing: string[] = [];
for (const f of walk('src')) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/['"`(]\/admin\/([a-z][a-z-]*)(?=[/?'"`#)\s$]|$)/g)) {
    const seg = m[1];
    if (!existsSync(`src/app/admin/${seg}/page.tsx`)) missing.push(`${f}: /admin/${seg}`);
  }
}
check('every /admin/<page> link in src has a page', missing.length === 0, [...new Set(missing)].join(', '));
check('Build by hand and the Broadcasts redirect are gone', !existsSync('src/app/admin/create/page.tsx') && !existsSync('src/app/admin/broadcasts/page.tsx'));

// The old Messages screen: its address redirects, and links that went there open the exact chat on Course support.
const m = readFileSync('src/app/admin/messages/page.tsx', 'utf8');
check('/admin/messages redirects to Course support, keeping ?id= and ?courseId=', /redirect\(id \? `\/admin\/support\?id=/.test(m) && m.includes('/admin/support?courseId='));
check("Needs attention opens the course's chat itself (a chat, or its earlier messages by thread id)", readFileSync('src/lib/admin-action-queue.ts', 'utf8').includes('href: `/admin/support?id=${worst.chatId ?? t.id}`'));
check("the email for a course's message links to that chat on Course support", readFileSync('src/app/api/operator/messages/route.ts', 'utf8').includes('/admin/support?id=${thread.id}'));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
