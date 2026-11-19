// LOOK-BG and the manage page's email race (Golfer lane, 2026-11-19).
// Run: npx tsx scripts/golfer-look-bg-test.ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { lookPageBg, golferLookVars } from '../src/components/golfer/look';
import { lookBgCss, LOOK_BG_NEVER } from '../src/components/golfer/useLookBackground';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

// The background
const darkBg = (golferLookVars({ booking_look: { look: 'dark', accent: 'green' } }) as Record<string, string>)['--g-bg'];
check('Dark: the page background is the look\'s own --g-bg', lookPageBg({ booking_look: { look: 'dark', accent: 'green' } }) === darkBg && darkBg === '#111211');
check('Light, no look, or a Dark look without a preset accent: nothing set', lookPageBg({ booking_look: { look: 'light', accent: 'blue' } }) === null && lookPageBg({ booking_look: null, brand_color: '#7A1F2B' }) === null && lookPageBg({ booking_look: { look: 'dark', accent: null as never } }) === null && lookPageBg({}) === null);
check('screen only, so a Dark receipt still prints on white', lookBgCss('#111211').startsWith('@media screen {') && lookBgCss('#111211').includes('html { background-color: #111211; }') && lookBgCss('#111211').includes('html > body { background-color: #111211; }'));
check('never under the dashboard, admin or owner pages', ['/dashboard', '/dashboard/tee-sheet', '/admin', '/admin/finance', '/cam', '/cam/x'].every(p => LOOK_BG_NEVER.test(p)) && ['/manage/a', '/book', '/courses/x', '/receipt/a', '/checkin/a', '/administer', '/dashboards'].every(p => !LOOK_BG_NEVER.test(p)));

const hook = readFileSync('src/components/golfer/useLookBackground.ts', 'utf8');
check('the hook adds one style element and removes it on unmount (restoring what was there)', hook.includes("document.head.appendChild(el);") && hook.includes('return () => { el.remove(); };') && hook.includes('}, [bg]);') && !/\.style\.background/.test(hook));

// Only golfer look pages call it
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : []; });
const users = walk('src').filter(f => !f.endsWith('useLookBackground.ts') && /useLookBackground|LookBackground\b/.test(readFileSync(f, 'utf8')));
const allowed = /^src\/app\/(courses|book|g|checkin|manage|pay|receipt|statement|events|membership)\//;
check('only golfer pages use it; never dashboard or admin', users.length > 0 && users.every(f => allowed.test(f)), users);
for (const f of ['src/app/manage/[bookingId]/page.tsx', 'src/app/checkin/[bookingId]/page.tsx', 'src/app/receipt/[bookingId]/page.tsx', 'src/app/book/BookClient.tsx', 'src/app/courses/[slug]/CourseBookingClient.tsx', 'src/app/courses/[slug]/login/LoginClient.tsx', 'src/app/courses/[slug]/member/YourCourseClient.tsx']) {
  check(`${f} sets the Dark background`, users.includes(f));
}

// The manage page's email race
const manage = readFileSync('src/app/manage/[bookingId]/page.tsx', 'utf8');
const fn = manage.slice(manage.indexOf('async function sendModifiedEmail()'), manage.indexOf('async function handleSwapTime()'));
check('each send takes a number; only the latest one sets the line', fn.includes('const seq = ++emailSeq.current;') && fn.includes('if (seq !== emailSeq.current) return;') && fn.indexOf('if (seq !== emailSeq.current) return;') < fn.indexOf("setEmailState(r && r.ok ? 'sent' : 'failed');") && fn.indexOf('await fetch') < fn.indexOf('if (seq !== emailSeq.current) return;'));

// The race itself, simulated: two sends, the first answers last and fails.
async function race() {
  let seqRef = 0; let state = 'sent';
  const resolvers: Array<(ok: boolean) => void> = [];
  const send = async () => {
    const seq = ++seqRef; state = 'sending';
    const ok = await new Promise<boolean>(r => resolvers.push(r));
    if (seq !== seqRef) return;
    state = ok ? 'sent' : 'failed';
  };
  const a = send(); const b = send();
  resolvers[1](true); await b;
  resolvers[0](false); await a;
  return state;
}
race().then(st => {
  check('the first change\'s slow failed email can\'t overwrite the second change\'s "sent"', st === 'sent', st);
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
});
