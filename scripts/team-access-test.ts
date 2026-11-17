// Team access model (Cam 2026-11-17, lib/team-access.ts). No database.
// Run: npx tsx scripts/team-access-test.ts
import {
  ADVANCED_ONLY, AREAS, applyAreaLevel, areaKeys, areaLevels, effectiveKeys, overridesFor, personStatus,
  resolveMemberPermissions, SUGGESTED_ROLES,
} from '../src/lib/team-access';
import { ALL_KEYS, LEGACY_KEYS, normalizePermissions, PRESETS, resolveStaffPermissions, type PermissionKey } from '../src/lib/staff-permissions';

let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const eq = (a: readonly string[], b: readonly string[]) => a.join(',') === b.join(',');

// Areas cover the catalog exactly once.
const seen = new Map<string, string[]>();
for (const a of AREAS) for (const k of areaKeys(a.key)) seen.set(k, [...(seen.get(k) ?? []), a.key]);
for (const k of ADVANCED_ONLY) seen.set(k, [...(seen.get(k) ?? []), 'advanced']);
ok('every permission key is in exactly one area, or Advanced only', ALL_KEYS.every(k => seen.get(k)?.length === 1), ALL_KEYS.filter(k => seen.get(k)?.length !== 1).map(k => [k, seen.get(k)]));
ok('there are six areas', AREAS.length === 6);
ok('Refund rounds is in no area level (Cam 2026-10-29: given person by person)', !AREAS.some(a => Object.values(a.levels).some(ks => ks?.includes('money.refund_rounds'))));
ok('the tee sheet offers no "No access" (every login sees it)', !AREAS.find(a => a.key === 'sheet')!.levels.none);

// Every level round-trips: applying it reads back as that level.
for (const a of AREAS) {
  for (const lvl of ['none', 'view', 'full'] as const) {
    if (!a.levels[lvl]) { ok(`${a.key}: ${lvl} not offered → refused`, applyAreaLevel([], a.key, lvl) === null); continue; }
    for (const base of [[], ALL_KEYS, PRESETS[1].keys] as PermissionKey[][]) {
      const keys = applyAreaLevel(base, a.key, lvl)!;
      ok(`${a.key} set to ${lvl} (from ${base.length} keys) reads back as ${lvl}`, areaLevels(keys)[a.key] === lvl, areaLevels(keys));
    }
  }
}
const lowered = applyAreaLevel(ALL_KEYS, 'sheet', 'view')!;
ok('lowering the tee sheet to View also drops what needs a cancel (waive fee, weather cancel)', !lowered.includes('sheet.waive_fee') && !lowered.includes('sheet.weather_cancel') && !lowered.includes('sheet.cancel'));
ok('…and leaves other areas alone', lowered.includes('money.refund') && lowered.includes('shop.sell') && lowered.includes('settings.edit'));
const legacyAreas = areaLevels(LEGACY_KEYS);
ok('a set between levels reads as custom (Legacy tee sheet)', legacyAreas.sheet === 'custom', legacyAreas);

// Suggested roles.
const byKey = new Map(SUGGESTED_ROLES.map(s => [s.key, s]));
ok('Manager, Front desk and Starter are SP-A’s presets exactly', (['manager', 'front_desk', 'starter'] as const).every(k => eq(byKey.get(k)!.keys, normalizePermissions(PRESETS.find(p => p.key === k)!.keys))));
ok('no suggested role refunds rounds', SUGGESTED_ROLES.every(s => !s.keys.includes('money.refund_rounds')));
ok('Grounds crew can post the course alert (conditions) and nothing that moves money', byKey.get('grounds')!.keys.includes('sheet.course_alert') && !byKey.get('grounds')!.keys.some(k => k.startsWith('money.') || k === 'sheet.cancel'));
ok('Bookkeeper sees payments and payouts, refunds nothing', ['money.payments', 'money.payouts'].every(k => byKey.get('bookkeeper')!.keys.includes(k as PermissionKey)) && !byKey.get('bookkeeper')!.keys.includes('money.refund'));

// Overrides: any wanted set over any role comes back exactly.
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = () => normalizePermissions(ALL_KEYS.filter(() => rnd() < 0.4));
let bad = 0;
for (let i = 0; i < 400; i++) {
  const role = pick(), want = pick();
  const o = overridesFor(role, want);
  if (!eq(effectiveKeys(role, o.grants, o.revokes), want)) bad++;
}
ok('overridesFor + effectiveKeys gives exactly the wanted keys, over 400 random role/person pairs', bad === 0, bad);
const o = overridesFor(byKey.get('front_desk')!.keys, [...byKey.get('front_desk')!.keys, 'money.refund_rounds']);
ok('one extra key over a role is one grant (with what it needs), no revokes', eq(o.grants, ['money.payments', 'money.refund_rounds']) && o.revokes.length === 0, o);
ok('a revoke drops what requires it', !effectiveKeys(['sheet.cancel', 'sheet.waive_fee'], [], ['sheet.cancel']).includes('sheet.waive_fee'));
ok('the locked key can’t be revoked', effectiveKeys(['sheet.view'], [], ['sheet.view']).includes('sheet.view'));

// Existing staff keep exactly what they have (no role → today's resolver, untouched).
const legacy = { courseId: 'c1', permissions: ['money.refund'], permissionsSetAt: null };
ok('a pre-SP-A row (never set) still resolves to Legacy', eq(resolveMemberPermissions(legacy), resolveStaffPermissions(legacy)) && eq(resolveMemberPermissions(legacy), normalizePermissions(LEGACY_KEYS)));
const own = { courseId: 'c1', permissions: ['sheet.checkin', 'money.refund'], permissionsSetAt: new Date(), roleId: null, grantKeys: ['shop.sell'], revokeKeys: ['sheet.checkin'] };
ok('a row with its own keys resolves to those keys, ignoring any stray overrides', eq(resolveMemberPermissions(own), resolveStaffPermissions(own)));
const roled = { courseId: 'c1', permissions: ALL_KEYS as string[], permissionsSetAt: new Date(), roleId: 'r1', grantKeys: ['money.refund_rounds'], revokeKeys: ['sheet.no_show'], courseRole: { courseId: 'c1', permissions: byKey.get('starter')!.keys } };
ok('a row with a role resolves to role + grants − revokes, never its stored keys', eq(resolveMemberPermissions(roled), normalizePermissions(['sheet.view', 'sheet.checkin', 'messages.use', 'money.payments', 'money.refund_rounds'])), resolveMemberPermissions(roled));
ok('a role from another course fails closed to the tee sheet only', eq(resolveMemberPermissions({ ...roled, courseRole: { courseId: 'c2', permissions: ALL_KEYS } }), ['sheet.view']));
ok('a missing role fails closed too', eq(resolveMemberPermissions({ ...roled, courseRole: null }), ['sheet.view']));

ok('status: invited until a password is set', personStatus({ active: true, invitedAt: new Date(), passwordSetAt: null }) === 'invited' && personStatus({ active: true, invitedAt: new Date(), passwordSetAt: new Date() }) === 'active');
ok('status: staff from before Team (never invited) are active', personStatus({ active: true, invitedAt: null, passwordSetAt: null }) === 'active');
ok('status: disabled wins', personStatus({ active: false, invitedAt: new Date(), passwordSetAt: null }) === 'disabled');

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('team-access: all passed');
