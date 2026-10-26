// SEC-3 (Cam 2026-10-26, "security has to be insane"; chose "log events" and
// "email + Problems"): every security outcome — a sign-in that failed or
// worked, a lockout, a wrong second factor, a rate limit tripped, a new owner
// device — is one SecurityEvent row. Admin → Security reads them (owner only);
// the hourly check (admin-checks.ts) turns an attack into a Problem, which is
// emailed once. Rows older than 90 days are deleted by that same check.
//
// Recording never blocks or fails a sign-in: it is awaited (CLAUDE.md gotcha 6
// — never fire-and-forget) but any error is swallowed and logged. It never
// stores a password, code or token — only the email typed, the IP and the browser.
import { prisma } from './prisma';
import { evidentiaryIp } from './rate-limit';

export type SecurityKind = 'signin_failed' | 'signin_ok' | 'locked_out' | 'second_factor_failed' | 'step_up_failed' | 'rate_limited' | 'new_device';
export type SecuritySurface = 'admin' | 'owner' | 'course' | 'golfer' | 'member';

export const SECURITY_KEEP_DAYS = 90;
/** Failed attempts from one address in an hour that make a Problem. */
export const BURST_PER_IP = 20;
/** Failed attempts across all addresses in an hour that make a Problem (spread-out guessing). */
export const BURST_TOTAL = 100;

const FAILED_KINDS: SecurityKind[] = ['signin_failed', 'locked_out', 'second_factor_failed', 'step_up_failed'];

export async function securityEvent(req: Request | null, e: { kind: SecurityKind; surface: SecuritySurface; email?: string | null; accountId?: string | null; detail?: string }): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        kind: e.kind,
        surface: e.surface,
        ip: req ? evidentiaryIp(req).slice(0, 64) : '',
        userAgent: (req?.headers.get('user-agent') ?? '').slice(0, 300),
        email: String(e.email ?? '').trim().toLowerCase().slice(0, 200),
        accountId: e.accountId ?? null,
        detail: (e.detail ?? '').slice(0, 200),
      },
    });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'security_event.fail', kind: e.kind, surface: e.surface, error: err instanceof Error ? err.message : String(err) }));
  }
}

const HOUR = 60 * 60 * 1000;

/** What the hourly check turns into Problems. Plain words only — no IPs or emails (Problems is open to employees). */
export async function securityFindings(now = new Date()): Promise<{ key: string; title: string; detail: string }[]> {
  const since = new Date(now.getTime() - HOUR);
  const failed = { kind: { in: FAILED_KINDS }, createdAt: { gte: since, lte: now } };
  const [byIp, total, lockouts] = await Promise.all([
    prisma.securityEvent.groupBy({ by: ['ip'], where: failed, _count: { _all: true }, orderBy: { _count: { ip: 'desc' } }, take: 5 }),
    prisma.securityEvent.count({ where: failed }),
    prisma.securityEvent.findMany({ where: { kind: 'locked_out', surface: { in: ['admin', 'owner'] }, createdAt: { gte: since, lte: now } }, select: { accountId: true, surface: true }, distinct: ['accountId'] }),
  ]);
  const out: { key: string; title: string; detail: string }[] = [];
  const hot = byIp.filter(r => r._count._all >= BURST_PER_IP);
  if (hot.length) {
    const top = hot[0]._count._all;
    out.push({ key: 'security:burst-ip', title: 'Someone is guessing sign-ins', detail: `${top} failed sign-in attempts from one address in the last hour${hot.length > 1 ? ` (${hot.length} addresses over ${BURST_PER_IP})` : ''}. See Security for the address and the accounts tried.` });
  }
  if (total >= BURST_TOTAL && !hot.length) {
    out.push({ key: 'security:burst-total', title: 'Unusual number of failed sign-ins', detail: `${total} failed sign-in attempts in the last hour, spread across many addresses. See Security.` });
  }
  for (const l of lockouts) {
    out.push({ key: `security:lockout:${l.accountId ?? 'unknown'}`, title: l.surface === 'owner' ? 'The owner account was locked out' : 'An admin account was locked out', detail: 'Five wrong passwords in a row. If that wasn’t a person on the team, see Security.' });
  }
  return out;
}

/** The hourly check's housekeeping: nothing older than 90 days is kept. */
export async function purgeOldSecurityEvents(now = new Date()): Promise<number> {
  const r = await prisma.securityEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - SECURITY_KEEP_DAYS * 24 * HOUR) } } });
  return r.count;
}

/** Admin → Security: the last 30 days. Owner only (it names IPs and the emails typed). */
export async function securityOverview(now = new Date()) {
  const since30 = new Date(now.getTime() - 30 * 24 * HOUR);
  const since24 = new Date(now.getTime() - 24 * HOUR);
  const failed30 = { kind: { in: FAILED_KINDS }, createdAt: { gte: since30 } };
  const [byKind24, byKind30, topIps, topEmails, recent, lockedNow] = await Promise.all([
    prisma.securityEvent.groupBy({ by: ['kind'], where: { createdAt: { gte: since24 } }, _count: { _all: true } }),
    prisma.securityEvent.groupBy({ by: ['kind'], where: { createdAt: { gte: since30 } }, _count: { _all: true } }),
    prisma.securityEvent.groupBy({ by: ['ip'], where: failed30, _count: { _all: true }, orderBy: { _count: { ip: 'desc' } }, take: 10 }),
    prisma.securityEvent.groupBy({ by: ['email'], where: { ...failed30, email: { not: '' } }, _count: { _all: true }, orderBy: { _count: { email: 'desc' } }, take: 10 }),
    prisma.securityEvent.findMany({ where: { createdAt: { gte: since30 }, kind: { not: 'signin_ok' } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    lockedAccountsNow(now),
  ]);
  const count = (rows: { kind: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map(r => [r.kind, r._count._all])) as Partial<Record<SecurityKind, number>>;
  return {
    last24h: count(byKind24),
    last30d: count(byKind30),
    topIps: topIps.map(r => ({ ip: r.ip, failed: r._count._all })),
    topEmails: topEmails.map(r => ({ email: r.email, failed: r._count._all })),
    recent: recent.map(r => ({ at: r.createdAt.toISOString(), kind: r.kind, surface: r.surface, ip: r.ip, email: r.email, detail: r.detail, browser: r.userAgent })),
    lockedNow,
  };
}

/** Accounts whose lockout hasn't run out yet, on every door that has one. */
export async function lockedAccountsNow(now = new Date()) {
  const where = { lockoutUntil: { gt: now } };
  const [admins, operators, staff, golfers] = await Promise.all([
    prisma.adminUser.findMany({ where, select: { email: true, role: true, lockoutUntil: true } }),
    prisma.courseOperator.findMany({ where, select: { email: true, lockoutUntil: true } }),
    prisma.courseStaff.findMany({ where, select: { email: true, lockoutUntil: true } }),
    prisma.golferAccount.findMany({ where, select: { email: true, lockoutUntil: true } }),
  ]);
  return [
    ...admins.map(a => ({ who: a.role === 'owner' ? 'Owner' : 'Admin', email: a.email, until: a.lockoutUntil!.toISOString() })),
    ...operators.map(a => ({ who: 'Course owner', email: a.email, until: a.lockoutUntil!.toISOString() })),
    ...staff.map(a => ({ who: 'Course staff', email: a.email, until: a.lockoutUntil!.toISOString() })),
    ...golfers.map(a => ({ who: 'Golfer', email: a.email, until: a.lockoutUntil!.toISOString() })),
  ];
}
