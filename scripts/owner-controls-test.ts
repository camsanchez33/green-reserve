// Cam 2026-10-26 decisions from REVIEW_LEDGER "Needs Cam":
//   R-AUTH-005  the course alert is its own staff permission, capped at 280 characters
//   (settings)  the time zone and the course type are the owner's alone
//   R-AUTH-009  the member session lasts 7 days, token and cookie alike
//   R-GOLF-014  the perf check audits the PR's own build
// Run: npx tsx scripts/owner-controls-test.ts
import { readFileSync } from 'fs';
import { PRESETS, LEGACY_KEYS, PERMISSIONS } from '../src/lib/staff-permissions';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');
const preset = (k: string) => PRESETS.find(p => p.key === k)!.keys as string[];

// Course alert
ok('the course alert has its own permission in the catalog', PERMISSIONS.some(p => p.key === 'sheet.course_alert' && p.group === 'Tee sheet'));
ok('Front desk and Manager get it; Starter does not', preset('front_desk').includes('sheet.course_alert') && preset('manager').includes('sheet.course_alert') && !preset('starter').includes('sheet.course_alert'));
ok('staff from before permissions keep it (they could always post it)', (LEGACY_KEYS as string[]).includes('sheet.course_alert'));
const cond = read('src/app/api/operator/conditions/route.ts');
ok('the route checks the permission before writing', cond.indexOf("requirePermission(session, 'sheet.course_alert')") > 0 && cond.indexOf("requirePermission(session, 'sheet.course_alert')") < cond.indexOf('prisma.course.update'));
ok('…refuses anything but text, and more than 280 characters', cond.includes('COURSE_ALERT_MAX = 280') && cond.includes("typeof raw !== 'string'") && cond.includes('conditions.length > COURSE_ALERT_MAX'));
const sheet = read('src/app/dashboard/page.tsx');
const rail = read('src/components/OperatorSidebar.tsx');
ok('the sheet and the rail only offer it to logins that have it', sheet.includes('maxLength={280}') && /access\.can\('sheet\.course_alert'\) && <button/.test(sheet) && /access\.can\('sheet\.course_alert'\) && <button/.test(rail));

// Time zone and course type
const settings = read('src/app/api/operator/settings/route.ts');
ok('staff are refused the time zone and the course type', /session\.isStaff && \('timezone' in body \|\| 'type' in body\)\)/.test(settings) && settings.indexOf("'timezone' in body") < settings.indexOf('validateSettingsPatch(body'));
const page = read('src/app/dashboard/settings/page.tsx');
ok('the Settings screen never sends them for a staff login, and shows them read-only', /const POLICY_FIELDS = \[[^\]]*'timezone', 'type'\]/.test(page) && (page.match(/disabled=\{isStaffLogin\}/g) ?? []).length >= 2);

// Member session
const member = read('src/lib/member-session.ts');
const verify = read('src/app/api/member/[courseSlug]/verify/route.ts');
ok('the member token lasts 7 days, like its cookie', member.includes(".setExpirationTime('7d')") && !member.includes("'90d'") && verify.includes('maxAge: 60 * 60 * 24 * 7'));
ok('CLAUDE.md says 7 days', read('CLAUDE.md').includes('| Member (per-course) | `gr_member` | 7 days absolute'));

// Perf check
const perf = read('.github/workflows/perf-audit.yml');
ok('the perf check builds and starts THIS PR and audits localhost', perf.includes('npx next build') && perf.includes('next start -p 3000') && perf.includes('AUDIT_BASE_URL: http://localhost:3000') && !/AUDIT_BASE_URL:.*greenreserve/.test(perf));
ok('…against the seeded live course', perf.includes('npx tsx scripts/perf-seed.ts') && perf.includes('AUDIT_COURSE_SLUG: perf-audit') && read('scripts/perf-seed.ts').includes("liveStatus: 'live'"));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('owner-controls: all passed');
