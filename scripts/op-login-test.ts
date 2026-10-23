// Operator login (Cam 2026-10-19, HOMEPAGE_SPEC §0a): minimal, the homepage's
// photo and logo beside the form on a laptop, the form alone on a phone, and a
// "Need help signing in?" line. Source guards. Pure. Run: npx tsx scripts/op-login-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const s = readFileSync('src/app/dashboard/login/page.tsx', 'utf8');
// Cam 2026-10-20: the photo fills the screen and the card sits under the logo, on
// every sign-in page (sign in, two-step code, forgot and reset password).
const shell = readFileSync('src/components/AuthPhotoShell.tsx', 'utf8');
check('the homepage photo fills the screen with the cream logo on it', shell.includes('/home/hero-coast.jpg') && shell.includes('logo-cream.svg') && s.includes('<AuthPhotoShell'));
check('the code, forgot and reset pages share the same photo look', ['src/app/dashboard/2fa/page.tsx', 'src/app/dashboard/forgot-password/page.tsx', 'src/app/dashboard/reset-password/page.tsx'].every(f => readFileSync(f, 'utf8').includes('<AuthPhotoShell')));
check('a "Need help signing in?" line', s.includes('Need help signing in?'));
check('the form submits on Enter as a real form', s.includes('<form onSubmit='));
check('help goes to the course inbox (admin@, MAIL-1), never the send-only noreply@', s.includes('mailto:${ADMIN_EMAIL}') && !s.includes('NOREPLY_EMAIL') && !s.includes('noreply@'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
