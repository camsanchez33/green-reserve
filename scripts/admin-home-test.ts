// Admin lane, Home PR (2026-11-10): the phone menu, Needs you for every area,
// and no link to a page the login's areas refuse. Reads the sources.
// Run: npx tsx scripts/admin-home-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };

const rail = readFileSync('src/components/admin/AdminSidebar.tsx', 'utf8');
const home = readFileSync('src/app/admin/page.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');

// Phone: the rail is a drawer below md, a dialog while open.
check('the rail is hidden below md and shown from md', /id="admin-menu"[^>]*md:flex \$\{menuOpen \? 'flex' : 'hidden'\}/.test(rail));
check('a menu button opens it and names what it controls', /aria-label="Open menu" aria-expanded=\{menuOpen\} aria-controls="admin-menu"/.test(rail));
check('while open it is a modal dialog', /role=\{menuOpen \? 'dialog' : undefined\} aria-modal=\{menuOpen \|\| undefined\}/.test(rail));
check('Escape closes it', /e\.key === 'Escape'\) \{ setMenuOpen\(false\)/.test(rail));
check('focus moves in, Tab wraps inside, focus returns to the menu button', /closeButtonRef\.current\?\.focus\(\)/.test(rail) && /e\.key !== 'Tab'/.test(rail) && /opener\?\.focus\(\)/.test(rail));
check('every link in the drawer closes it', (rail.match(/onClick=\{\(\) => setMenuOpen\(false\)\}/g) ?? []).length >= 4);
check('the content clears the rail only from md up', /@media \(min-width: 768px\) \{ \.admin-content \{ margin-left: var\(--admin-sidebar-w\); \} \}/.test(css)
  && /^\.admin-content \{ padding-top: var\(--admin-topbar-h\);/m.test(css) && !/^\.admin-content \{[^}]*margin-left/m.test(css));

// Needs you: course to-dos show for a Courses login without Problems.
check('Needs you renders on problems OR course to-dos', /\{\(problems \|\| courseTodos\.length > 0\) && \(/.test(home));
check('the Problems link shows only with problems', /\{problems && <Link href="\/admin\/problems"/.test(home));

// AW-11: no dead ends.
check('Live courses links to Goals only with the Company area', /href=\{areas\.includes\('company'\) \? '\/admin\/goals' : undefined\}/.test(home));
check('a to-do in an area the login lacks opens the course', /need && !areas\.includes\(need\) \? \{ href: `\/admin\/courses\/\$\{courseId\}`/.test(home));
for (const [p, a] of [['/admin/revenue', 'money'], ['/admin/messages', 'messages']]) {
  check(`a to-do on ${p} needs the ${a} area`, home.includes(`['${p}', '${a}']`));
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
