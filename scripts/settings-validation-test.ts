// SD-1 — assertions on lib/settings-validation, the boundary behind the
// operator settings PATCH.   npx tsx scripts/settings-validation-test.ts
import { validateSettingsPatch, normalizeHttpUrl } from '../src/lib/settings-validation';

let failed = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) console.log('  ok   ', name);
  else { failed++; console.log('  FAIL ', name, got !== undefined ? '— got: ' + JSON.stringify(got) : ''); }
}
const ALLOWED = ['name', 'holes', 'par', 'minPlayers', 'maxPlayers', 'cancellationHours', 'giftCardUrl', 'website', 'brandColor', 'type', 'walkingAllowed', 'hasCaddies', 'description', 'establishedYear', 'courseRating', 'phone'];
const v = (body: Record<string, unknown>) => validateSettingsPatch(body, ALLOWED);

console.log('normalizeHttpUrl');
check('blank stays blank', normalizeHttpUrl('') === '' && normalizeHttpUrl(null) === '');
check('bare domain gets https', normalizeHttpUrl('shop.example.com/gift') === 'https://shop.example.com/gift', normalizeHttpUrl('shop.example.com/gift'));
check('http kept', normalizeHttpUrl('http://x.com') === 'http://x.com/');
check('javascript: rejected', normalizeHttpUrl('javascript:alert(1)') === null);
check('data: rejected', normalizeHttpUrl('data:text/html,hi') === null);
check('garbage rejected', normalizeHttpUrl('ht!tp://%%%') === null);

console.log('validateSettingsPatch');
{ const r = v({ giftCardUrl: 'javascript:alert(document.cookie)' }); check('THE case: javascript: gift-card URL is refused', !r.ok, r); }
{ const r = v({ giftCardUrl: 'squareup.com/gift/abc' }); check('gift-card bare domain normalised', r.ok && r.data.giftCardUrl === 'https://squareup.com/gift/abc', r); }
{ const r = v({ holes: -3 }); check('negative holes refused', !r.ok, r); }
{ const r = v({ holes: '18' }); check('numeric string coerced', r.ok && r.data.holes === 18, r); }
{ const r = v({ holes: 18.5 }); check('fractional holes refused', !r.ok, r); }
{ const r = v({ minPlayers: 4, maxPlayers: 2 }); check('min > max refused', !r.ok, r); }
{ const r = v({ cancellationHours: 99999 }); check('absurd cancellation window refused', !r.ok, r); }
{ const r = v({ cancellationHours: 0 }); check('zero cancellation window allowed (no-fee course)', r.ok && r.data.cancellationHours === 0, r); }
{ const r = v({ brandColor: 'red' }); check('non-hex brand colour refused', !r.ok, r); }
{ const r = v({ brandColor: '#24513B' }); check('hex brand colour accepted', r.ok, r); }
{ const r = v({ type: 'country-club' }); check('unknown type refused', !r.ok, r); }
{ const r = v({ walkingAllowed: 'after12' }); check('walking enum accepted', r.ok, r); }
{ const r = v({ hasCaddies: 'true' }); check('boolean coerced from string', r.ok && r.data.hasCaddies === true, r); }
{ const r = v({ description: 'x'.repeat(6000) }); check('40KB description refused', !r.ok, r); }
{ const r = v({ name: '   ' }); check('blank name refused', !r.ok, r); }
{ const r = v({ establishedYear: '' }); check('blank establishedYear becomes null', r.ok && r.data.establishedYear === null, r); }
{ const r = v({ establishedYear: 1899 }); check('establishedYear 1899 accepted', r.ok, r); }
{ const r = v({ courseRating: 71.4 }); check('float rating accepted', r.ok && r.data.courseRating === 71.4, r); }
{ const r = v({ phone: '(555) 123-4567', bogusKey: 'ignored' }); check('non-allow-listed key dropped', r.ok && !('bogusKey' in r.data) && r.data.phone === '(555) 123-4567', r); }
{ const r = v({}); check('empty patch is fine', r.ok && Object.keys(r.data).length === 0, r); }

console.log(failed === 0 ? '\nALL PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
