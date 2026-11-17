// Settings rework part 1 (Cam 2026-10-19), redone by SETTINGS-6 (Cam 2026-11-17, approved mockup
// lanes/dashboard/settings-mockup.html): source checks for the four areas in order, the old ?section= names still
// landing somewhere, the photo count waiting for its load, and owner-only account rows.
// Run: npx tsx scripts/settings-sections-test.ts
import { readFileSync } from 'fs';

const page = readFileSync('src/app/dashboard/settings/page.tsx', 'utf8');
const course = readFileSync('src/components/dashboard/settings/CourseArea.tsx', 'utf8');
const account = readFileSync('src/components/dashboard/settings/AccountArea.tsx', 'utf8');
const cx = readFileSync('src/components/dashboard/money/CancellationsPanel.tsx', 'utf8');
let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };

const order = ["key: 'course', title: 'Your course'", "key: 'booking', title: 'Booking'", "key: 'payments', title: 'Payments'", "key: 'account', title: 'Your account'"];
check('four areas, in order', order.every((s, i) => page.includes(s) && (i === 0 || page.indexOf(s) > page.indexOf(order[i - 1]))));
check('old Pricing & cancellation link resolves', page.includes(`'Pricing & cancellation': { area: 'payments' }`));
check('old Staff & account link resolves', page.includes(`'Staff & account': { area: 'staff' }`));
check('old Pro shop link lands on the register', page.includes(`'Pro shop': { area: 'payments', target: 'g-register' }`));
check('Money links to a section name that still resolves', cx.includes('/dashboard/settings?section=Prices+%26+fees') && page.includes(`'Prices & fees': { area: 'payments' }`));
check('the staff screen stays reachable until Team is built', page.includes("goArea('staff')") && page.includes('<StaffPermissions />'));
check('status strip is gone', !page.includes('staff account{staffCount'));
check('"Getting paid moved" note is gone', !page.includes('Getting paid moved'));
check('the photo count waits for the photo list', course.includes("photos ? plural(photos.length, 'photo') : '…'"));
check('password and two-step are the owner’s only', account.includes('{ctx.owner && <Row id="signin-pw"') && account.includes('{ctx.owner && <Row id="signin-2fa"'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
