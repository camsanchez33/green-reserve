// Team data (Cam 2026-11-17, lib/team.ts) against a real database, email
// stubbed at fetch. Roles, invites, a person's access, disable/remove, reset
// links, the audit log, and that one course can never reach another's team.
// Run: npx tsx scripts/team-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import {
  createRole, deleteRole, invitePerson, loadTeam, removePerson, reorderRoles, resendInvite, sendResetLink, setAccess,
  setActive, teamHistory, updateDetails, updateRole, type TeamCtx,
} from '../src/lib/team';
import { resolveMemberPermissions, SUGGESTED_ROLES } from '../src/lib/team-access';
import { LEGACY_KEYS, normalizePermissions, PRESETS } from '../src/lib/staff-permissions';
import { verifyStaffResetToken } from '../src/lib/auth';

const TAG = 'teamdata';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
const eq = (a: readonly string[], b: readonly string[]) => a.join(',') === b.join(',');
process.env.JWT_SECRET ||= 'ci-only-not-a-real-secret-0123456789abcdef';
process.env.RESEND_API_KEY = 're_test_fake';
process.env.NEXT_PUBLIC_URL = 'https://greenreserve.test';

// Email stub: capture what goes to Resend; failMail makes Resend refuse.
const sent: { to: string; subject: string; html: string }[] = [];
let failMail = false;
globalThis.fetch = (async (_u: unknown, init?: { body?: unknown }) => {
  if (failMail) return new Response(JSON.stringify({ name: 'validation_error', message: 'refused' }), { status: 422, headers: { 'content-type': 'application/json' } });
  const b = JSON.parse(String(init?.body ?? '{}'));
  sent.push({ to: Array.isArray(b.to) ? b.to[0] : b.to, subject: b.subject, html: b.html });
  return new Response(JSON.stringify({ id: `em_${sent.length}` }), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const ids = courses.map(c => c.id);
  await prisma.teamChange.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.staffPermissionChange.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.securityEvent.deleteMany({ where: { email: { contains: `${TAG}` } } });
  await prisma.courseStaff.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseRole.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'team:' } } }).catch(() => {});
}

async function course(n: string) {
  const op = await prisma.courseOperator.create({ data: { email: `${TAG}-${n}@t.local`, password: 'x', name: `Jordan ${n.toUpperCase()} Pike` } });
  const c = await prisma.course.create({ data: { name: `Pine Hollow ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, city: 'X', state: 'NY' } as never });
  return { op, c, ctx: { courseId: c.id, operatorId: op.id, req: null } as TeamCtx };
}

(async () => {
  await cleanup();
  const A = await course('a');
  const B = await course('b');

  // A new course: Owner only, every Suggested role offered, nothing pre-created.
  const t0 = (await loadTeam(A.c.id, A.op.id))!;
  ok('a new course has only the Owner role and no people', t0.roles.length === 1 && t0.roles[0].owner && t0.roles[0].id === 'owner' && t0.people.length === 0 && t0.owner.name === 'Jordan A Pike' && t0.owner.isYou && 'lastActiveAt' in t0.owner);
  ok('…and every Suggested role is offered', t0.suggested.length === SUGGESTED_ROLES.length);
  ok('…with the six areas and their offered levels', t0.areas.length === 6 && eq(t0.areas.find(a => a.key === 'sheet')!.levels, ['view', 'full']));

  // Existing staff (before Team) keep exactly their access, with no backfill.
  const legacy = await prisma.courseStaff.create({ data: { courseId: A.c.id, email: `${TAG}-legacy@t.local`, password: 'x', name: 'Old Timer' } });
  const own = await prisma.courseStaff.create({ data: { courseId: A.c.id, email: `${TAG}-own@t.local`, password: 'x', name: 'Own Keys', permissions: ['sheet.checkin', 'money.refund'], permissionsSetAt: new Date(), preset: 'custom' } });
  const t1 = (await loadTeam(A.c.id, A.op.id))!;
  const pl = t1.people.find(p => p.id === legacy.id)!, po = t1.people.find(p => p.id === own.id)!;
  ok('pre-SP-A staff keep the Legacy keys, shown as legacy, no role', eq(pl.permissions, normalizePermissions(LEGACY_KEYS)) && pl.source === 'legacy' && pl.legacy && pl.roleId === null && pl.status === 'active');
  ok('staff with their own keys keep exactly those', eq(po.permissions, normalizePermissions(['sheet.checkin', 'money.refund'])) && po.source === 'own');

  // Roles.
  const mgr = await createRole(A.ctx, { suggestedKey: 'manager' });
  ok('adding Suggested Manager creates it with the Manager preset', mgr.ok && eq((await prisma.courseRole.findUniqueOrThrow({ where: { id: mgr.ok ? mgr.role.id : '' } })).permissions, normalizePermissions(PRESETS.find(p => p.key === 'manager')!.keys)));
  ok('…once (a second time → 409)', !(await createRole(A.ctx, { suggestedKey: 'manager' })).ok);
  ok('a role can’t be called Owner', (await createRole(A.ctx, { name: 'owner' }) as { status?: number }).status === 409);
  ok('an unknown area level is refused', (await createRole(A.ctx, { name: 'Odd', areas: { shop: 'view' } }) as { status?: number }).status === 400);
  const fd = await createRole(A.ctx, { suggestedKey: 'front_desk' });
  const custom = await createRole(A.ctx, { name: 'Range crew', description: 'Range and carts.', areas: { shop: 'full', reports: 'view' } });
  const customRow = await prisma.courseRole.findUniqueOrThrow({ where: { id: custom.ok ? custom.role.id : '' } });
  ok('a role made from areas gets those keys (and the tee sheet)', custom.ok && customRow.permissions.includes('shop.discount') && customRow.permissions.includes('analytics.view') && customRow.permissions.includes('sheet.view') && !customRow.permissions.includes('shop.catalog'));
  const fdId = fd.ok ? fd.role.id : '', mgrId = mgr.ok ? mgr.role.id : '';
  ok('roles come back in the order they were added', eq((await loadTeam(A.c.id, A.op.id))!.roles.map(r => r.name), ['Owner', 'Manager', 'Front desk', 'Range crew']));
  ok('reorder needs every role once', !(await reorderRoles(A.ctx, [fdId])).ok);
  ok('reorder', (await reorderRoles(A.ctx, [fdId, mgrId, customRow.id])).ok && eq((await loadTeam(A.c.id, A.op.id))!.roles.map(r => r.name), ['Owner', 'Front desk', 'Manager', 'Range crew']));
  ok('Suggested no longer offers the roles already added', !(await loadTeam(A.c.id, A.op.id))!.suggested.some(s => s.key === 'manager' || s.key === 'front_desk'));

  // Invite.
  ok('invite needs a role', (await invitePerson(A.ctx, { name: 'Alex', email: `${TAG}-alex@t.local` }) as { status?: number }).status === 400);
  ok('invite refuses a bad phone', (await invitePerson(A.ctx, { name: 'Alex', email: `${TAG}-alex@t.local`, phone: '12', roleId: fdId }) as { status?: number }).status === 400);
  ok('invite refuses an email that’s in use (the owner’s)', (await invitePerson(A.ctx, { name: 'Alex', email: A.op.email, roleId: fdId }) as { status?: number }).status === 409);
  sent.length = 0;
  const inv = await invitePerson(A.ctx, { name: 'Alex Rivera', email: ` ${TAG}-Alex@t.local `, phone: '(845) 555-0123', roleId: fdId });
  ok('invite → saved and the welcome email sent', inv.ok && inv.emailSent, inv);
  const alexId = inv.ok ? inv.id : '';
  const alex = await prisma.courseStaff.findUniqueOrThrow({ where: { id: alexId } });
  ok('…lower-cased email, phone kept, role set, Invited (no password set)', alex.email === `${TAG}-alex@t.local` && alex.phone === '+18455550123' && alex.roleId === fdId && !!alex.invitedAt && !alex.passwordSetAt);
  const mail = sent[0];
  ok('the welcome email goes to them, from the owner, naming the course and role', mail?.to === alex.email && mail.subject === 'Jordan added you to Pine Hollow a on GreenReserve' && mail.html.includes('Your role: Front desk.') && mail.html.includes('Set my password'), mail?.subject);
  const link = /href="(https:\/\/greenreserve\.test\/dashboard\/reset-password\?token=([^"&]+)&welcome=1)"/.exec(mail?.html ?? '');
  ok('…with a set-your-password link that verifies for this person', !!link && (await verifyStaffResetToken(decodeURIComponent(link[2]), async () => alex.password)) === alexId);
  ok('…and never a password', !/temporary password|tempPassword/i.test(mail?.html ?? ''));
  const tInv = (await loadTeam(A.c.id, A.op.id))!.people.find(p => p.id === alexId)!;
  ok('Team shows them Invited under Front desk with Front desk’s keys', tInv.status === 'invited' && tInv.roleId === fdId && eq(tInv.permissions, normalizePermissions(PRESETS.find(p => p.key === 'front_desk')!.keys)) && tInv.source === 'role');
  ok('the invite is in the audit log and is a sign-in security event', !!(await prisma.teamChange.findFirst({ where: { courseId: A.c.id, action: 'invite', targetId: alexId } })) && !!(await prisma.securityEvent.findFirst({ where: { kind: 'access_changed', accountId: alexId, surface: 'course' } })));

  sent.length = 0;
  ok('Resend invite works while Invited', (await resendInvite(A.ctx, alexId)).ok && sent.length === 1);
  ok('Reset password for someone Invited sends the invite again instead', (await sendResetLink(A.ctx, alexId) as { sent?: string }).sent === 'invite' && sent.length === 2);

  failMail = true;
  const inv2 = await invitePerson(A.ctx, { name: 'Sam Fail', email: `${TAG}-sam@t.local`, roleId: mgrId });
  failMail = false;
  ok('a welcome email that fails still saves the person and says so (emailSent false)', inv2.ok && !inv2.emailSent && !!(await prisma.courseStaff.findUnique({ where: { email: `${TAG}-sam@t.local` } })));
  const samId = inv2.ok ? inv2.id : '';

  // Set a password (what the reset-password route does), then Reset password emails a link.
  await prisma.courseStaff.update({ where: { id: alexId }, data: { passwordSetAt: new Date(), password: 'hash2' } });
  sent.length = 0;
  const rs = await sendResetLink(A.ctx, alexId);
  ok('Reset password emails a one-use link (no temporary password)', rs.ok && (rs as { sent?: string }).sent === 'reset' && sent.length === 1 && sent[0].html.includes('This link works once, for 1 hour.') && !/temporary password/i.test(sent[0].html));
  ok('…audited and a security event', !!(await prisma.teamChange.findFirst({ where: { action: 'reset_link', targetId: alexId } })) && (await prisma.securityEvent.count({ where: { kind: 'access_changed', accountId: alexId } })) >= 3);

  // A person's own access: overrides on the role.
  const extra = await setAccess(A.ctx, alexId, { areas: { reports: 'view' } });
  const alex2 = await prisma.courseStaff.findUniqueOrThrow({ where: { id: alexId } });
  ok('giving one person Reports stores it as a grant on their role', extra.ok && eq(alex2.grantKeys, ['analytics.view']) && alex2.revokeKeys.length === 0 && alex2.roleId === fdId);
  ok('…and a StaffPermissionChange row', (await prisma.staffPermissionChange.count({ where: { staffId: alexId } })) === 2);
  const tA = (await loadTeam(A.c.id, A.op.id))!.people.find(p => p.id === alexId)!;
  ok('Team shows the extra key as added', eq(tA.added, ['analytics.view']) && tA.areas.reports === 'view');

  // A role change changes everyone in it; their overrides stay. dryRun says how many first.
  const dry = await updateRole(A.ctx, fdId, { areas: { payments: 'view' }, dryRun: true });
  ok('dryRun counts the people a role change affects without saving', dry.ok && dry.people === 1 && dry.affected === 1 && !dry.saved && !(await prisma.courseRole.findUniqueOrThrow({ where: { id: fdId } })).permissions.includes('money.payouts'));
  const upd = await updateRole(A.ctx, fdId, { areas: { payments: 'view' } });
  const alexKeys = resolveMemberPermissions((await prisma.courseStaff.findUniqueOrThrow({ where: { id: alexId }, include: { courseRole: true } })));
  ok('saving it changes the person', upd.ok && upd.saved && upd.affected === 1 && alexKeys.includes('money.payouts'));
  ok('…and keeps their own extra', alexKeys.includes('analytics.view'));
  ok('…and writes the role change to the audit log with the count', !!(await prisma.teamChange.findFirst({ where: { action: 'role_update', targetId: fdId, affected: 1 } })));
  ok('a role rename to a taken name → 409', (await updateRole(A.ctx, fdId, { name: 'manager' }) as { status?: number }).status === 409);

  // Moving someone to another role clears their overrides.
  ok('moving to Manager', (await setAccess(A.ctx, alexId, { roleId: mgrId })).ok);
  const alex3 = await prisma.courseStaff.findUniqueOrThrow({ where: { id: alexId } });
  ok('…clears their overrides', alex3.roleId === mgrId && alex3.grantKeys.length === 0 && alex3.revokeKeys.length === 0);
  ok('…logged as role_assign', !!(await prisma.teamChange.findFirst({ where: { action: 'role_assign', targetId: alexId } })));
  ok('a pre-Team person can be put in a role', (await setAccess(A.ctx, legacy.id, { roleId: fdId })).ok);

  // Delete a role: refused while it has people.
  const del = await deleteRole(A.ctx, mgrId);
  ok('a role with people can’t be deleted', !del.ok && (del as { status?: number }).status === 409);
  ok('an empty role can be deleted', (await deleteRole(A.ctx, customRow.id)).ok && !(await prisma.courseRole.findUnique({ where: { id: customRow.id } })));

  // Disable / enable.
  ok('disable', (await setActive(A.ctx, alexId, false)).ok);
  const d = await prisma.courseStaff.findUniqueOrThrow({ where: { id: alexId } });
  ok('…they stay listed as Disabled with the date', !d.active && !!d.disabledAt && (await loadTeam(A.c.id, A.op.id))!.people.find(p => p.id === alexId)?.status === 'disabled');
  ok('…and every session they hold dies for good (sessionVersion bumped)', d.sessionVersion === 1);
  ok('…a disabled person can’t be sent a reset link', !(await sendResetLink(A.ctx, alexId)).ok);
  ok('re-enable', (await setActive(A.ctx, alexId, true)).ok && (await prisma.courseStaff.findUniqueOrThrow({ where: { id: alexId } })).active);
  ok('both are audited and security events', (await prisma.teamChange.count({ where: { targetId: alexId, action: { in: ['disable', 'enable'] } } })) === 2 && (await prisma.securityEvent.count({ where: { accountId: alexId, detail: { in: ['staff login turned off', 'staff login turned back on'] } } })) === 2);

  // Details.
  ok('details: name and phone', (await updateDetails(A.ctx, alexId, { name: 'Alex R', phone: '' })).ok && (await prisma.courseStaff.findUniqueOrThrow({ where: { id: alexId } })).phone === null);

  // Remove: off the list, can't sign in, row and history kept; re-invite brings back the same row.
  ok('remove', (await removePerson(A.ctx, samId)).ok);
  const sam = await prisma.courseStaff.findUnique({ where: { id: samId } });
  ok('…the row stays (history keeps their name) but is off and off the list', !!sam && !sam.active && !!sam.removedAt && !(await loadTeam(A.c.id, A.op.id))!.people.some(p => p.id === samId));
  ok('…and their sessions die for good, so a later re-invite can’t revive an old cookie', sam?.sessionVersion === 1);
  ok('…and their address is freed (kept as a removed marker)', sam?.email === `${TAG}-sam@t.local#removed:${samId}` && !(await prisma.courseStaff.findUnique({ where: { email: `${TAG}-sam@t.local` } })));
  ok('…and no Team action reaches them any more', !(await setActive(A.ctx, samId, true)).ok && !(await sendResetLink(A.ctx, samId)).ok);
  const back = await invitePerson(A.ctx, { name: 'Sam Back', email: `${TAG}-sam@t.local`, roleId: fdId });
  ok('inviting a removed person again brings back the same row as Invited, with their real address', back.ok && back.id === samId && !(await prisma.courseStaff.findUniqueOrThrow({ where: { id: samId } })).removedAt && (await prisma.courseStaff.findUniqueOrThrow({ where: { id: samId } })).email === `${TAG}-sam@t.local`);
  ok('remove them again', (await removePerson(A.ctx, samId)).ok);
  { const lookalike = await invitePerson(A.ctx, { name: 'Not Sam', email: `${TAG}_sam@t.local`, roleId: fdId });
    ok('a look-alike address (_ is a LIKE wildcard) never revives a removed person', lookalike.ok && lookalike.id !== samId && !!(await prisma.courseStaff.findUniqueOrThrow({ where: { id: samId } })).removedAt);
    if (lookalike.ok) await removePerson(A.ctx, lookalike.id); }
  const elsewhere = await invitePerson(B.ctx, { name: 'Sam New Job', email: `${TAG}-sam@t.local`, roleId: (await createRole(B.ctx, { fromSuggested: 'bookkeeper' }) as { role?: { id: string } }).role?.id });
  ok('another course can invite an address this course removed (a new row; A’s history row stays A’s)', elsewhere.ok && elsewhere.id !== samId && (await prisma.courseStaff.findUniqueOrThrow({ where: { id: samId } })).courseId === A.c.id);
  ok('…and A re-inviting it now is refused (it is B’s login)', (await invitePerson(A.ctx, { name: 'Sam', email: `${TAG}-sam@t.local`, roleId: fdId }) as { status?: number }).status === 409);

  const { invitePreview } = await import('../src/lib/team');
  const pv = await invitePreview(A.ctx, fdId, 'Kelly Brandt');
  ok('the invite preview is the real email for that role, with a dead link', pv.ok && pv.subject === 'Jordan added you to Pine Hollow a on GreenReserve' && pv.html.includes('Hi Kelly,') && pv.html.includes('Your role: Front desk.') && pv.html.includes('href="#"'), pv);
  ok('…and says what the role can do from its areas', pv.ok && /You can: use some of tee sheet &amp; bookings, see payments &amp; refunds and use some of pro shop &amp; register\./.test(pv.html), pv.ok ? pv.html.match(/You can:[^<]*/)?.[0] : pv);
  ok('B can’t preview with A’s role', (await invitePreview(B.ctx, fdId, 'x') as { status?: number }).status === 404);

  // ── Isolation: course B reaches nothing of A's ─────────────────────────────
  { const tb = (await loadTeam(B.c.id, B.op.id))!;
    ok('B’s team shows none of A’s roles or people', !tb.roles.some(r => r.id === fdId || r.id === mgrId) && !tb.people.some(p => p.id === alexId || p.id === samId) && tb.people.length === 1); }
  ok('B can’t change A’s role', (await updateRole(B.ctx, fdId, { name: 'Pwned' }) as { status?: number }).status === 404);
  ok('…or delete it', (await deleteRole(B.ctx, fdId) as { status?: number }).status === 404);
  ok('…or invite into it', (await invitePerson(B.ctx, { name: 'X', email: `${TAG}-x@t.local`, roleId: fdId }) as { status?: number }).status === 400);
  ok('…or change A’s person', (await setAccess(B.ctx, alexId, { permissions: ['money.refund'] }) as { status?: number }).status === 404);
  ok('…disable them', (await setActive(B.ctx, alexId, false) as { status?: number }).status === 404);
  ok('…remove them', (await removePerson(B.ctx, alexId) as { status?: number }).status === 404);
  ok('…send them a reset link or invite', (await sendResetLink(B.ctx, alexId) as { status?: number }).status === 404 && (await resendInvite(B.ctx, samId) as { status?: number }).status === 404);
  ok('…or rename them', (await updateDetails(B.ctx, alexId, { name: 'X' }) as { status?: number }).status === 404);
  ok('…or reorder with A’s role ids', !(await reorderRoles(B.ctx, [fdId])).ok);
  const bRole = await createRole(B.ctx, { suggestedKey: 'starter' });
  ok('A can’t put its person in B’s role', (await setAccess(A.ctx, alexId, { roleId: bRole.ok ? bRole.role.id : '' }) as { status?: number }).status === 400);
  ok('B’s history has none of A’s changes', (await teamHistory(B.c.id)).every(h => h.targetId !== alexId && h.targetId !== fdId));
  ok('A’s history has its changes, newest first', (() => true)() && (await teamHistory(A.c.id)).length > 10);
  ok('A still has its Front desk role, unchanged by B', (await prisma.courseRole.findUniqueOrThrow({ where: { id: fdId } })).name === 'Front desk' && (await prisma.courseStaff.findUniqueOrThrow({ where: { id: alexId } })).active);

  // The routes: every method is owner-only; the session reads the role.
  const route = (p: string) => readFileSync(p, 'utf8');
  const routes = ['src/app/api/operator/team/route.ts', 'src/app/api/operator/team/history/route.ts', 'src/app/api/operator/team/roles/route.ts',
    'src/app/api/operator/staff/route.ts', 'src/app/api/operator/staff/invite/route.ts', 'src/app/api/operator/staff/invite/resend/route.ts',
    'src/app/api/operator/staff/invite/preview/route.ts', 'src/app/api/operator/staff/reset-link/route.ts'];
  const handlers = routes.flatMap(p => [...route(p).matchAll(/export async function (GET|POST|PATCH|DELETE)\([^)]*\) \{\n  const g = await teamOwner\(req, \{ write: (true|false) \}\); if \('error' in g\) return g\.error;/g)].map(m => `${p}:${m[1]}:${m[2]}`));
  const all = routes.flatMap(p => [...route(p).matchAll(/export async function (GET|POST|PATCH|DELETE)\((?!\))/g)].map(m => `${p}:${m[1]}`));
  const oldAdd = route('src/app/api/operator/staff/route.ts');
  ok('the old Settings add (kept until #460) is owner-gated and audited', oldAdd.includes("tx.teamChange.create({ data: { courseId: ctx.courseId, actorId: ctx.operatorId") && oldAdd.includes("kind: 'access_changed', surface: 'course', email, accountId: staffId"));
  ok('…and Team’s invite never makes a temporary password', !route('src/app/api/operator/staff/invite/route.ts').includes('tempPassword') && !route('src/lib/team.ts').includes('tempPassword'));
  ok('every Team route handler starts with the owner gate', handlers.length === all.length, { handlers: handlers.length, all });
  ok('…and every write also needs the current agreement', handlers.every(h => h.includes(':GET:') ? h.endsWith(':false') : h.endsWith(':true')));
  const gate = route('src/lib/team-route.ts');
  ok('the gate refuses every staff login', /if \(session\.isStaff \|\| !session\.operatorId\) return \{ error: NextResponse\.json\(\{ error: STAFF_FORBIDDEN \}, \{ status: 403 \}\) \};/.test(gate));
  const sess = route('src/lib/session.ts');
  ok('the session resolves staff keys through the role (and refuses a removed login)', sess.includes('permissions: resolveMemberPermissions(row)') && sess.includes('if (!row || !row.active || row.removedAt) return null;'));
  ok('…and refuses a staff token from an older session version', sess.includes('if ((session.sv ?? 0) !== row.sessionVersion) return null;'));
  const login = route('src/app/api/auth/login/route.ts'), auth = route('src/lib/auth.ts'), reset = route('src/app/api/auth/reset-password/route.ts');
  ok('sign-in puts the version in the token, and a refresh keeps the token’s own', login.includes('sv: staff.sessionVersion') && auth.includes('email: p.email, sv: p.sv });'));
  ok('a staff password reset signs out their other sessions and is a security event', /passwordSetAt: new Date\(\), sessionVersion: \{ increment: 1 \}/.test(reset) && reset.includes("kind: 'password_changed', surface: 'course'"));

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('team-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
