// GOLFER-VIEW (Cam 2026-11-18, "Yes, record each view"): opening a golfer's record writes who, which golfer
// and when, at most once per admin per golfer per 10 minutes; the Audit page reads "Viewed golfer <name>";
// the search and the list are not recorded.
// Needs a database. Run: npx tsx scripts/golfer-view-audit-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { auditGolferView, auditLabel, GOLFER_VIEW_EVERY_MS } from '../src/lib/admin-audit';

const TAG = 'golferviewtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function cleanup() {
  const admins = await prisma.adminUser.findMany({ where: { email: { startsWith: TAG } }, select: { id: true } });
  await prisma.adminAuditLog.deleteMany({ where: { adminId: { in: admins.map(a => a.id) } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  // The route: the record (an account or a guest) is recorded before it is returned; search and list are not.
  const route = readFileSync('src/app/api/admin/golfers/route.ts', 'utf8');
  const record = route.slice(route.indexOf('if (golferId || guestEmail)'), route.indexOf('return NextResponse.json({ golfer:'));
  check('the record view records the view before answering', /await auditGolferView\(session,/.test(record));
  check('…and refuses the view when it cannot be recorded', /catch[\s\S]*status: 503/.test(record));
  check('the search and the list are not recorded', (route.match(/auditGolferView\(/g) ?? []).length === 1);
  const audit = readFileSync('src/app/api/admin/audit/route.ts', 'utf8');
  check('the Audit page labels rows with auditLabel', /label: auditLabel\(r\.action, r\.detail\)/.test(audit));

  check('the label reads "Viewed golfer <name>"', auditLabel('golfer_view', 'Pat Lee') === 'Viewed golfer Pat Lee');
  check('…and other actions keep their own words', auditLabel('refund', 'x') === 'Refund' && auditLabel('some_new_thing', '') === 'some new thing');

  const a = await prisma.adminUser.create({ data: { email: `${TAG}-a@test.local`, name: 'Avery', role: 'support', passwordHash: 'x' } });
  const b = await prisma.adminUser.create({ data: { email: `${TAG}-b@test.local`, name: 'Blake', role: 'support', passwordHash: 'x' } });
  const sa = { adminId: a.id, name: a.name }, sb = { adminId: b.id, name: b.name };
  const g1 = { kind: 'account' as const, id: 'golfer-1', name: 'Pat Lee' };
  const t0 = new Date('2026-11-18T15:00:00Z');
  const rows = (adminId: string) => prisma.adminAuditLog.findMany({ where: { adminId, action: 'golfer_view' }, orderBy: { createdAt: 'asc' } });

  check('the first open is recorded', (await auditGolferView(sa, g1, t0)) === 'recorded');
  const first = (await rows(a.id))[0];
  check('…with who, which golfer and when', !!first && first.actorName === 'Avery' && first.targetType === 'golfer' && first.targetId === 'golfer-1'
    && first.detail === 'Pat Lee' && first.createdAt.toISOString() === t0.toISOString(), first);
  check('a reload 9 minutes later is not recorded again', (await auditGolferView(sa, g1, new Date(t0.getTime() + 9 * 60_000))) === 'recent' && (await rows(a.id)).length === 1);
  check('another golfer is recorded', (await auditGolferView(sa, { kind: 'account', id: 'golfer-2', name: 'Sam Ray' }, t0)) === 'recorded');
  check('another admin opening the same golfer is recorded', (await auditGolferView(sb, g1, t0)) === 'recorded' && (await rows(b.id)).length === 1);
  check('a guest record is recorded by its email, separately', (await auditGolferView(sa, { kind: 'guest', id: 'pat@example.test', name: 'Pat Lee' }, t0)) === 'recorded'
    && (await rows(a.id)).some(r => r.targetType === 'golfer_guest' && r.targetId === 'pat@example.test'));
  check('an open after 10 minutes is recorded again', (await auditGolferView(sa, g1, new Date(t0.getTime() + GOLFER_VIEW_EVERY_MS + 1000))) === 'recorded'
    && (await rows(a.id)).filter(r => r.targetId === 'golfer-1').length === 2);

  // Two opens at the same moment still make one row: the check and the write wait on one advisory lock. Hold that
  // lock from another transaction, write the row there, and the second open must wait for it and then find it.
  const t1 = new Date(t0.getTime() + 60 * 60_000);
  const g3 = { kind: 'account' as const, id: 'golfer-3', name: 'Lee Fox' };
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  let locked!: () => void; const haveLock = new Promise<void>(r => { locked = r; });
  const holder = prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`golfer-view:${a.id}:golfer:golfer-3`}))`;
    await tx.adminAuditLog.create({ data: { adminId: a.id, actorName: 'Avery', action: 'golfer_view', targetType: 'golfer', targetId: 'golfer-3', detail: 'Lee Fox', createdAt: t1 } });
    locked();
    await gate;
  }, { timeout: 15_000 });
  await haveLock;
  let settled = false;
  const second = auditGolferView(sa, g3, t1).finally(() => { settled = true; });
  await new Promise(r => setTimeout(r, 400));
  check('a second open at the same moment waits for the first', !settled);
  release(); await holder;
  check('…then finds its row and adds none', (await second) === 'recent' && (await rows(a.id)).filter(r => r.targetId === 'golfer-3').length === 1);
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });
