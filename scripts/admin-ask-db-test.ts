// AW-3b: Ask's read-only tools — each refuses a role its page's API refuses,
// validates its inputs, and returns links only to admin pages. Needs a DB.
// Run: npx tsx scripts/admin-ask-db-test.ts
import { prisma } from '../src/lib/prisma';
import { runAskTool, ASK_TOOLS } from '../src/lib/admin-ask';
let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };

(async () => {
  ok('four tools, none of them writes', ASK_TOOLS.length === 4 && ASK_TOOLS.every(t => /^(list|bookings|money)_/.test(t.name)));
  const v = await runAskTool('bookings_by_course', {}, 'viewer');
  ok('a viewer can’t read bookings or revenue (Revenue is support+)', v.isError);
  const m = await runAskTool('money_problems', {}, 'viewer');
  ok('a viewer can’t read money problems', m.isError);
  const c = await runAskTool('list_courses', {}, 'viewer');
  ok('a viewer can list courses (Courses is viewer+)', !c.isError);
  const courses = JSON.parse(c.content) as { link: string }[];
  ok('every course links to its admin page', courses.every(x => x.link.startsWith('/admin/courses/')));
  ok('an unknown role sees nothing', (await runAskTool('list_courses', {}, 'nobody')).isError);
  ok('bad dates are refused', (await runAskTool('bookings_by_course', { from: '2026-13-01', to: 'x' }, 'support')).isError);
  ok('from after to is refused', (await runAskTool('bookings_by_course', { from: '2026-10-10', to: '2026-10-01' }, 'support')).isError);
  ok('more than 400 days is refused', (await runAskTool('bookings_by_course', { from: '2024-01-01', to: '2026-10-01' }, 'support')).isError);
  const b = await runAskTool('bookings_by_course', { from: '2026-10-01', to: '2026-10-21' }, 'support');
  const bj = JSON.parse(b.content) as { courses: { bookings: number; feesCollected: number }[] };
  ok('every live course is listed, quiet ones with zeros', !b.isError && bj.courses.length === courses.length && bj.courses.every(x => x.bookings >= 0 && x.feesCollected >= 0));
  const i = await runAskTool('list_inquiries', { status: 'pending', unchangedForDays: 3 }, 'viewer');
  ok('inquiries filter by stage and age', !i.isError && (JSON.parse(i.content) as { stage: string; daysSinceLastChange: number }[]).every(x => x.stage === 'pending' && x.daysSinceLastChange >= 3));
  ok('an unknown tool is an error, never a query', (await runAskTool('delete_course', {}, 'owner')).isError);
  const mp = await runAskTool('money_problems', {}, 'support');
  ok('money problems never carry card details', !mp.isError && !/pm_|card_|cus_|pi_/.test(mp.content));
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})();
