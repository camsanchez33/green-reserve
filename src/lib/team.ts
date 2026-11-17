// Team (Cam 2026-11-17, lanes/dashboard.md item 8, lanes/build.md "Team data").
// The server side of the Team page: roles, invites, a person's access, disable,
// remove, reset links, and the course's audit log of all of it (TeamChange).
//
// Owner only: every function here is called from /api/operator/team/** after
// the route checks the login is the course owner (a staff login never manages
// staff — STAFF_POLICY_SPEC A2). The access model is lib/team-access.ts; the
// server gate stays requirePermission(session, key) on every other route.
//
// What every change writes:
//  - a TeamChange row (the course's audit log: who, what, before/after, how many people);
//  - a StaffPermissionChange row for each person whose keys changed (the per-person history SP-A started);
//  - a SecurityEvent ('access_changed') when it changes who can sign in: invite, invite resent,
//    disable, re-enable, remove, reset link.
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { signStaffResetToken } from './auth';
import { securityEvent } from './security-events';
import { sendStaffResetLinkEmail, sendStaffWelcomeEmail } from './email';
import { rateLimit } from './rate-limit';
import { EMAIL_RE, normalizePhone } from './golfer-otp';
import { ALL_KEYS, normalizePermissions, presetFor, type PermissionKey } from './staff-permissions';
import {
  AREAS, applyAreaLevel, areaLevels, isAreaKey, isAreaLevel, overridesFor, personStatus, resolveMemberPermissions,
  suggestedRole, SUGGESTED_ROLES, type AreaKey, type AreaLevel, type PersonStatus,
} from './team-access';
import { canSentence, INVITE_LINK_TTL, welcomeParts } from './team-welcome';
import { staffWelcomeHtml } from './email';

export interface TeamCtx {
  courseId: string;
  /** The course operator making the change. */
  operatorId: string;
  /** For SecurityEvent's IP and browser. */
  req: Request | null;
}

export type TeamResult<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; status: number; error: string; [k: string]: unknown };

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => ({ ok: false as const, status, error, ...extra });

export const ROLE_NAME_MAX = 40;
export const ROLE_DESCRIPTION_MAX = 120;
export const PERSON_NAME_MAX = 120;

const baseUrl = () => process.env.NEXT_PUBLIC_URL || 'https://greenreserve.app';

/**
 * Remove frees the address: CourseStaff.email is unique across every course, so
 * a removed row keeps its email as `<email>#removed:<id>` (never a real address,
 * so no sign-in, reset or invite matches it). Another course can then invite the
 * person, and this course re-inviting them revives the same row (final review 2026-11-17).
 */
export const removedEmail = (email: string, id: string) => `${email}#removed:${id}`;
const REMOVED_MARK = '#removed:';

const staffSelect = {
  id: true, courseId: true, name: true, email: true, phone: true, active: true, createdAt: true,
  permissions: true, preset: true, permissionsSetAt: true, roleId: true, grantKeys: true, revokeKeys: true,
  invitedAt: true, passwordSetAt: true, lastActiveAt: true, disabledAt: true, removedAt: true,
  courseRole: { select: { courseId: true, permissions: true, name: true, description: true } },
} satisfies Prisma.CourseStaffSelect;

type StaffRow = Prisma.CourseStaffGetPayload<{ select: typeof staffSelect }>;

async function actorName(operatorId: string): Promise<string> {
  return (await prisma.courseOperator.findUnique({ where: { id: operatorId }, select: { name: true } }))?.name ?? '';
}

/** A staff row of THIS course that is still on the team. Anything else reads as not found. */
async function personOf(courseId: string, id: unknown): Promise<StaffRow | null> {
  if (typeof id !== 'string' || !id) return null;
  const row = await prisma.courseStaff.findUnique({ where: { id }, select: staffSelect });
  return row && row.courseId === courseId && !row.removedAt ? row : null;
}

async function roleOf(courseId: string, id: unknown) {
  if (typeof id !== 'string' || !id) return null;
  const role = await prisma.courseRole.findUnique({ where: { id } });
  return role && role.courseId === courseId ? role : null;
}

/** Keys from a body: an explicit list, or area levels applied on top of `base`. Null = neither given; 'bad' = an area/level that isn't offered. */
function keysFrom(body: { permissions?: unknown; areas?: unknown }, base: readonly string[]): PermissionKey[] | null | 'bad' {
  if (Array.isArray(body.permissions)) return normalizePermissions(body.permissions.filter((k): k is string => typeof k === 'string'));
  if (body.areas && typeof body.areas === 'object' && !Array.isArray(body.areas)) {
    let keys: PermissionKey[] = normalizePermissions(base);
    for (const [area, level] of Object.entries(body.areas as Record<string, unknown>)) {
      if (!isAreaKey(area) || !isAreaLevel(level)) return 'bad';
      const next = applyAreaLevel(keys, area as AreaKey, level as AreaLevel);
      if (!next) return 'bad';
      keys = next;
    }
    return keys;
  }
  return null;
}

const same = (a: readonly string[], b: readonly string[]) => a.join(',') === b.join(',');

function cleanName(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function cleanPhone(v: unknown): string | null | 'bad' {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return null;
  if (typeof v !== 'string') return 'bad';
  const digits = v.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return 'bad';
  return normalizePhone(v);
}

async function audit(tx: Prisma.TransactionClient | typeof prisma, ctx: TeamCtx, name: string, e: {
  action: string; targetType: 'person' | 'role'; targetId: string; targetName: string;
  detail?: string; before?: string[]; after?: string[]; affected?: number;
}) {
  await tx.teamChange.create({
    data: {
      courseId: ctx.courseId, actorId: ctx.operatorId, actorName: name, action: e.action, targetType: e.targetType,
      targetId: e.targetId, targetName: e.targetName, detail: (e.detail ?? '').slice(0, 300),
      before: e.before ?? [], after: e.after ?? [], affected: e.affected ?? 0,
    },
  });
}

async function signInEvent(ctx: TeamCtx, p: { id: string; email: string }, detail: string) {
  await securityEvent(ctx.req, { kind: 'access_changed', surface: 'course', email: p.email, accountId: p.id, detail });
}

// ── Read ──────────────────────────────────────────────────────────────────────

export interface TeamPerson {
  id: string; name: string; email: string; phone: string | null;
  roleId: string | null;
  /** 'role' = role + overrides; 'own' = keys set on the person before Team; 'legacy' = never set (pre-SP-A powers). */
  source: 'role' | 'own' | 'legacy';
  status: PersonStatus;
  lastActiveAt: string | null; invitedAt: string | null; disabledAt: string | null; createdAt: string;
  permissions: PermissionKey[];
  areas: Record<AreaKey, AreaLevel | 'custom'>;
  /** Keys this person has beyond their role, and role keys they don't have. */
  added: PermissionKey[]; removed: PermissionKey[];
  /** No role: their keys are the ones set on them before Team (or Legacy). Put them in a role to manage them by role. */
  legacy: boolean;
  lastChange: { at: string; by: string; action: string } | null;
}

export interface TeamRole {
  /** 'owner' for the Owner role (not a row: every key, never edited or deleted, nobody invited into it). */
  id: string; name: string; suggestedKey: string; rank: number; owner: boolean;
  permissions: PermissionKey[];
  areas: Record<AreaKey, AreaLevel | 'custom'>;
  people: number;
  lastChange: { at: string; by: string } | null;
}

export interface TeamData {
  /** lastActiveAt for the owner is their last SIGN-IN (owners have no per-request stamp); staff's is their last request. */
  owner: { name: string; email: string; lastActiveAt: string | null; isYou: boolean };
  /** Owner first, then the course's roles in rank order. */
  roles: TeamRole[];
  people: TeamPerson[];
  suggested: { key: string; name: string; permissions: PermissionKey[]; areas: Record<AreaKey, AreaLevel | 'custom'> }[];
  areas: { key: AreaKey; label: string; help: string; levels: AreaLevel[] }[];
}

export async function loadTeam(courseId: string, viewerOperatorId: string | null): Promise<TeamData | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { operator: { select: { id: true, name: true, email: true, lastLoginAt: true } } },
  });
  if (!course) return null;
  const [roles, staff] = await Promise.all([
    prisma.courseRole.findMany({ where: { courseId }, orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }] }),
    prisma.courseStaff.findMany({ where: { courseId, removedAt: null }, select: staffSelect, orderBy: { createdAt: 'asc' } }),
  ]);
  const ids = [...staff.map(s => s.id), ...roles.map(r => r.id)];
  const [changes, oldChanges] = await Promise.all([
    ids.length ? prisma.teamChange.findMany({ where: { courseId, targetId: { in: ids } }, orderBy: { createdAt: 'desc' }, distinct: ['targetId'] }) : [],
    staff.length ? prisma.staffPermissionChange.findMany({ where: { courseId, staffId: { in: staff.map(s => s.id) } }, orderBy: { createdAt: 'desc' }, distinct: ['staffId'] }) : [],
  ]);
  const changerIds = [...new Set(oldChanges.map(c => c.changedBy))];
  const changers = changerIds.length ? await prisma.courseOperator.findMany({ where: { id: { in: changerIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(changers.map(c => [c.id, c.name]));
  const lastOf = (id: string) => {
    const c = changes.find(x => x.targetId === id);
    if (c) return { at: c.createdAt.toISOString(), by: c.actorName || 'The course owner', action: c.action };
    const o = oldChanges.find(x => x.staffId === id);
    return o ? { at: o.createdAt.toISOString(), by: nameOf.get(o.changedBy) ?? 'The course owner', action: 'access_change' } : null;
  };
  const haveKeys = new Set(roles.map(r => r.suggestedKey).filter(Boolean));
  const haveNames = new Set(roles.map(r => r.name.toLowerCase()));
  return {
    owner: {
      name: course.operator?.name ?? '', email: course.operator?.email ?? '',
      lastActiveAt: course.operator?.lastLoginAt?.toISOString() ?? null,
      isYou: !!viewerOperatorId && course.operator?.id === viewerOperatorId,
    },
    roles: [
      { id: 'owner', name: 'Owner', suggestedKey: '', rank: 0, owner: true, permissions: [...ALL_KEYS], areas: areaLevels(ALL_KEYS), people: course.operator ? 1 : 0, lastChange: null },
      ...roles.map(r => {
        const keys = normalizePermissions(r.permissions);
        const last = lastOf(r.id);
        return {
          id: r.id, name: r.name, suggestedKey: r.suggestedKey, rank: r.rank, owner: false,
          permissions: keys, areas: areaLevels(keys), people: staff.filter(s => s.roleId === r.id).length,
          lastChange: last ? { at: last.at, by: last.by } : null,
        };
      }),
    ],
    people: staff.map(s => {
      const keys = resolveMemberPermissions(s);
      const roleKeys = s.roleId && s.courseRole ? normalizePermissions(s.courseRole.permissions) : null;
      return {
        id: s.id, name: s.name, email: s.email, phone: s.phone, roleId: s.roleId,
        source: s.roleId ? 'role' : s.permissionsSetAt ? 'own' : 'legacy',
        status: personStatus(s),
        lastActiveAt: s.lastActiveAt?.toISOString() ?? null,
        invitedAt: s.invitedAt?.toISOString() ?? null,
        disabledAt: s.disabledAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
        permissions: keys, areas: areaLevels(keys),
        added: roleKeys ? keys.filter(k => !roleKeys.includes(k)) : [],
        removed: roleKeys ? roleKeys.filter(k => !keys.includes(k)) : [],
        legacy: !s.roleId,
        lastChange: lastOf(s.id),
      };
    }),
    suggested: SUGGESTED_ROLES.filter(sr => !haveKeys.has(sr.key) && !haveNames.has(sr.name.toLowerCase()))
      .map(sr => ({ key: sr.key, name: sr.name, permissions: sr.keys, areas: areaLevels(sr.keys) })),
    areas: AREAS.map(a => ({ key: a.key, label: a.label, help: a.help, levels: (['none', 'view', 'full'] as AreaLevel[]).filter(l => a.levels[l]) })),
  };
}

/** The course's team audit log, newest first; one person or role when targetId is given. */
export async function teamHistory(courseId: string, targetId?: string, take = 50) {
  const rows = await prisma.teamChange.findMany({
    where: { courseId, ...(targetId ? { targetId } : {}) },
    orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(take, 1), 200),
  });
  return rows.map(r => ({
    id: r.id, at: r.createdAt.toISOString(), by: r.actorName || 'The course owner', action: r.action,
    targetType: r.targetType, targetId: r.targetId, targetName: r.targetName, detail: r.detail,
    before: r.before, after: r.after, affected: r.affected,
  }));
}

// ── Roles ─────────────────────────────────────────────────────────────────────

async function nameTaken(courseId: string, name: string, exceptId?: string) {
  const hit = await prisma.courseRole.findFirst({ where: { courseId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  return !!hit || name.toLowerCase() === 'owner';
}

/** Body: { suggestedKey | fromSuggested } to add a Suggested role, and/or { name, permissions? | areas? } (which override the suggestion). Cam dropped the role description from the page; it stays optional here. */
export async function createRole(ctx: TeamCtx, body: Record<string, unknown>): Promise<TeamResult<{ role: { id: string } }>> {
  const from = body.suggestedKey ?? body.fromSuggested;
  const sugg = from !== undefined ? suggestedRole(from) : null;
  if (from !== undefined && !sugg) return fail(400, 'That suggested role doesn’t exist.');
  const name = cleanName(body.name, ROLE_NAME_MAX) || sugg?.name || '';
  if (!name) return fail(400, 'Give the role a name.');
  const description = body.description !== undefined ? cleanName(body.description, ROLE_DESCRIPTION_MAX) : (sugg?.description ?? '');
  const keys = keysFrom(body, sugg?.keys ?? []);
  if (keys === 'bad') return fail(400, 'One of those access areas or levels isn’t offered.');
  const permissions = keys ?? normalizePermissions(sugg?.keys ?? []);
  if (await nameTaken(ctx.courseId, name)) return fail(409, `There’s already a role called ${name}.`);
  if (sugg && await prisma.courseRole.findFirst({ where: { courseId: ctx.courseId, suggestedKey: sugg.key }, select: { id: true } })) {
    return fail(409, `${sugg.name} is already one of your roles.`);
  }
  const who = await actorName(ctx.operatorId);
  try {
    const role = await prisma.$transaction(async tx => {
      const top = await tx.courseRole.aggregate({ where: { courseId: ctx.courseId }, _max: { rank: true } });
      const r = await tx.courseRole.create({
        data: { courseId: ctx.courseId, name, description, suggestedKey: sugg?.key ?? '', permissions, rank: (top._max.rank ?? 0) + 1 },
      });
      await audit(tx, ctx, who, { action: 'role_create', targetType: 'role', targetId: r.id, targetName: name, after: permissions, detail: sugg ? `from Suggested: ${sugg.name}` : '' });
      return r;
    });
    return { ok: true, role: { id: role.id } };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return fail(409, `There’s already a role called ${name}.`);
    throw e;
  }
}

/**
 * Body: { name?, description?, permissions? | areas?, dryRun? }. A key change
 * changes everyone in the role (their own overrides stay). dryRun answers how
 * many people it would change without saving — the editor says so before Save.
 */
export async function updateRole(ctx: TeamCtx, roleId: unknown, body: Record<string, unknown>): Promise<TeamResult<{ people: number; affected: number; saved: boolean }>> {
  const role = await roleOf(ctx.courseId, roleId);
  if (!role) return fail(404, 'Not found');
  const keys = keysFrom(body, role.permissions);
  if (keys === 'bad') return fail(400, 'One of those access areas or levels isn’t offered.');
  const name = body.name !== undefined ? cleanName(body.name, ROLE_NAME_MAX) : role.name;
  if (!name) return fail(400, 'Give the role a name.');
  const description = body.description !== undefined ? cleanName(body.description, ROLE_DESCRIPTION_MAX) : role.description;
  if (name !== role.name && await nameTaken(ctx.courseId, name, role.id)) return fail(409, `There’s already a role called ${name}.`);
  const newKeys = keys ?? normalizePermissions(role.permissions);

  const members = await prisma.courseStaff.findMany({ where: { roleId: role.id, courseId: ctx.courseId, removedAt: null }, select: staffSelect });
  const changes = members.map(m => {
    const before = resolveMemberPermissions(m);
    const after = resolveMemberPermissions({ ...m, courseRole: { courseId: ctx.courseId, permissions: newKeys } });
    return { m, before, after };
  }).filter(c => !same(c.before, c.after));
  if (body.dryRun === true) return { ok: true, people: members.length, affected: changes.length, saved: false };

  const keysChanged = !same(normalizePermissions(role.permissions), newKeys);
  if (!keysChanged && name === role.name && description === role.description) return { ok: true, people: members.length, affected: 0, saved: false };
  const who = await actorName(ctx.operatorId);
  try {
    await prisma.$transaction(async tx => {
      // Conditional on the keys the effects above were computed from: a second
      // save racing this one matches zero rows and is told to reload.
      const { count } = await tx.courseRole.updateMany({
        where: { id: role.id, courseId: ctx.courseId, updatedAt: role.updatedAt },
        data: { name, description, permissions: newKeys },
      });
      if (count === 0) throw new StaleError();
      for (const c of changes) {
        await tx.courseStaff.update({ where: { id: c.m.id }, data: { permissions: c.after, permissionsSetAt: new Date() } });
        await tx.staffPermissionChange.create({ data: { courseId: ctx.courseId, staffId: c.m.id, changedBy: ctx.operatorId, before: c.before, after: c.after } });
      }
      const renamed = name !== role.name ? `renamed from ${role.name}` : '';
      await audit(tx, ctx, who, {
        action: 'role_update', targetType: 'role', targetId: role.id, targetName: name, detail: renamed,
        before: keysChanged ? normalizePermissions(role.permissions) : [], after: keysChanged ? newKeys : [], affected: changes.length,
      });
    });
  } catch (e) {
    if (e instanceof StaleError) return fail(409, 'Someone else just changed this role. Reload and try again.');
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return fail(409, `There’s already a role called ${name}.`);
    throw e;
  }
  return { ok: true, people: members.length, affected: changes.length, saved: true };
}

class StaleError extends Error {}

/** A role with people on the team can't be deleted: move them first ("Pick another role for its people first"). */
export async function deleteRole(ctx: TeamCtx, roleId: unknown): Promise<TeamResult> {
  const role = await roleOf(ctx.courseId, roleId);
  if (!role) return fail(404, 'Not found');
  const people = await prisma.courseStaff.count({ where: { roleId: role.id, removedAt: null } });
  if (people > 0) return fail(409, `Pick another role for ${people === 1 ? 'the 1 person' : `the ${people} people`} in ${role.name} first.`, { people });
  const who = await actorName(ctx.operatorId);
  try {
    await prisma.$transaction(async tx => {
      // Removed people keep their row (history) but can't sign in; let go of the role so it can be deleted.
      await tx.courseStaff.updateMany({ where: { roleId: role.id, removedAt: { not: null } }, data: { roleId: null } });
      await tx.courseRole.delete({ where: { id: role.id } });
      await audit(tx, ctx, who, { action: 'role_delete', targetType: 'role', targetId: role.id, targetName: role.name, before: normalizePermissions(role.permissions) });
    });
  } catch (e) {
    // Someone was put in the role between the count and the delete (the FK is Restrict).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') return fail(409, `Pick another role for the people in ${role.name} first.`);
    throw e;
  }
  return { ok: true };
}

/** Body: { order: roleId[] } — every role of the course, in the new order. */
export async function reorderRoles(ctx: TeamCtx, order: unknown): Promise<TeamResult> {
  if (!Array.isArray(order) || !order.every(x => typeof x === 'string')) return fail(400, 'Send the roles in order.');
  const roles = await prisma.courseRole.findMany({ where: { courseId: ctx.courseId }, select: { id: true, name: true } });
  const ids = new Set(roles.map(r => r.id));
  if (order.length !== roles.length || new Set(order).size !== order.length || !order.every(id => ids.has(id))) return fail(400, 'Send every role once.');
  const who = await actorName(ctx.operatorId);
  await prisma.$transaction(async tx => {
    for (const [i, id] of (order as string[]).entries()) await tx.courseRole.update({ where: { id }, data: { rank: i + 1 } });
    await audit(tx, ctx, who, { action: 'role_reorder', targetType: 'role', targetId: ctx.courseId, targetName: 'Roles', detail: (order as string[]).map(id => roles.find(r => r.id === id)!.name).join(', ') });
  });
  return { ok: true };
}

// ── People ────────────────────────────────────────────────────────────────────

async function sendWelcome(ctx: TeamCtx, p: { id: string; email: string; name: string; password: string }, role: { name: string; permissions: string[] }) {
  const [course, owner] = await Promise.all([
    prisma.course.findUnique({ where: { id: ctx.courseId }, select: { name: true } }),
    actorName(ctx.operatorId),
  ]);
  const token = await signStaffResetToken({ id: p.id, password: p.password }, INVITE_LINK_TTL);
  await sendStaffWelcomeEmail({
    to: p.email, courseId: ctx.courseId, personName: p.name, ownerName: owner, courseName: course?.name ?? 'your course',
    roleName: role.name, roleCan: canSentence(role.permissions),
    setupLink: `${baseUrl()}/dashboard/reset-password?token=${encodeURIComponent(token)}&welcome=1`,
  });
}

/**
 * Body: { name, email, phone?, roleId }. Everyone invited gets a role. The
 * person can't sign in until they set a password from the welcome email (their
 * stored password is random and never shown). A removed person of this course
 * invited again comes back on the same row, so their history stays theirs.
 */
export async function invitePerson(ctx: TeamCtx, body: Record<string, unknown>): Promise<TeamResult<{ id: string; emailSent: boolean }>> {
  const name = cleanName(body.name, PERSON_NAME_MAX);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
  if (!name || !email) return fail(400, 'Name and email required');
  if (!EMAIL_RE.test(email)) return fail(400, 'That email doesn’t look right.');
  const phone = cleanPhone(body.phone);
  if (phone === 'bad') return fail(400, 'That phone number doesn’t look right.');
  const role = await roleOf(ctx.courseId, body.roleId);
  if (!role) return fail(400, 'Pick a role for them. Add one from Suggested roles if you have none yet.');
  // Each invite emails an address the owner typed: cap it so a course login can't be used to send mail at volume.
  if (!(await rateLimit(`team:invites:${ctx.courseId}`, 30, 3600))) return fail(429, 'That’s a lot of invites in one hour. Try again later.');

  const [existing, operator, removed] = await Promise.all([
    prisma.courseStaff.findUnique({ where: { email }, select: { id: true } }),
    prisma.courseOperator.findUnique({ where: { email }, select: { id: true } }),
    // This course removed them before: bring back the same row, so their history stays one person.
    prisma.courseStaff.findMany({ where: { courseId: ctx.courseId, removedAt: { not: null }, email: { startsWith: `${email}${REMOVED_MARK}` } }, orderBy: { removedAt: 'desc' }, select: { id: true, email: true } }),
  ]);
  if (operator || existing) return fail(409, 'Email already in use');
  // Exact match only: LIKE treats _ and % as wildcards, so a_b@x.com must never revive a removed a.b@x.com.
  const revive = removed.find(r => r.email === removedEmail(email, r.id)) ?? null;

  const password = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  const keys = normalizePermissions(role.permissions);
  const now = new Date();
  const data = {
    name, phone, password, roleId: role.id, grantKeys: [], revokeKeys: [], permissions: keys, preset: presetFor(keys),
    permissionsSetAt: now, invitedAt: now, passwordSetAt: null, active: true, disabledAt: null, removedAt: null,
    failedLoginAttempts: 0, lockoutUntil: null,
  };
  const who = await actorName(ctx.operatorId);
  let id: string;
  try {
    id = await prisma.$transaction(async tx => {
      const row = revive
        ? await tx.courseStaff.update({ where: { id: revive.id }, data: { ...data, email } })
        : await tx.courseStaff.create({ data: { ...data, courseId: ctx.courseId, email, role: 'staff' } });
      await tx.staffPermissionChange.create({ data: { courseId: ctx.courseId, staffId: row.id, changedBy: ctx.operatorId, before: [], after: keys } });
      await audit(tx, ctx, who, { action: 'invite', targetType: 'person', targetId: row.id, targetName: name, detail: `as ${role.name}${revive ? ' (was removed before)' : ''}`, after: keys, affected: 1 });
      return row.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return fail(409, 'Email already in use');
    throw e;
  }
  await signInEvent(ctx, { id, email }, `staff login invited as ${role.name}`);
  try {
    await sendWelcome(ctx, { id, email, name, password }, { name: role.name, permissions: role.permissions });
  } catch (err) {
    console.error('[team] welcome email failed', err instanceof Error ? err.message : err);
    return { ok: true, id, emailSent: false };
  }
  return { ok: true, id, emailSent: true };
}

/** Send the welcome email again to someone who hasn't set a password yet. */
export async function resendInvite(ctx: TeamCtx, id: unknown): Promise<TeamResult> {
  const p = await personOf(ctx.courseId, id);
  if (!p) return fail(404, 'Not found');
  if (personStatus(p) !== 'invited') return fail(409, p.active ? `${p.name} has already set a password. Send a reset link instead.` : `${p.name} is turned off. Turn them back on first.`);
  if (!(await rateLimit(`team:invite:${p.id}`, 5, 3600))) return fail(429, 'That invite was sent several times this hour. Try again later.');
  const row = await prisma.courseStaff.findUniqueOrThrow({ where: { id: p.id }, select: { password: true } });
  try {
    await sendWelcome(ctx, { id: p.id, email: p.email, name: p.name, password: row.password }, { name: p.courseRole?.name ?? 'Staff', permissions: resolveMemberPermissions(p) });
  } catch (err) {
    console.error('[team] welcome email resend failed', err instanceof Error ? err.message : err);
    return fail(502, 'The invite email did not send. Check the address and try again.');
  }
  await audit(prisma, ctx, await actorName(ctx.operatorId), { action: 'invite_resent', targetType: 'person', targetId: p.id, targetName: p.name });
  await signInEvent(ctx, p, 'staff invite sent again');
  return { ok: true };
}

/** Reset password: emails a one-use link (1 hour). Never a temporary password. */
export async function sendResetLink(ctx: TeamCtx, id: unknown): Promise<TeamResult<{ sent: 'reset' | 'invite' }>> {
  const p = await personOf(ctx.courseId, id);
  if (!p) return fail(404, 'Not found');
  if (!p.active) return fail(409, `${p.name} is turned off. Turn them back on first.`);
  // Someone who never set a password gets their invite again instead.
  if (personStatus(p) === 'invited') {
    const r = await resendInvite(ctx, p.id);
    return r.ok ? { ok: true, sent: 'invite' } : r;
  }
  if (!(await rateLimit(`team:reset:${p.id}`, 5, 3600))) return fail(429, 'Several reset links were sent this hour. Try again later.');
  const [row, course, owner] = await Promise.all([
    prisma.courseStaff.findUniqueOrThrow({ where: { id: p.id }, select: { password: true } }),
    prisma.course.findUnique({ where: { id: ctx.courseId }, select: { name: true } }),
    actorName(ctx.operatorId),
  ]);
  const token = await signStaffResetToken({ id: p.id, password: row.password }, '1h');
  try {
    await sendStaffResetLinkEmail({
      to: p.email, courseId: ctx.courseId, personName: p.name, ownerName: owner, courseName: course?.name ?? 'your course',
      resetLink: `${baseUrl()}/dashboard/reset-password?token=${encodeURIComponent(token)}`,
    });
  } catch (err) {
    console.error('[team] reset link email failed', err instanceof Error ? err.message : err);
    return fail(502, 'The reset email did not send. Check the address and try again.');
  }
  await audit(prisma, ctx, owner, { action: 'reset_link', targetType: 'person', targetId: p.id, targetName: p.name });
  await signInEvent(ctx, p, 'staff reset link sent by the course owner');
  return { ok: true, sent: 'reset' };
}

/**
 * A person's access. Body (any of):
 *  - { roleId }: move them to that role. Their own overrides are cleared unless
 *    permissions/areas come in the same call.
 *  - { permissions } (the whole set they should have) or { areas: { area: level } }
 *    (applied to what they have now): stored as overrides on their role; for
 *    someone with no role, as their own keys, exactly as before Team.
 */
export async function setAccess(ctx: TeamCtx, id: unknown, body: Record<string, unknown>): Promise<TeamResult<{ permissions: PermissionKey[] }>> {
  const p = await personOf(ctx.courseId, id);
  if (!p) return fail(404, 'Not found');
  const before = resolveMemberPermissions(p);
  let role: { id: string; name: string; permissions: string[] } | null = p.roleId && p.courseRole ? { id: p.roleId, name: p.courseRole.name, permissions: p.courseRole.permissions } : null;
  const moving = body.roleId !== undefined;
  if (moving) {
    const r = await roleOf(ctx.courseId, body.roleId);
    if (!r) return fail(400, 'That role doesn’t exist.');
    role = r;
  }
  const roleKeys = role ? normalizePermissions(role.permissions) : null;
  // Areas apply to what they'd have after the move (the new role's keys), else to what they have now.
  const desired = keysFrom(body, moving && roleKeys ? roleKeys : before);
  if (desired === 'bad') return fail(400, 'One of those access areas or levels isn’t offered.');
  if (!moving && !desired) return fail(400, 'Nothing to change.');

  let data: Prisma.CourseStaffUpdateInput;
  let after: PermissionKey[];
  if (role && roleKeys) {
    const o = desired ? overridesFor(roleKeys, desired) : { grants: [], revokes: [] };
    after = resolveMemberPermissions({ ...p, roleId: role.id, grantKeys: o.grants, revokeKeys: o.revokes, courseRole: { courseId: ctx.courseId, permissions: roleKeys } });
    data = { courseRole: { connect: { id: role.id } }, grantKeys: o.grants, revokeKeys: o.revokes, permissions: after, preset: presetFor(after), permissionsSetAt: new Date() };
  } else {
    after = desired!;
    data = { permissions: after, preset: presetFor(after), permissionsSetAt: new Date() };
  }
  const who = await actorName(ctx.operatorId);
  await prisma.$transaction(async tx => {
    await tx.courseStaff.update({ where: { id: p.id }, data });
    if (!same(before, after)) await tx.staffPermissionChange.create({ data: { courseId: ctx.courseId, staffId: p.id, changedBy: ctx.operatorId, before, after } });
    await audit(tx, ctx, who, {
      action: moving && role?.id !== p.roleId ? 'role_assign' : 'access_change', targetType: 'person', targetId: p.id, targetName: p.name,
      detail: moving && role ? `role: ${role.name}` : '', before, after, affected: same(before, after) ? 0 : 1,
    });
  });
  return { ok: true, permissions: after };
}

/** Disable keeps them on the list and stops their sign-in at once (every request re-reads the row) and for good (sessionVersion); enable lets them sign in again. */
export async function setActive(ctx: TeamCtx, id: unknown, active: boolean): Promise<TeamResult> {
  const p = await personOf(ctx.courseId, id);
  if (!p) return fail(404, 'Not found');
  if (p.active === active) return { ok: true };
  // Only turning someone back ON is capped, so a Disable is never refused (each disable needs an enable first).
  if (active && !(await rateLimit(`team:active:${p.id}`, 20, 3600))) return fail(429, `${p.name} was turned off and on many times this hour. Try again later.`);
  const who = await actorName(ctx.operatorId);
  await prisma.$transaction(async tx => {
    await tx.courseStaff.update({ where: { id: p.id }, data: { active, disabledAt: active ? null : new Date(), ...(active ? { failedLoginAttempts: 0, lockoutUntil: null } : { sessionVersion: { increment: 1 } }) } });
    await audit(tx, ctx, who, { action: active ? 'enable' : 'disable', targetType: 'person', targetId: p.id, targetName: p.name });
  });
  await signInEvent(ctx, p, active ? 'staff login turned back on' : 'staff login turned off');
  return { ok: true };
}

/** Remove: off the list and signed out for good (sessionVersion, so a later re-invite never revives an old cookie); the row stays so their past check-ins, sales and notes keep their name. */
export async function removePerson(ctx: TeamCtx, id: unknown): Promise<TeamResult> {
  const p = await personOf(ctx.courseId, id);
  if (!p) return fail(404, 'Not found');
  const who = await actorName(ctx.operatorId);
  await prisma.$transaction(async tx => {
    await tx.courseStaff.update({ where: { id: p.id }, data: { email: removedEmail(p.email, p.id), removedAt: new Date(), active: false, disabledAt: p.disabledAt ?? new Date(), sessionVersion: { increment: 1 } } });
    await audit(tx, ctx, who, { action: 'remove', targetType: 'person', targetId: p.id, targetName: p.name, before: resolveMemberPermissions(p) });
  });
  await signInEvent(ctx, p, 'staff login removed');
  return { ok: true };
}

/** Body: { name?, phone? }. The email is the sign-in, so it isn't changed here. */
export async function updateDetails(ctx: TeamCtx, id: unknown, body: Record<string, unknown>): Promise<TeamResult> {
  const p = await personOf(ctx.courseId, id);
  if (!p) return fail(404, 'Not found');
  const name = body.name !== undefined ? cleanName(body.name, PERSON_NAME_MAX) : p.name;
  if (!name) return fail(400, 'Name required');
  const phone = body.phone !== undefined ? cleanPhone(body.phone) : p.phone;
  if (phone === 'bad') return fail(400, 'That phone number doesn’t look right.');
  if (name === p.name && phone === p.phone) return { ok: true };
  const who = await actorName(ctx.operatorId);
  await prisma.$transaction(async tx => {
    await tx.courseStaff.update({ where: { id: p.id }, data: { name, phone } });
    const what = [name !== p.name ? `name (was ${p.name})` : '', phone !== p.phone ? 'phone' : ''].filter(Boolean).join(' and ');
    await audit(tx, ctx, who, { action: 'details', targetType: 'person', targetId: p.id, targetName: name, detail: `changed ${what}` });
  });
  return { ok: true };
}

/** The Invite popup's preview: the real welcome email for a role, with no working link. */
export async function invitePreview(ctx: TeamCtx, roleId: unknown, personName: unknown): Promise<TeamResult<{ subject: string; html: string }>> {
  const role = await roleOf(ctx.courseId, roleId);
  if (!role) return fail(404, 'Not found');
  const [course, owner] = await Promise.all([
    prisma.course.findUnique({ where: { id: ctx.courseId }, select: { name: true } }),
    actorName(ctx.operatorId),
  ]);
  const w = { personName: cleanName(personName, PERSON_NAME_MAX) || 'there', ownerName: owner, courseName: course?.name ?? 'your course', roleName: role.name, roleCan: canSentence(role.permissions) };
  return { ok: true, subject: welcomeParts(w).subject, html: staffWelcomeHtml(w, '#') };
}
