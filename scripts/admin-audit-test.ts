// BRAIN-1a: every admin write records who did what (and, for money, access
// and deletes, why). Two halves:
//  1. Static: every admin-gated route that writes goes through
//     lib/admin-audit.ts, or is on SKIP with the reason it needs no row.
//  2. The helper's own rules: reasons required where they must be, secrets
//     never stored, only changed fields kept.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { needReason, redact, changedFields, REASON_ACTIONS, REASON_MIN, ACTION_LABELS } from '../src/lib/admin-audit';
import { withReason } from '../src/lib/step-up-client';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ' — ' + detail : ''}`); if (!ok) failed++; };

/** Routes that write but need no audit row, and why. */
const SKIP: Record<string, string> = {
  'src/app/api/admin/login/route.ts': 'sign-in (lockout counters only)',
  'src/app/api/admin/logout/route.ts': 'sign-out',
  'src/app/api/admin/forgot-password/route.ts': 'no session: emails a reset link',
  'src/app/api/admin/set-password/route.ts': 'no session: invite-link password set',
  'src/app/api/admin/bootstrap/route.ts': 'no session: creates the very first admin',
  'src/app/api/admin/ask/route.ts': 'read-only AI answers',
  'src/app/api/admin/course-documents/upload/route.ts': 'upload permit only; ../record audits',
  'src/app/api/admin/company-documents/upload/route.ts': 'upload permit only; ../route POST audits',
  'src/app/api/cam/login/route.ts': 'owner sign-in: OwnerSession rows are the record',
  'src/app/api/cam/device/route.ts': 'owner device approval: OwnerDevice rows are the record',
  'src/app/api/cam/step-up/route.ts': 'owner re-confirmation: OwnerSession.stepUpAt is the record',
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('route.ts') ? [p] : []; });
}
const routes = [...walk('src/app/api/admin'), ...walk('src/app/api/cam'), 'src/app/api/preview/send/route.ts'];
const writes = routes.filter(f => /export (async function|const) (POST|PATCH|PUT|DELETE)\b/.test(readFileSync(f, 'utf8')));
check('found the admin write routes', writes.length >= 40, String(writes.length));
for (const f of writes) {
  const src = readFileSync(f, 'utf8');
  const audited = src.includes("from '@/lib/admin-audit'");
  check(`${f} ${SKIP[f] ? 'skipped: ' + SKIP[f] : 'is audited'}`, audited || !!SKIP[f]);
  if (audited) check(`${f} never writes the audit table directly`, !/adminAuditLog\.create/.test(src));
}
for (const f of Object.keys(SKIP)) check(`SKIP entry still exists: ${f}`, writes.includes(f), 'remove it from SKIP');

// The helper.
check('refund needs a reason', needReason('refund', {})?.status === 400);
check('a too-short reason is refused', needReason('refund', { reason: 'x' })?.status === 400);
check(`a ${REASON_MIN}+ character reason passes`, needReason('refund', { reason: 'frost closure' }) === null);
check('a routine action needs none', needReason('note_add', {}) === null);
for (const a of ['refund', 'retry_charge', 'cancel_booking', 'employee_role', 'employee_deactivate', 'course_archive', 'course_offline', 'inquiry_delete', 'expense_delete'])
  check(`${a} is a reason action`, REASON_ACTIONS.has(a));
const r = redact({ name: 'x', passwordHash: 'h', tempPassword: 'p', nested: { otpCode: '123', ok: 1 }, card: '4242' }) as Record<string, unknown>;
check('secrets are hidden', r.passwordHash === '[hidden]' && r.tempPassword === '[hidden]' && (r.nested as Record<string, unknown>).otpCode === '[hidden]' && r.card === '[hidden]');
check('ordinary fields stay', r.name === 'x' && (r.nested as Record<string, unknown>).ok === 1);
const d = changedFields({ a: 1, b: 2, c: null }, { a: 1, b: 3, c: null });
check('only changed fields are kept', JSON.stringify(d) === JSON.stringify({ before: { b: 2 }, after: { b: 3 } }));

// The client retry carries the reason in the body, or on the URL when there is none.
const [u1, i1] = withReason('/api/admin/refund', { method: 'POST', body: JSON.stringify({ bookingId: 'b1' }) }, 'frost');
check('retry adds the reason to a JSON body', u1 === '/api/admin/refund' && JSON.parse(String(i1?.body)).reason === 'frost' && JSON.parse(String(i1?.body)).bookingId === 'b1');
const [u2] = withReason('/api/admin/goals?id=g1', { method: 'DELETE' }, 'set by mistake');
check('retry adds ?reason= when there is no body', u2 === '/api/admin/goals?id=g1&reason=set+by+mistake', u2);
for (const a of REASON_ACTIONS) check(`${a} has a plain-words label`, !!ACTION_LABELS[a]);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
