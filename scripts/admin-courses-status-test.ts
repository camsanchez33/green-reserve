// ADMIN-REDO Golf Courses: pins the status rule (src/app/api/admin/courses/directory/status.ts).
import { courseStatus, onGolfCourses, RISK_DAYS } from '../src/app/api/admin/courses/directory/status';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };
const now = new Date('2026-11-12T17:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
const base = { archivedAt: null, active: true, liveStatus: 'live', firstWentLiveAt: ago(60), welcomeEmailSentAt: null, createdAt: ago(90) };

check('at risk is 14 days', RISK_DAYS === 14);
check('live 60 days, booked 15 days ago → at risk', courseStatus(base, ago(15), now) === 'risk');
check('live 60 days, never booked → at risk', courseStatus(base, null, now) === 'risk');
check('live 60 days, booked 13 days ago → live', courseStatus(base, ago(13), now) === 'live');
check('live 13 days, never booked → live (too new to be at risk)', courseStatus({ ...base, firstWentLiveAt: ago(13) }, null, now) === 'live');
check('live since the welcome email when firstWentLiveAt is missing', courseStatus({ ...base, firstWentLiveAt: null, welcomeEmailSentAt: ago(30) }, null, now) === 'risk');
check('never live → onboarding', courseStatus({ ...base, active: false, liveStatus: 'draft', firstWentLiveAt: null }, null, now) === 'onboarding');
check('active but not on the public site, never live → onboarding', courseStatus({ ...base, liveStatus: 'draft', firstWentLiveAt: null }, null, now) === 'onboarding');
check('was live, taken down → offline', courseStatus({ ...base, active: false, liveStatus: 'offline' }, ago(1), now) === 'offline');
check('archived → archived', courseStatus({ ...base, archivedAt: ago(2) }, ago(1), now) === 'archived');
check('Golf courses lists live, at risk and offline courses', onGolfCourses('live') && onGolfCourses('risk') && onGolfCourses('offline'));
check('…never an onboarding course (one home per course)', !onGolfCourses('onboarding'));
check('…and archived courses only on the archived view', !onGolfCourses('archived'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
