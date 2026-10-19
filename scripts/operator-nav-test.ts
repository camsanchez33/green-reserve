// The operator dashboard's top bar (CLUB-3) must show every tab: never a
// sideways scroll, and the tabs never share a row with the course switcher
// (Cam 2026-10-19: with Pro shop added, Settings was cut off at 1280px).
// Reads the component's source. Run: npx tsx scripts/operator-nav-test.ts
import { readFileSync } from 'fs';

const src = readFileSync('src/components/OperatorSidebar.tsx', 'utf8');
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };

const desktopNav = src.slice(src.indexOf('<header className="hidden md:block'));
check('the desktop tabs never scroll sideways', !/overflow-x-auto/.test(desktopNav.slice(0, desktopNav.indexOf('</header>'))));
const multi = src.match(/const bar = myCourses\.length > 1 \? \{([\s\S]*?)\} : \{([\s\S]*?)\};/);
check('the bar layout depends on the course switcher', !!multi);
if (multi) {
  const [, withSwitcher, single] = multi;
  check('with a course switcher the tabs always have their own row', !/nowrap/.test(withSwitcher) && /basis-full/.test(withSwitcher));
  check('a single course shares one row only at 2xl', /2xl:flex-nowrap/.test(single) && !/(^|[\s'])(xl|lg):flex-nowrap/.test(single));
  check('both layouts wrap', /flex-wrap/.test(withSwitcher) && /flex-wrap/.test(single));
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
