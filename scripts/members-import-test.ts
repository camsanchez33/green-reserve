// Members → Import a list and "last round" (Cam 2026-10-19). Reading the CSV
// (pure), then the import against a database: tiers by name, dues, expiry,
// existing members skipped and never changed, nobody emailed.
// Needs a database. Run: npx tsx scripts/members-import-test.ts
import { prisma } from '../src/lib/prisma';
import { parseCsv, readMemberCsv, toYmd } from '../src/lib/member-csv';
import { importMembers } from '../src/lib/member-import';
import { readFileSync } from 'fs';

const TAG = 'membersimporttest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ' — ' + JSON.stringify(detail)}`); if (!ok) failed++; };

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.courseMembership.deleteMany({ where: { courseId } });
  await prisma.membershipTier.deleteMany({ where: { courseId } });
  await prisma.golferAccount.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  // ── Reading the file ───────────────────────────────────────────────────────
  check('quoted fields, commas inside quotes, "" escapes, CRLF', JSON.stringify(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')) === JSON.stringify([['a', 'b, c', 'say "hi"'], ['1', '2', '3']]));
  check('tab-separated (pasted from a spreadsheet)', parseCsv('Email\tName\nx@y.co\tX Y')[1][1] === 'X Y');
  check('dates: ISO, US long and short; bad ones refused', toYmd('2027-03-31') === '2027-03-31' && toYmd('3/31/2027') === '2027-03-31' && toYmd('3/31/27') === '2027-03-31' && toYmd('2/30/2027') === null && toYmd('') === '');
  const read = readMemberCsv([
    'E-mail,First Name,Last Name,Membership,Expires,Paid',
    'JANE@x.com,Jane,Smith,Gold,3/31/2027,yes',
    'bad-email,Bob,Lee,,,',
    'jane@x.com,Jane,Again,,,',
    'tom@x.com,Tom,Ng,Silver,someday,',
    'ann@x.com,Ann,Ko,,,no',
  ].join('\n'));
  check('headers by meaning; first + last joined; email lower-cased', read.rows[0].email === 'jane@x.com' && read.rows[0].name === 'Jane Smith' && read.rows[0].tier === 'Gold' && read.rows[0].expires === '2027-03-31' && read.rows[0].paid === true, read.rows[0]);
  check('bad email, duplicate and unreadable date are named by line', read.problems.map(p => p.line).join() === '3,4,5', read.problems);
  check('"no" in Paid reads as not paid', read.rows.find(r => r.email === 'ann@x.com')?.paid === false);
  const gap = readMemberCsv('Email,Name\n\na@x.com,A\n\n\nbad,B');
  check('line numbers count blank lines, as the spreadsheet does', gap.rows[0].line === 3 && gap.problems[0]?.line === 6, gap);
  check('no Email column: one clear message', /No "Email" column/.test(readMemberCsv('Name\nX').problems[0]?.message ?? ''));

  // ── Import ─────────────────────────────────────────────────────────────────
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Imp', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: 'Imp', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'T', state: 'CA', zipCode: '90210', holes: 18 } });
  const gold = await prisma.membershipTier.create({ data: { courseId: course.id, name: 'Gold', termMonths: 12 } });
  const basic = await prisma.membershipTier.create({ data: { courseId: course.id, name: 'Basic', termMonths: 6 } });
  const acct = await prisma.golferAccount.create({ data: { email: `${TAG}-acct@x.com`, firstName: 'Acc', lastName: 'Ount', password: '' } }).catch(() => null);
  const already = await prisma.courseMembership.create({ data: { courseId: course.id, tierId: basic.id, inviteEmail: `${TAG}-old@x.com`, inviteName: 'Old Member', notes: 'keep me', payToken: 't' } });

  const csv = [
    'Email,Name,Membership,Expires,Paid',
    `${TAG}-a@x.com,A One,gold,2027-03-31,yes`,
    `${TAG}-b@x.com,B Two,Platinum,,`,
    `${TAG}-old@x.com,Changed Name,Gold,,yes`,
    `${TAG}-noname@x.com,,,,`,
    ...(acct ? [`${TAG}-acct@x.com,,,,no`] : []),
  ].join('\n');
  const r = await importMembers(course.id, readMemberCsv(csv).rows, { defaultTierId: basic.id, paidByDefault: false, addedBy: 'test' });
  if ('error' in r) { check('import ran', false, r); return; }
  const by = async (e: string) => prisma.courseMembership.findFirst({ where: { courseId: course.id, inviteEmail: e } });
  const a = await by(`${TAG}-a@x.com`), b = await by(`${TAG}-b@x.com`);
  check('added count', r.added === (acct ? 3 : 2), r);
  check('tier by name, case-insensitive; paid → paid_offline with the given expiry', a?.tierId === gold.id && a?.paymentStatus === 'paid_offline' && a?.expiresAt?.toISOString().startsWith('2027-03-31') === true, a);
  check('unknown tier → the default; not paid → unpaid, no expiry made up', b?.tierId === basic.id && b?.paymentStatus === 'unpaid' && b?.expiresAt === null, b);
  check('imported members never owe the joining fee again', a?.initiationWaived === true && b?.initiationWaived === true);
  const old = await prisma.courseMembership.findUnique({ where: { id: already.id } });
  check('an existing member is skipped and never changed', r.skipped.some(s => s.email === `${TAG}-old@x.com` && s.reason === 'Already a member') && old?.inviteName === 'Old Member' && old?.notes === 'keep me');
  check('no name and no account → skipped with the reason', r.skipped.some(s => s.email === `${TAG}-noname@x.com`));
  if (acct) {
    const m = await by(`${TAG}-acct@x.com`);
    check('an existing GreenReserve account is linked and lends its name', m?.golferId === acct.id && m?.inviteName === 'Acc Ount' && m?.inviteAccepted === true, m);
  }
  const again = await importMembers(course.id, readMemberCsv(csv).rows, { defaultTierId: basic.id, paidByDefault: false, addedBy: 'test' });
  check('importing the same file twice adds nobody', !('error' in again) && again.added === 0);
  check('a tier from another course is refused', 'error' in (await importMembers(course.id, [], { defaultTierId: 'nope', paidByDefault: false, addedBy: 't' })));

  // ── Source guards ──────────────────────────────────────────────────────────
  const route = readFileSync('src/app/api/operator/members/import/route.ts', 'utf8');
  check('the import route needs members.edit and reads the file itself', route.includes("requirePermission(session, 'members.edit')") && route.includes('readMemberCsv(csv)'));
  check('every dues path skips the joining fee for imported members',
    readFileSync('src/lib/membership-pay-link.ts', 'utf8').includes('m.lastPaidAt || m.initiationWaived ? 0')
    && readFileSync('src/app/api/operator/members/remind-overdue/route.ts', 'utf8').includes('m.lastPaidAt || m.initiationWaived ? 0')
    && readFileSync('src/app/api/membership/[id]/route.ts', 'utf8').includes('m.lastPaidAt || m.initiationWaived ? 0')
    && readFileSync('src/app/api/member/[courseSlug]/payments/route.ts', 'utf8').includes('!membership.initiationWaived')
    && readFileSync('src/app/dashboard/members/page.tsx', 'utf8').includes('(m.lastPaidAt || m.initiationWaived) ? 0')
    && readFileSync('src/app/api/operator/members/route.ts', 'utf8').includes('initiationWaived: m.initiationWaived'));
  check('only "already a member" is swallowed; other failures fail the import', readFileSync('src/lib/member-import.ts', 'utf8').includes("code !== 'P2002') throw err"));
  check('the import never emails', !/send\w*Email|sendSms/.test(route + readFileSync('src/lib/member-import.ts', 'utf8')));
  check('the members list returns each member\'s last round', readFileSync('src/app/api/operator/members/route.ts', 'utf8').includes('lastRound:      st?.lastRound ?? null') && readFileSync('src/lib/member-stats.ts', 'utf8').includes('lastRound: list.map(r => r.teeTime.date).sort().pop()'));

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
