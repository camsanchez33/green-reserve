// Inquiries (Cam approved the mockup 2026-11-17): the page's promises that a refactor could quietly undo.
// Source checks; no database. Run: npx tsx scripts/admin-inquiries-page-test.ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

let failed = 0;
const check = (l: string, c: boolean, d = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + d}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');
const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : []; });

// Admin never refunds a golfer (CLAUDE.md): nothing on an admin page opens the refund dialog.
const opens = walk('src/app/admin').filter(f => /setRefundTarget\(\s*(?!null)[a-zA-Z]/.test(read(f)));
check('no admin page opens the refund dialog', opens.length === 0, opens.join(', '));

// One address, two pages: a course in outreach gets the outreach page; any other inquiry (or one the outreach route
// doesn't know) keeps the full record that Onboarding, Golf courses, Messages and the emails link to.
const pick = read('src/app/admin/inquiries/[id]/page.tsx');
check('/admin/inquiries/[id] shows the record for an inquiry not in outreach, or a 404 there',
  /r\.ok && !r\.data\.inOutreach\) \|\| \(!r\.ok && r\.status === 404\)\)\) return <InquiryRecord \/>/.test(pick));
check('…and the outreach page otherwise', /<OutreachCourse course=\{r\.data\}/.test(pick));

// The old board keeps its own address, and the record's Back returns to it.
check('the old board writes /admin/inquiries/all into the address bar', read('src/app/admin/inquiries/all/page.tsx').includes("replaceState(null, '', '/admin/inquiries/all'"));
check("the record's Back goes to the old board when it came from there", read('src/app/admin/inquiries/[id]/InquiryRecord.tsx').includes("(backTab || backSearch ? '/admin/inquiries/all' : '/admin/inquiries')"));
check('Overview "Waiting to onboard" opens Onboarding', /<Link href="\/admin\/onboarding" className=\{`\$\{g\.glass\} \$\{g\.kpi\}`\}>\s*<span className=\{g\.kpiL\}>Waiting to onboard/.test(read('src/app/admin/page.tsx')));

// Call notes are never dropped: leaving the page sends what's waiting, one save runs at a time.
const call = read('src/app/admin/inquiries/calls/[id]/page.tsx');
check('call notes are sent on leaving the page (pagehide, keepalive)', call.includes("addEventListener('pagehide', leave)") && call.includes('keepalive: true'));
check('…and when the page unmounts', /return \(\) => \{ window\.removeEventListener\('pagehide', leave\); leave\(\); \}/.test(call));
check('…one save at a time, "Saved" only when nothing is waiting', call.includes('if (running.current || !pending()) return;') && call.includes("if (pending()) { flush(); return; }"));

// A logged email with a note, or a fourth email, still shows on the course page.
check('emails beyond the first three, or with a note, stay in the history', read('src/app/admin/inquiries/[id]/OutreachCourse.tsx').includes("t.direction === 'in' || t.note || !firstThree.has(t.id)"));

// The "test data until Nov 23" line uses the same moment as the clear and the wipe.
{
  const page = read('src/app/admin/inquiries/page.tsx');
  const reset = read('src/lib/data-reset.ts');
  const pageAt = page.match(/const TEST_UNTIL = '([^']+)'/)?.[1];
  const resetAt = reset.match(/export const OUTREACH_START = new Date\('([^']+)'\)/)?.[1];
  check('the Outreach test-data line ends when the clear and the wipe stop taking inquiries', !!pageAt && pageAt === resetAt, `${pageAt} vs ${resetAt}`);
  check('…and only shows before then', /Date\.now\(\) < Date\.parse\(TEST_UNTIL\)/.test(page));
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
