// Cam 2026-10-26 ("I want to be able to see it before sending them a preview"):
// the admin's look link shows a built page but can never approve it or ask for
// changes. Run: npx tsx scripts/course-look-test.ts
import { readFileSync } from 'fs';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-course-look-0123456789';

let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

(async () => {
  const { signLookToken, signPreviewToken, verifyPreviewToken, verifyViewToken } = await import('../src/lib/preview-token');
  const look = await signLookToken('c1');
  const prev = await signPreviewToken('c1');
  ok('a look token shows the page', JSON.stringify(await verifyViewToken(look)) === JSON.stringify({ courseId: 'c1', look: true }));
  ok('…and the course preview token still does', JSON.stringify(await verifyViewToken(prev)) === JSON.stringify({ courseId: 'c1', look: false }));
  ok('a look token is NOT a preview token (approve / request changes refuse it)', (await verifyPreviewToken(look)) === null);
  for (const r of ['approve', 'request-changes']) {
    const src = readFileSync(`src/app/api/preview/[courseId]/${r}/route.ts`, 'utf8');
    ok(`${r} accepts only the course's preview token`, src.includes('verifyPreviewToken(') && !src.includes('verifyViewToken('));
  }
  for (const f of ['src/app/preview/[courseId]/page.tsx', 'src/app/api/preview/[courseId]/route.ts', 'src/app/api/preview/[courseId]/tee-times/route.ts']) {
    ok(`${f.split('/').slice(-2).join('/')} shows the page for either token`, readFileSync(f, 'utf8').includes('verifyViewToken('));
  }
  const client = readFileSync('src/app/courses/[slug]/CourseBookingClient.tsx', 'utf8');
  ok('the approve / request-changes bar never shows on a look', client.includes('{previewMode && !previewMode.look && !course.is_live && ('));
  const route = readFileSync('src/app/api/admin/course-look/route.ts', 'utf8');
  ok('the look link needs an admin login with Pipeline or Courses', route.includes('resolveAdminSession()') && route.includes("areaGate(session, 'courses')") && route.includes("hasArea(session, 'pipeline')"));
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('course-look: all passed');
})();
