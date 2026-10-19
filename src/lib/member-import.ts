// Members → Import a list (Cam 2026-10-19, OPERATOR_REWORK_SPEC "Members = list
// first … Add member and Import list at the top"). A course pastes or uploads
// its member list (CSV); each row becomes a membership on one of its tiers.
// Nobody is emailed: a member gets member rates as soon as they sign in with the
// listed email (getGolferMembership matches it), and a pay link can be sent from
// their row. The parsing and checks are pure; importMembers writes.
import { randomUUID } from 'crypto';
import { prisma } from './prisma';
import type { ImportRow } from './member-csv';

export type ImportOptions = { defaultTierId: string; paidByDefault: boolean; addedBy: string };
export type ImportResult = { added: number; skipped: { line: number; email: string; reason: string }[] };

/** Create the memberships. Existing members are skipped, never changed. */
export async function importMembers(courseId: string, rows: ImportRow[], opts: ImportOptions): Promise<ImportResult | { error: string }> {
  const tiers = await prisma.membershipTier.findMany({ where: { courseId, active: true }, select: { id: true, name: true, termMonths: true } });
  const fallback = tiers.find(t => t.id === opts.defaultTierId);
  if (!fallback) return { error: 'Pick the membership these members go on.' };
  const byName = new Map(tiers.map(t => [t.name.trim().toLowerCase(), t]));
  const skipped: ImportResult['skipped'] = [];
  let added = 0;

  const emails = rows.map(r => r.email);
  const golfers = await prisma.golferAccount.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, firstName: true, lastName: true, phone: true } });
  const golferBy = new Map(golfers.map(g => [g.email.toLowerCase(), g]));
  const existing = await prisma.courseMembership.findMany({
    where: { courseId, OR: [{ inviteEmail: { in: emails } }, { golferId: { in: golfers.map(g => g.id) } }] },
    select: { inviteEmail: true, golferId: true },
  });
  const taken = new Set([...existing.map(e => e.inviteEmail.toLowerCase()), ...existing.flatMap(e => golfers.filter(g => g.id === e.golferId).map(g => g.email.toLowerCase()))]);

  for (const r of rows) {
    if (taken.has(r.email)) { skipped.push({ line: r.line, email: r.email, reason: 'Already a member' }); continue; }
    const golfer = golferBy.get(r.email);
    const name = r.name || (golfer ? `${golfer.firstName} ${golfer.lastName}`.trim() : '');
    if (!name) { skipped.push({ line: r.line, email: r.email, reason: 'No name, and no GreenReserve account to take it from' }); continue; }
    const tier = (r.tier && byName.get(r.tier.toLowerCase())) || fallback;
    const paid = r.paid ?? opts.paidByDefault;
    const now = new Date();
    let expiresAt: Date | null = r.expires ? new Date(`${r.expires}T23:59:59Z`) : null;
    if (!expiresAt && paid) { expiresAt = new Date(now); expiresAt.setMonth(expiresAt.getMonth() + (tier.termMonths || 12)); }
    try {
      await prisma.courseMembership.create({
        data: {
          courseId, golferId: golfer?.id ?? null, tierId: tier.id, membershipType: tier.name,
          status: 'active', addedBy: opts.addedBy || 'import', notes: 'Imported',
          inviteEmail: r.email, inviteName: name, invitePhone: r.phone || golfer?.phone || '',
          inviteAccepted: !!golfer, payToken: randomUUID(), expiresAt,
          // Already a member of the course: no one-time initiation fee on their dues.
          initiationWaived: true,
          ...(paid ? { paymentStatus: 'paid_offline', lastPaidAt: now, startedAt: now } : {}),
        },
      });
      taken.add(r.email);
      added++;
    } catch (err) {
      // Only the unique key means "already there" (a second import racing this
      // one); anything else fails the import so the page says so.
      if ((err as { code?: string })?.code !== 'P2002') throw err;
      skipped.push({ line: r.line, email: r.email, reason: 'Already a member' });
    }
  }
  return { added, skipped };
}
