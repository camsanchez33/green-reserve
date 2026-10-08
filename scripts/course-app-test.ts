// PWA-1 (PLATFORM_ROADMAP_SPEC §8): the home-screen icon's pure parts — the
// initials, the colour guard, and that the logo fetch never leaves our own Blob
// store. No database, no network.
// Run: npx tsx scripts/course-app-test.ts
import { initials, safeHex, logoDataUrl } from '../src/lib/course-app';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function main() {
  check('filler words skipped', initials('Pebble Creek Golf Club') === 'PC', initials('Pebble Creek Golf Club'));
  check('"The" skipped', initials('The Links at Spanish Bay') === 'SB', initials('The Links at Spanish Bay'));
  check('all filler falls back to the words', initials('Golf Club') === 'GC');
  check('one word', initials('Torrey') === 'T');
  check('empty name', initials('  ') === 'G');
  check('a hex colour passes', safeHex('#7a1f2b') === '#7a1f2b');
  check('anything else falls back', safeHex('red;background:url(x)') === '#24513B' && safeHex('') === '#24513B');
  check('a non-Blob host is never fetched', (await logoDataUrl('https://169.254.169.254/latest/meta-data')) === null);
  check('a look-alike host is never fetched', (await logoDataUrl('https://x.public.blob.vercel-storage.com.evil.test/a.png')) === null);
  check('http is never fetched', (await logoDataUrl('http://x.public.blob.vercel-storage.com/a.png')) === null);
  check('garbage is null', (await logoDataUrl('not a url')) === null);
  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
