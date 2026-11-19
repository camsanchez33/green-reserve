// Emails and texts redo (Cam 2026-11-19): short links greenreserve.app/b|p|r|a/<code> (lib/short-links).
// A code stands for one long link on our own site, is unguessable, reused for the same link, expires
// with it, and the route redirects to exactly the long link — nothing more.
//   DATABASE_URL=… npx tsx scripts/short-links-db-test.ts
import { prisma } from '../src/lib/prisma';
import { shortLink, resolveShortLink, shortLinkRoute, newCode, ownPath, CODE_ALPHABET, CODE_LENGTH } from '../src/lib/short-links';
import { WIPED_TABLES } from '../src/lib/data-reset';
import { readFileSync, existsSync } from 'fs';

process.env.NEXT_PUBLIC_URL = 'https://greenreserve.test';
let failed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) { failed++; if (extra !== undefined) console.log('   ', extra); } };
const TAG = `sl-${Date.now()}`;
const codeOf = (s: string) => s.split('/').pop()!;

async function main() {
  // Codes
  const codes = new Set(Array.from({ length: 2000 }, newCode));
  check(`codes are ${CODE_LENGTH} characters from a 32-letter alphabet (~50 bits), and don't repeat`, codes.size === 2000 && [...codes].every(c => c.length === CODE_LENGTH && [...c].every(ch => CODE_ALPHABET.includes(ch))) && CODE_ALPHABET.length === 32 && new Set(CODE_ALPHABET).size === 32);
  check('only our own site: another host, a protocol-relative link or junk is refused', ownPath('https://evil.test/x') === null && ownPath('//evil.test/x') === null && ownPath('https://greenreserve.test/checkin/b1?token=t') === '/checkin/b1?token=t');

  // Make, reuse, resolve
  const long = `https://greenreserve.test/checkin/${TAG}?token=tok-${TAG}`;
  const a = await shortLink('p', long, { courseId: null });
  check('a pay link becomes greenreserve.test/p/<code>', /^greenreserve\.test\/p\/[2-9A-HJ-NP-Z]{10}$/.test(a), a);
  check('the same long link reuses its code', (await shortLink('p', long)) === a);
  check('…but the same link under another kind gets its own', (await shortLink('r', long)) !== a);
  check('the code resolves to exactly the long link (path and query on our site)', (await resolveShortLink('p', codeOf(a))) === `/checkin/${TAG}?token=tok-${TAG}`);
  check('the wrong kind does not resolve', (await resolveShortLink('b', codeOf(a))) === null);
  check('an unknown or malformed code does not resolve', (await resolveShortLink('p', 'ZZZZZZZZZZ')) === null && (await resolveShortLink('p', "x' OR 1=1")) === null && (await resolveShortLink('q', codeOf(a))) === null);
  check('a link to another site is texted as it is, never shortened', (await shortLink('p', 'https://evil.test/x')) === 'https://evil.test/x');

  // Expiry
  const soon = await shortLink('a', `https://greenreserve.test/courses/${TAG}?date=2030-05-01&players=4`, { expiresAt: new Date(Date.now() + 3600_000) });
  check('an alert link works until its end', (await resolveShortLink('a', codeOf(soon))) !== null);
  check('…and not after it', (await resolveShortLink('a', codeOf(soon), new Date(Date.now() + 2 * 3600_000))) === null);

  // The route
  const GET = shortLinkRoute('p');
  const res = await GET(new Request(`https://greenreserve.test/p/${codeOf(a)}`, { headers: { 'x-forwarded-for': '203.0.113.9' } }), { params: Promise.resolve({ code: codeOf(a) }) });
  check('the route redirects (302) to exactly the long link, uncached, no referrer', res.status === 302 && res.headers.get('location') === long && res.headers.get('cache-control') === 'no-store' && res.headers.get('referrer-policy') === 'no-referrer', { status: res.status, location: res.headers.get('location') });
  const miss = await GET(new Request('https://greenreserve.test/p/ZZZZZZZZZZ', { headers: { 'x-forwarded-for': '203.0.113.9' } }), { params: Promise.resolve({ code: 'ZZZZZZZZZZ' }) });
  check('an unknown code is a plain 404', miss.status === 404);
  for (const k of ['b', 'p', 'r', 'a']) check(`/${k}/[code] is routed to the ${k} handler`, existsSync(`src/app/${k}/[code]/route.ts`) && readFileSync(`src/app/${k}/[code]/route.ts`, 'utf8').includes(`shortLinkRoute('${k}')`));
  check('the redirect routes are rate limited per connection', readFileSync('src/lib/short-links.ts', 'utf8').includes('rateLimit(`short-link:ip:${evidentiaryIp(req)}`, 60, 600)'));
  check('ShortLink is cleared by the launch wipe', (WIPED_TABLES as readonly string[]).includes('ShortLink'));

  // Reuse respects the end: the same alert link with a later end gets a new code; the same end reuses it.
  const t2 = `https://greenreserve.test/courses/${TAG}?date=2030-05-02&players=2`;
  const e1 = new Date(Date.now() + 3600_000), e2 = new Date(Date.now() + 7200_000);
  const x1 = await shortLink('a', t2, { expiresAt: e1 });
  check('the same alert link and end reuses its code; a different end gets its own', (await shortLink('a', t2, { expiresAt: e1 })) === x1 && (await shortLink('a', t2, { expiresAt: e2 })) !== x1);

  // HELP and START name the course the number last agreed for (and fall back to GreenReserve).
  const { lastConsentCourse, textCourse, recordSmsConsent } = await import('../src/lib/sms-consent');
  const { helpText } = await import('../src/lib/sms-copy');
  const course = await prisma.course.create({ data: { name: `Short Links GC ${TAG}`, slug: `sl-course-${TAG}`, address: '1', city: 'T', state: 'NY', zipCode: '10990', holes: 18, phone: '(555) 010-3000', proShopPhone: '(555) 010-4000', timezone: 'America/New_York' } as never });
  const phone = '+15185550123';
  check('a number with no consent row names no course', (await lastConsentCourse(phone)) === null);
  await recordSmsConsent(phone, 'opt_in', { method: 'web_booking', courseId: course.id });
  const named = await lastConsentCourse(phone);
  check('…after it agrees at a course, HELP names that course and its pro shop phone', named?.name === course.name && named?.phone === '(555) 010-4000' && helpText(named?.name, named?.phone).startsWith(`Short Links GC ${TAG}`.slice(0, 12)) && helpText(named?.name, named?.phone).includes('(555) 010-4000'), named);
  check('textCourse: unknown id is null, never throws', (await textCourse('no-such-course')) === null && (await textCourse(null)) === null);
  await prisma.smsConsent.deleteMany({ where: { phone } });
  await prisma.course.delete({ where: { id: course.id } });

  await prisma.shortLink.deleteMany({ where: { target: { contains: TAG } } });
}
main().then(async () => { await prisma.$disconnect(); console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`); if (failed) process.exit(1); })
  .catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
