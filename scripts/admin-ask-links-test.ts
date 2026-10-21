// AW-3b: an Ask answer can only link to admin pages on this site — never
// off-site, never javascript:, never out of /admin by '..'. Run: npx tsx scripts/admin-ask-links-test.ts
import { ADMIN_LINK, safeAdminPath } from '../src/lib/admin-ask-links';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const links = (t: string) => [...t.matchAll(ADMIN_LINK)].map(m => m[2]);
const O = 'https://greenreserve.app';

check('an admin page link is a link', links('[Pine](/admin/courses/abc)')[0] === '/admin/courses/abc');
check('with a query string', links('[x](/admin/messages?courseId=c1)')[0] === '/admin/messages?courseId=c1');
check('off-site stays text', links('[x](https://evil.example)').length === 0);
check('javascript: stays text', links('[x](javascript:alert(1))').length === 0);
check('protocol-relative stays text', links('[x](//evil.example/admin)').length === 0);
check('/adminx is not admin', links('[x](/adminx)').length === 0);
check('a golfer page is not admin', links('[x](/dashboard)').length === 0);
check('safe path keeps an admin page', safeAdminPath('/admin/courses/abc', O) === '/admin/courses/abc');
check('…and its query', safeAdminPath('/admin/messages?courseId=c1', O) === '/admin/messages?courseId=c1');
check('.. cannot climb out of /admin', safeAdminPath('/admin/../dashboard', O) === null);
check('%2e%2e cannot either', safeAdminPath('/admin/%2e%2e/dashboard', O) === null);
check('.. staying inside /admin is fine', safeAdminPath('/admin/courses/../revenue', O) === '/admin/revenue');
check('backslash tricks resolve on-site or are refused', [safeAdminPath('/admin\\..\\..\\x', O)].every(p => p === null || p.startsWith('/admin')));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
