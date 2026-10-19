// Launch Walk 1 fixes (2026-10-19): cash at the counter collects no GreenReserve
// fee, dues can't be double-paid or revive a deactivated membership, link
// previews carry each page's own title, golfer names are escaped in emails,
// and the confirmation email uses the one plain template. Source-level guards,
// like manage-access-test. Pure — no database. Run: npx tsx scripts/walk1-fixes-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const src = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) => src(p).replace(/\/\/.*$/gm, '');

const ops = code('src/app/api/operator/bookings/route.ts');
const paidOffline = ops.slice(ops.indexOf("if (action === 'paid_offline')"), ops.indexOf('const result = action'));
check('paid at the counter never charges the booking fee', paidOffline.length > 0 && !paidOffline.includes('chargeAccessFeeSeparately'));
check('…and gives back a booking fee already taken separately', paidOffline.includes('refundSeparateAccessFee'));
check('the counter confirm no longer says the fee goes on their card', !src('src/app/dashboard/page.tsx').includes('booking fee is charged to their saved card'));

const dues = code('src/app/api/membership/[id]/route.ts');
check('dues pay holds the membership row lock', /FROM "CourseMembership" WHERE id = \$\{m\.id\} FOR UPDATE/.test(dues));
check('dues paid at the shop count as paid', dues.includes("now.paymentStatus === 'paid_offline'"));
check('a deactivated membership is not revived by paying', dues.includes("now.status !== 'active'") && !/status:\s*'active'/.test(dues));

check('the root metadata sets no og:url for every page', !/openGraph:\s*\{[^}]*url:/.test(code('src/app/layout.tsx')));
const course = code('src/app/courses/[slug]/page.tsx');
check('a course page previews with its own name and photo', course.includes('openGraph: { title, description, url: `/courses/${slug}`') && course.includes('heroPhotoUrl'));
for (const f of ['teesheet', 'for-courses', 'contact', 'privacy', 'terms', 'operator-agreement']) {
  check(`/${f} has its own link-preview title`, /openGraph: \{ title: '[^']+ \| GreenReserve'/.test(src(`src/app/${f}/page.tsx`)));
}

const email = src('src/lib/email.ts');
const confirm = email.slice(email.indexOf('export async function sendBookingConfirmation'), email.indexOf('export async function sendOperatorBookingNotification'));
check('the confirmation email has no pill badge, emoji or tinted boxes', !/#dcfce7|&#10003;|&#128205;|#eff6ff|#fefce8|#1e40af/.test(confirm));
check('golfer names are escaped in emails', !/\$\{data\.golferName\}|\$\{data\.golferEmail\}\)/.test(email));
check("no 'keep 100%' claim on the payouts panel", !/keep 100%/i.test(src('src/components/dashboard/money/PayoutsPanel.tsx')));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
