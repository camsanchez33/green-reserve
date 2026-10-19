// Operator login (Cam 2026-10-19, HOMEPAGE_SPEC §0a): minimal, the homepage's
// photo and logo beside the form on a laptop, the form alone on a phone, and a
// "Need help signing in?" line. Source guards. Pure. Run: npx tsx scripts/op-login-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const s = readFileSync('src/app/dashboard/login/page.tsx', 'utf8');
check('a photo panel beside the form, hidden on phones', s.includes('hidden md:flex') && s.includes('/home/hero-coast.jpg'));
check('a "Need help signing in?" line', s.includes('Need help signing in?'));
check('the form submits on Enter as a real form', s.includes('<form onSubmit='));
check('help goes to the admin inbox, never the send-only address', s.includes('mailto:thegreenreserve@outlook.com') && !s.includes('hello@greenreserve.app'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
