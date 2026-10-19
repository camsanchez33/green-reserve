// Settings rework part 1 (Cam 2026-10-19): source checks for the section order,
// the old ?section= names, and the Finish setting up list's load gating.
// Run: npx tsx scripts/settings-sections-test.ts
import { readFileSync } from 'fs';

const page = readFileSync('src/app/dashboard/settings/page.tsx', 'utf8');
const cx = readFileSync('src/components/dashboard/money/CancellationsPanel.tsx', 'utf8');
let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };

const order = ['Your course', 'Course layout', 'Booking rules', 'Prices & fees', 'Facilities', 'Pro shop', 'Staff', 'Your account'];
const sections = page.slice(page.indexOf('const SECTIONS = ['), page.indexOf('] as const;'));
check('sections are in setup order', order.every((s, i) => i === 0 || sections.indexOf(`'${s}'`) > sections.indexOf(`'${order[i - 1]}'`)) && order.every(s => sections.includes(`'${s}'`)));
check('old Pricing & cancellation link resolves', page.includes(`'Pricing & cancellation': 'Prices & fees'`));
check('old Staff & account link resolves', page.includes(`'Staff & account': 'Staff'`));
check('Money links to the new section name', cx.includes('/dashboard/settings?section=Prices+%26+fees'));
check('status strip is gone', !page.includes('staff account{staffCount'));
check('"Getting paid moved" note is gone', !page.includes('Getting paid moved'));
check('gallery item waits for the photo list', page.includes('photosLoaded && photos.length === 0'));
check('Your account forms are hidden from staff logins', page.includes('{!isStaffLogin && <SectionCard title="Two-step sign-in">'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
