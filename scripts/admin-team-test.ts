// Settings → Team (Cam approved the mockup 2026-11-16, lanes/admin.md "Approved, to build: Settings → Team").
// Pins the page's helpers and the behaviour the re-skin must keep. Run: npx tsx scripts/admin-team-test.ts
import { readFileSync } from 'fs';
import { ROLES, roleLabel, initials, areasText, toggleArea, whenSignedIn, statusOf } from '../src/app/admin/employees/logic';
import { ALL_AREAS } from '../src/lib/admin-areas';

let failed = 0;
const check = (name: string, ok: boolean, got?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || got === undefined ? '' : `  got: ${JSON.stringify(got)}`}`); if (!ok) failed++; };

const now = new Date(2026, 10, 16, 12, 0);
const at = (y: number, m: number, d: number, h = 8, mi = 2) => new Date(y, m, d, h, mi).toISOString();

check('three role tiles: Manager, Support, Viewer', ROLES.map(r => r.value).join() === 'manager,support,viewer');
check('role labels, owner included', roleLabel('owner') === 'Owner' && roleLabel('viewer') === 'Viewer' && roleLabel('odd') === 'odd');
check('initials', initials('Cam Sanchez') === 'CS' && initials('  jordan  ') === 'J' && initials('') === '?', initials('  jordan  '));
check('areas: owner, never set, none, every, some', areasText({ role: 'owner', areas: null }) === 'Everything'
  && areasText({ role: 'support', areas: null }) === 'Everything their role reaches'
  && areasText({ role: 'support', areas: [] }) === 'Only Home and My profile'
  && areasText({ role: 'manager', areas: [...ALL_AREAS] }) === 'Every area'
  && areasText({ role: 'support', areas: ['courses', 'messages'] }) === 'Courses, Messages');
check('toggling keeps catalog order', toggleArea(['messages'], 'pipeline', true).join() === 'pipeline,messages' && toggleArea(['pipeline', 'messages'], 'pipeline', false).join() === 'messages');
check('signed in: today, yesterday, this year, another year', whenSignedIn(at(2026, 10, 16), now) === 'today, 8:02 AM'
  && whenSignedIn(at(2026, 10, 15, 16, 12), now) === 'yesterday, 4:12 PM' && whenSignedIn(at(2026, 9, 2), now) === 'Oct 2'
  && whenSignedIn(at(2025, 11, 31), now) === 'Dec 31, 2025' && whenSignedIn('junk', now) === '', whenSignedIn(at(2026, 10, 15, 16, 12), now));
check('status: green signed in, amber never, grey off', statusOf({ active: true, lastLoginAt: at(2026, 10, 16) }, now).tone === 'ok'
  && statusOf({ active: true, lastLoginAt: null }, now).row === 'Never signed in' && statusOf({ active: true, lastLoginAt: null }, now).tone === 'warn'
  && statusOf({ active: false, lastLoginAt: at(2026, 10, 16) }, now).tone === 'none' && statusOf({ active: false, lastLoginAt: null }, now).row === 'Turned off'
  && statusOf({ active: true, lastLoginAt: at(2026, 10, 16) }, now).detail === 'Active · signed in today, 8:02 AM');

const page = readFileSync('src/app/admin/employees/page.tsx', 'utf8');
const dlg = readFileSync('src/app/admin/employees/TeamDialogs.tsx', 'utf8');
check('list: same GET through adminFetch', /adminFetch<Admin\[\]>\('\/api\/admin\/employees'/.test(page));
check('changes: PATCH through stepUpFetch (step-up and reason as before)', /stepUpFetch\('\/api\/admin\/employees', \{ method: 'PATCH'/.test(page));
check('add: POST through stepUpFetch with name, email, role, areas', /stepUpFetch\('\/api\/admin\/employees', \{\s*method: 'POST'/.test(dlg) && /JSON\.stringify\(\{ name, email, role, areas \}\)/.test(dlg));
check('add: at least one area', /areas\.length === 0\) \{ setError\('Tick at least one area they can open\.'\)/.test(dlg));
check('same PATCH bodies: role, areas, active, reset', /\{ role \}/.test(page) && /\{ action: 'areas', areas: editing\.areas \}/.test(page) && /\{ active: !admin\.active \}/.test(page) && /\{ action: 'reset_password' \}/.test(page));
check('reset and turn off/on confirm first; no areas asks too', /resetPassword[\s\S]*?await ask\(/.test(page) && /toggleActive[\s\S]*?await ask\(/.test(page) && /editing\.areas\.length === 0 && !\(await ask\(/.test(page));
check('the owner edits anyone but themselves; areas never for an owner', /const canEdit = isOwner && !me;/.test(page) && /const canAreas = canEdit && a\.role !== 'owner';/.test(page));
check('plus and actions only for the owner (a manager reads)', /\{isOwner && <button type="button" className=\{s\.plus\}/.test(page) && /\{isOwner && \(\s*<div className=\{s\.acts\}>/.test(page));
check('audit link per person', /href=\{`\/admin\/audit\?admin=\$\{a\.id\}`\}/.test(page));
check('"Hasn’t set their own" when the password is temporary', /a\.mustChangePassword && /.test(page));
check('no browser confirm boxes', !/[^.\w]confirm\(/.test(page) && !/[^.\w]confirm\(/.test(dlg));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
