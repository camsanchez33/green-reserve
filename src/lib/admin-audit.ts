// BRAIN-1a (Cam 2026-10-22): the admin's memory. Every admin write records who
// did what, to what, the fields as they were and as they became, and — for
// money, access and deletes — why. ONE helper: a route never writes
// AdminAuditLog itself.
//
// Rules:
// - A REASON_ACTIONS action is refused (400) without a reason, BEFORE anything
//   happens (`needReason`). Everything else is recorded with no extra step.
// - The record is written after the action succeeds and is awaited (a route's
//   un-awaited write dies with the function). A failed record never undoes or
//   fails the action — a refund that went through stays reported as done — but
//   it is reported to Sentry and the server log, never swallowed.
// - Only what the action touched goes in before/after; never a password, token,
//   secret or card detail (`redact`).
import * as Sentry from '@sentry/nextjs';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from './prisma';
import type { AdminSession } from './admin-session';

/** Money, access and deletes: the admin must say why (Cam 2026-10-22). */
export const REASON_ACTIONS = new Set([
  // money
  'refund', 'retry_charge', 'cancel_booking', 'waive_fee',
  // access
  'employee_create', 'employee_role', 'employee_areas', 'employee_deactivate', 'employee_reactivate', 'employee_reset_password',
  'verify_operator',
  // deletes and archives
  'course_archive', 'course_unarchive', 'course_offline', 'inquiry_delete', 'expense_delete',
  'company_document_delete', 'goal_delete', 'course_group_delete', 'schedule_delete',
]);

/** Plain words for each action, for the reason box and the Audit page. */
export const ACTION_LABELS: Record<string, string> = {
  refund: 'Refund', retry_charge: 'Retry a charge', cancel_booking: 'Cancel a booking', waive_fee: 'Waive a fee',
  employee_create: 'Add an employee', employee_role: 'Change an employee’s role', employee_areas: 'Change what an employee can open', employee_deactivate: 'Turn off an employee’s access',
  employee_reactivate: 'Turn an employee’s access back on', employee_reset_password: 'Reset an employee’s password',
  verify_operator: 'Verify an operator’s email', course_archive: 'Archive a course', course_unarchive: 'Restore a course',
  course_offline: 'Take a course offline', inquiry_delete: 'Delete an inquiry', expense_delete: 'Delete an expense',
  company_document_delete: 'Delete a company document', goal_delete: 'Remove a goal', course_group_delete: 'Delete a course group',
  schedule_delete: 'Delete a schedule',
  // recorded without a reason
  course_settings: 'Edit course settings', course_go_live: 'Set a course live', course_featured: 'Feature a course',
  course_create: 'Build a course by hand', course_group_add: 'Add a course group', course_group_edit: 'Edit a course group',
  course_group_add_course: 'Add a course to a group', course_group_remove_course: 'Remove a course from a group',
  booking_add: 'Add a booking', tee_time_block: 'Block a tee time', tee_time_unblock: 'Reopen a tee time',
  resend_confirmation: 'Resend a booking confirmation', resend_receipt: 'Resend a receipt',
  note_add: 'Add a note', document_add: 'Add a document', company_document_add: 'Add a company document',
  expense_add: 'Add an expense', expense_edit: 'Edit an expense', goal_add: 'Add a goal',
  schedule_add: 'Add a schedule', schedule_edit: 'Edit a schedule', reminders_pause: 'Pause onboarding reminders',
  reminders_resume: 'Resume onboarding reminders', thread_close: 'Close a conversation', thread_reopen: 'Reopen a conversation',
  announcement_send: 'Send an announcement', password_change: 'Change own password', two_factor_confirm: 'Turn on two-factor',
  two_factor_regenerate: 'New recovery codes', passkey_add: 'Add a passkey', passkey_remove: 'Remove a passkey',
  device_remove: 'Remove a device', resend_staff_setup: 'Resend a staff setup email', request_re_review: 'Ask a course to re-review',
  golive_reminder: 'Send a go-live reminder', send_preview: 'Send a course its preview', agreement_version_published: 'Publish an agreement version', sentry_test: 'Send a Sentry test error',
  problem_claim: 'Take a problem', problem_assign: 'Assign a problem', problem_note: 'Note on a problem',
  problem_snooze: 'Snooze a problem', problem_unsnooze: 'Unsnooze a problem',
  dispute_evidence: 'Download a dispute evidence pack',
};

export const REASON_MIN = 4;
export const REASON_MAX = 500;

// `code` alone (a TOTP or recovery code) — not zipCode / postalCode / promoCode.
const SECRET_KEYS = /pass(word)?|token|secret|hash|otp|^code$|recovery|card|cvc|iban|account_?number|routing/i;

/** Drop anything that must never sit in an audit row. */
export function redact(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return null;
  // Too deep to scrub field by field: never store what was not checked.
  if (depth > 4) return typeof v === 'object' ? '[deep]' : v;
  if (Array.isArray(v)) return v.slice(0, 50).map(x => redact(x, depth + 1));
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? '[hidden]' : redact(x, depth + 1);
    }
    return out;
  }
  if (typeof v === 'string' && v.length > 1000) return v.slice(0, 1000) + '…';
  return v;
}

/** Only the keys whose values differ, as { before, after }. */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {}, a: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) { b[k] = before[k] ?? null; a[k] = after[k] ?? null; }
  }
  return { before: b, after: a };
}

/** The reason in a request body, trimmed; '' when absent. */
export function reasonOf(body: unknown): string {
  const r = (body as { reason?: unknown } | null)?.reason;
  return typeof r === 'string' ? r.trim().slice(0, REASON_MAX) : '';
}

/**
 * A request's JSON body ({} when none), with `?reason=` folded in — a DELETE
 * may carry its reason either way.
 */
export async function bodyWithReason(req: NextRequest): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const body = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  const q = req.nextUrl.searchParams.get('reason');
  return q && !body.reason ? { ...body, reason: q } : body;
}

/**
 * For a REASON_ACTIONS action: a 400 to send back when the body carries no
 * usable reason, else null. Call it before doing anything.
 */
export function needReason(action: string, body: unknown): NextResponse | null {
  if (!REASON_ACTIONS.has(action)) return null;
  if (reasonOf(body).length >= REASON_MIN) return null;
  return NextResponse.json({ error: 'Say why — a short reason is required for this action.', code: 'reason_required', label: ACTION_LABELS[action] ?? '' }, { status: 400 });
}

export type AuditEntry = {
  action: string;
  targetType: string;
  targetId: string;
  courseId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string;
  detail?: string;
};

/** Record one admin write. Awaited; never throws (see the header). */
export async function auditAdmin(session: Pick<AdminSession, 'adminId' | 'name'>, e: AuditEntry): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: session.adminId,
        actorName: session.name || '',
        action: e.action,
        targetType: e.targetType,
        targetId: String(e.targetId || '').slice(0, 190),
        courseId: e.courseId ?? null,
        before: e.before === undefined ? undefined : (redact(e.before) as object),
        after: e.after === undefined ? undefined : (redact(e.after) as object),
        reason: (e.reason || '').slice(0, REASON_MAX),
        detail: (e.detail || '').slice(0, 1000),
      },
    });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'admin_audit.write_failed', action: e.action, targetId: e.targetId, error: err instanceof Error ? err.message : String(err) }));
    Sentry.captureException(err, { tags: { area: 'admin_audit', action: e.action } });
  }
}

/** The course a booking belongs to, for the record ('' when it is gone). */
export async function courseOfBooking(bookingId: string): Promise<string | null> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { courseId: true } }).catch(() => null);
  return b?.courseId ?? null;
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/**
 * For a route with many actions: `describe(body)` names the action from the
 * request body (null = not recorded). Before the handler runs, a REASON_ACTIONS
 * action without a reason is refused; after a 2xx answer, the action is
 * recorded with the body (redacted) as `after`. The handler keeps its own gate —
 * the wrapper resolves the session only to name who did it.
 */
export function withAudit<C>(
  // Some gates type their refusal as possibly undefined; at runtime a handler always answers.
  handler: (req: NextRequest, ctx: C) => Promise<Response | undefined>,
  describe: (body: Record<string, unknown>) => (Omit<AuditEntry, 'reason'> | null),
): Handler<C> {
  return async (req, ctx) => {
    const body = await req.clone().json().catch(() => ({})) as Record<string, unknown>;
    const merged = req.nextUrl.searchParams.get('reason') && !body.reason ? { ...body, reason: req.nextUrl.searchParams.get('reason') } : body;
    const entry = describe(merged);
    if (entry) { const nr = needReason(entry.action, merged); if (nr) return nr; }
    const res = (await handler(req, ctx)) as Response;
    if (entry && res.status >= 200 && res.status < 300) {
      const { resolveAdminSession } = await import('./admin-session');
      const session = await resolveAdminSession();
      if (session) {
        const { reason: _r, ...rest } = merged;
        await auditAdmin(session, { after: rest, ...entry, reason: reasonOf(merged) });
      }
    }
    return res;
  };
}
