// @brain course-events
import { prisma } from '@/lib/prisma';
import { FEED_GROUPS, type FeedGroup, type FeedItem } from './course-timeline-groups';

// A-05 items 4/5: a per-course event log with NO schema change — rides on
// the EXISTING InquiryStatusEvent table via a linked CourseInquiry
// (builtCourseId), same pattern change-requests.ts already established for
// "Preview sent"/"Course approved" markers: a prefix + JSON payload packed
// into the free-text actorName field. fromStatus/toStatus are set to the
// inquiry's CURRENT status on both sides (a no-op transition) — these rows
// are log entries, not real pipeline moves.
//
// Courses with no linked inquiry (rare — e.g. very old manual records) have
// nowhere to log; callers get `null`/`false` back and should degrade quietly,
// the same way lifecycle.ts already treats a missing inquiry as optional.

export const SETTINGS_CHANGED_PREFIX = 'SETTINGS_CHANGED::';
export const REMINDER_SENT_PREFIX = 'REMINDER_SENT::';
export const REMINDERS_PAUSED_PREFIX = 'REMINDERS_PAUSED::';
export const REMINDERS_RESUMED_PREFIX = 'REMINDERS_RESUMED::';
export const AGREEMENT_ACCEPTED_PREFIX = 'OPERATOR_AGREEMENT_ACCEPTED::';
export const DOCUMENT_UPLOADED_PREFIX = 'DOCUMENT_UPLOADED::';
export const NOTE_ADDED_PREFIX = 'NOTE_ADDED::';
/** CS-1: check-in call scheduled / moved / logged, and bare next-date sets. */
export const CHECKIN_CALL_PREFIX = 'CHECKIN_CALL::';

// LEGAL PAGES V2 (RUN_QUEUE) — bumped alongside the operator-agreement and
// terms page rewrites. Existing acceptances are NOT invalidated by this —
// hasAcceptedAgreement() below counts any past acceptance regardless of
// version (item 4/9's "don't force re-acceptance"); a future "new version
// needs acceptance" flow is noted as future work, not built.
// (Booking-terms version lives in src/lib/terms.ts — CURRENT_TERMS_VERSION
// is the real one, stamped on every booking record; it belongs there, not
// duplicated here.)
// AG-1: the current version is whatever is newest in legal/documents/ — see
// lib/agreements.ts. This constant is kept only so the timeline payload type
// stays readable; nothing should compare against it.
export const CURRENT_AGREEMENT_VERSION = '2026-08';

export interface SettingsChangedPayload { changes: { field: string; from: unknown; to: unknown }[]; by: string }
export interface ReminderSentPayload { step: string }
export interface AgreementAcceptedPayload { version: string; acceptedBy: string }
export interface DocumentUploadedPayload { name: string; url: string; by: string }
export interface NoteAddedPayload { text: string; by: string }
export interface CheckInCallPayload { text: string; by: string }

export type TimelineEvent =
  | { type: 'settings_changed'; at: string; data: SettingsChangedPayload }
  | { type: 'reminder_sent'; at: string; data: ReminderSentPayload }
  | { type: 'reminders_paused'; at: string; data: { by: string } }
  | { type: 'reminders_resumed'; at: string; data: { by: string } }
  | { type: 'agreement_accepted'; at: string; data: AgreementAcceptedPayload }
  | { type: 'document_uploaded'; at: string; data: DocumentUploadedPayload }
  | { type: 'note_added'; at: string; data: NoteAddedPayload }
  | { type: 'checkin_call'; at: string; data: CheckInCallPayload };

function encode(prefix: string, payload: unknown): string {
  return prefix + JSON.stringify(payload);
}

function decodeOne(actorName: string | null, createdAt: Date): TimelineEvent | null {
  if (!actorName) return null;
  const at = createdAt.toISOString();
  try {
    if (actorName.startsWith(SETTINGS_CHANGED_PREFIX)) return { type: 'settings_changed', at, data: JSON.parse(actorName.slice(SETTINGS_CHANGED_PREFIX.length)) };
    if (actorName.startsWith(REMINDER_SENT_PREFIX)) return { type: 'reminder_sent', at, data: JSON.parse(actorName.slice(REMINDER_SENT_PREFIX.length)) };
    if (actorName.startsWith(REMINDERS_PAUSED_PREFIX)) return { type: 'reminders_paused', at, data: JSON.parse(actorName.slice(REMINDERS_PAUSED_PREFIX.length)) };
    if (actorName.startsWith(REMINDERS_RESUMED_PREFIX)) return { type: 'reminders_resumed', at, data: JSON.parse(actorName.slice(REMINDERS_RESUMED_PREFIX.length)) };
    if (actorName.startsWith(AGREEMENT_ACCEPTED_PREFIX)) return { type: 'agreement_accepted', at, data: JSON.parse(actorName.slice(AGREEMENT_ACCEPTED_PREFIX.length)) };
    if (actorName.startsWith(DOCUMENT_UPLOADED_PREFIX)) return { type: 'document_uploaded', at, data: JSON.parse(actorName.slice(DOCUMENT_UPLOADED_PREFIX.length)) };
    if (actorName.startsWith(NOTE_ADDED_PREFIX)) return { type: 'note_added', at, data: JSON.parse(actorName.slice(NOTE_ADDED_PREFIX.length)) };
    if (actorName.startsWith(CHECKIN_CALL_PREFIX)) return { type: 'checkin_call', at, data: JSON.parse(actorName.slice(CHECKIN_CALL_PREFIX.length)) };
  } catch { /* ignore malformed marker */ }
  return null;
}

async function findLinkedInquiry(courseId: string) {
  return prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId }, select: { id: true, status: true } });
}

// Returns false if there's no linked inquiry to log against — callers
// should not treat this as an error, just as "nothing to log here."
async function log(courseId: string, marker: string, trigger: 'admin' | 'system'): Promise<boolean> {
  const inquiry = await findLinkedInquiry(courseId);
  if (!inquiry) return false;
  await prisma.inquiryStatusEvent.create({
    data: { inquiryId: inquiry.id, fromStatus: inquiry.status, toStatus: inquiry.status, trigger, actorName: marker },
  });
  return true;
}

export async function logSettingsChanged(courseId: string, changes: { field: string; from: unknown; to: unknown }[], by: string): Promise<boolean> {
  if (changes.length === 0) return false;
  return log(courseId, encode(SETTINGS_CHANGED_PREFIX, { changes, by } as SettingsChangedPayload), 'admin');
}

export async function logReminderSent(courseId: string, step: string): Promise<boolean> {
  return log(courseId, encode(REMINDER_SENT_PREFIX, { step } as ReminderSentPayload), 'system');
}

export async function logRemindersPaused(courseId: string, by: string, paused: boolean): Promise<boolean> {
  return log(courseId, encode(paused ? REMINDERS_PAUSED_PREFIX : REMINDERS_RESUMED_PREFIX, { by }), 'admin');
}

export async function logAgreementAccepted(courseId: string, acceptedBy: string, version: string = CURRENT_AGREEMENT_VERSION): Promise<boolean> {
  return log(courseId, encode(AGREEMENT_ACCEPTED_PREFIX, { version, acceptedBy } as AgreementAcceptedPayload), 'system');
}

export async function logDocumentUploaded(courseId: string, name: string, url: string, by: string): Promise<boolean> {
  return log(courseId, encode(DOCUMENT_UPLOADED_PREFIX, { name, url, by } as DocumentUploadedPayload), 'admin');
}

export async function logCheckInCall(courseId: string, text: string, by: string): Promise<boolean> {
  return log(courseId, encode(CHECKIN_CALL_PREFIX, { text, by } as CheckInCallPayload), 'admin');
}

export async function logNoteAdded(courseId: string, text: string, by: string): Promise<boolean> {
  return log(courseId, encode(NOTE_ADDED_PREFIX, { text, by } as NoteAddedPayload), 'admin');
}

// Every decoded event for a course, newest first. `null` if there's no
// linked inquiry (nothing has ever been logged, and nothing can be).
export async function getCourseTimeline(courseId: string): Promise<TimelineEvent[] | null> {
  const inquiry = await findLinkedInquiry(courseId);
  if (!inquiry) return null;
  const rows = await prisma.inquiryStatusEvent.findMany({
    where: { inquiryId: inquiry.id },
    select: { actorName: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const events: TimelineEvent[] = [];
  for (const r of rows) {
    const ev = decodeOne(r.actorName, r.createdAt);
    if (ev) events.push(ev);
  }
  return events;
}

// Most recent pause/resume wins — same "latest marker wins" pattern
// latestPageDecision uses for approval state.
export function isRemindersPaused(events: TimelineEvent[]): boolean {
  for (const ev of events) {
    if (ev.type === 'reminders_paused') return true;
    if (ev.type === 'reminders_resumed') return false;
  }
  return false;
}

export function lastReminderSentAt(events: TimelineEvent[]): Date | null {
  const ev = events.find(e => e.type === 'reminder_sent');
  return ev ? new Date(ev.at) : null;
}

export function reminderSentCount(events: TimelineEvent[]): number {
  return events.filter(e => e.type === 'reminder_sent').length;
}

export function latestAgreementAcceptance(events: TimelineEvent[]): AgreementAcceptedPayload & { at: string } | null {
  const ev = events.find(e => e.type === 'agreement_accepted');
  return ev && ev.type === 'agreement_accepted' ? { ...ev.data, at: ev.at } : null;
}

// AGREEMENT = GO-LIVE GATE — hasAcceptedAgreement moved to lib/agreement-gate.ts
// (AG-1): it reads the AgreementAcceptance table and the documents on disk,
// and this module is imported by client pages, which must not bundle fs.

// ─── BRAIN-1b: the whole story of a course, one feed ──────────────────────────
// Cam 2026-10-22: every event for a course in one place, newest first — what
// happened with bookings and money, what was sent and said, what admins and
// staff changed, and problems and onboarding. Each source is read with the same
// cursor and limit, then merged; nothing is copied into a new table.

export { FEED_GROUPS, type FeedGroup, type FeedItem };

const money = (c: number | null | undefined) => c == null ? '' : `$${(c / 100).toFixed(2)}`;
const words = (k: string) => k.replace(/_/g, ' ').replace(/\b(email|text)$/, '').trim();
const BOOKING_TITLES: Record<string, string> = {
  booking_created: 'Booked', booking_cancelled: 'Cancelled', checked_in: 'Checked in',
  no_show_marked: 'Marked no-show', no_show_cleared: 'No-show cleared', booking_moved: 'Moved to another time',
  price_changed: 'Price changed at the counter',
};
const PAYMENT_TITLES: Record<string, [string, FeedItem['tone']]> = {
  round_charge: ['Round charged', 'ok'], charge: ['Charged', 'ok'], fee_charged: ['GreenReserve fee charged', 'ok'],
  access_fee: ['GreenReserve fee charged', 'ok'], no_show_fee: ['No-show fee charged', 'warn'],
  charge_failed: ['Charge declined', 'bad'], refund: ['Refunded', undefined], fee_refunded: ['GreenReserve fee refunded', undefined],
  no_show_fee_refunded: ['No-show fee refunded', undefined], refund_failed: ['Refund failed', 'bad'],
  // Chargebacks are payment events, so they land here (their alert key names the dispute, not the course).
  dispute_opened: ['Chargeback opened', 'bad'], dispute_closed: ['Chargeback closed', undefined],
};
const STAGE: Record<string, string> = {
  lead: 'Lead', pending: 'New inquiry', in_review: 'Talking', details_requested: 'Details sheet sent',
  details_submitted: 'Details received', building: 'Building', live: 'Live', rejected: 'Closed',
};

export const FEED_PAGE = 60;

/**
 * One page of a course's feed: everything before `before` (newest first),
 * limited to the groups asked for. `next` is the cursor for the page after.
 */
/** The page cursor: the last row's time and id, so rows sharing a timestamp are never skipped. */
export function feedCursor(it: Pick<FeedItem, 'at' | 'id'>): string { return `${it.at}|${it.id}`; }
function parseCursor(c?: string | null): { at: Date; atIso: string; id: string } | null {
  if (!c) return null;
  const [atIso, id = ''] = c.split('|');
  const at = new Date(atIso);
  return Number.isNaN(at.getTime()) ? null : { at, atIso: at.toISOString(), id };
}

export async function buildCourseFeed(courseId: string, opts: { cursor?: string | null; groups?: FeedGroup[]; limit?: number } = {}): Promise<{ items: FeedItem[]; next: string | null } | null> {
  const limit = Math.min(opts.limit ?? FEED_PAGE, 200);
  const want = new Set(opts.groups?.length ? opts.groups : FEED_GROUPS.map(g => g.key));
  const cur = parseCursor(opts.cursor);
  // Each source reads one past the page (+ room for rows tied with the cursor),
  // so "more" is known even when a single source fills the page alone.
  const take = limit + 1 + (cur ? 20 : 0);
  const lt = cur ? { lte: cur.at } : undefined;
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, operator: { select: { email: true } }, staff: { select: { email: true } } },
  });
  if (!course) return null;
  const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: courseId }, select: { id: true, email: true } });
  // Emails with no course id attached reach the course's own people: owner, staff, the inquiry contact.
  const contacts = [course.operator?.email, inquiry?.email, ...course.staff.map(s => s.email)]
    .filter((e): e is string => !!e).map(e => e.toLowerCase());

  const items: FeedItem[] = [];
  const tasks: Promise<void>[] = [];

  if (want.has('bookings')) tasks.push((async () => {
    const [events, payments] = await Promise.all([
      prisma.bookingEvent.findMany({
        where: { courseId, occurredAt: lt, type: { notIn: ['fee_charged', 'fee_refunded'] } },
        orderBy: { occurredAt: 'desc' }, take,
      }),
      prisma.paymentEvent.findMany({
        where: { booking: { courseId }, createdAt: lt },
        orderBy: { createdAt: 'desc' }, take,
        select: { id: true, kind: true, amountCents: true, actorName: true, actor: true, detail: true, createdAt: true, booking: { select: { golferName: true } } },
      }),
    ]);
    const names = new Map((await prisma.booking.findMany({ where: { id: { in: [...new Set(events.map(e => e.bookingId))] } }, select: { id: true, golferName: true } })).map(b => [b.id, b.golferName]));
    for (const e of events) {
      const players = e.playerCount ? ` · ${e.playerCount} player${e.playerCount === 1 ? '' : 's'}` : '';
      items.push({
        id: `be-${e.id}`, at: e.occurredAt.toISOString(), group: 'bookings',
        title: `${BOOKING_TITLES[e.type] ?? words(e.type)} — ${names.get(e.bookingId) ?? 'a golfer'}${players}`,
        detail: e.teeTimeAt ? `Tee time ${e.teeTimeAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}` : undefined,
        who: e.actorType === 'golfer' ? undefined : e.actorType,
        tone: e.type === 'no_show_marked' || e.type === 'booking_cancelled' ? 'warn' : undefined,
      });
    }
    for (const p of payments) {
      const [label, tone] = PAYMENT_TITLES[p.kind] ?? [words(p.kind), undefined];
      items.push({
        id: `pe-${p.id}`, at: p.createdAt.toISOString(), group: 'bookings',
        title: `${label} ${money(p.amountCents)} — ${p.booking.golferName}`.replace('  ', ' '),
        detail: p.detail || undefined, who: p.actorName || (p.actor === 'system' || p.actor === 'cron' ? 'automatic' : p.actor), tone,
      });
    }
  })());

  if (want.has('messages')) tasks.push((async () => {
    const [sent, thread] = await Promise.all([
      prisma.sentMessage.findMany({
        where: { createdAt: lt, OR: [{ courseId }, ...(contacts.length ? [{ courseId: null, to: { in: contacts } }] : []), ...(inquiry ? [{ inquiryId: inquiry.id }] : [])] },
        orderBy: { createdAt: 'desc' }, take,
      }),
      prisma.message.findMany({
        where: { thread: { courseId }, createdAt: lt, isBroadcast: false },
        orderBy: { createdAt: 'desc' }, take,
        select: { id: true, senderType: true, senderName: true, body: true, createdAt: true },
      }),
    ]);
    for (const m of sent) {
      const what = m.kind.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
      items.push({
        id: `sm-${m.id}`, at: m.createdAt.toISOString(), group: 'messages',
        title: `${m.channel === 'sms' ? 'Text' : 'Email'}: ${what}${m.status === 'failed' ? ' — not delivered' : m.status === 'skipped' ? ' — not sent' : ''}`,
        detail: m.status === 'failed' || m.status === 'skipped' ? `To ${m.to}. ${m.error}` : `To ${m.to}`, tone: m.status === 'failed' ? 'bad' : undefined,
      });
    }
    for (const m of thread) {
      items.push({
        id: `msg-${m.id}`, at: m.createdAt.toISOString(), group: 'messages',
        title: m.senderType === 'admin' ? `GreenReserve wrote to the course` : `${m.senderName} wrote to GreenReserve`,
        detail: m.body.length > 240 ? m.body.slice(0, 240) + '…' : m.body, who: m.senderName,
      });
    }
  })());

  if (want.has('changes')) tasks.push((async () => {
    const [audit, staffChanges, legacy] = await Promise.all([
      prisma.adminAuditLog.findMany({ where: { courseId, createdAt: lt }, orderBy: { createdAt: 'desc' }, take, include: { admin: { select: { name: true } } } }),
      prisma.staffPermissionChange.findMany({ where: { courseId, createdAt: lt }, orderBy: { createdAt: 'desc' }, take }),
      inquiry ? prisma.inquiryStatusEvent.findMany({ where: { inquiryId: inquiry.id, createdAt: lt, actorName: { startsWith: SETTINGS_CHANGED_PREFIX } }, orderBy: { createdAt: 'desc' }, take }) : Promise.resolve([]),
    ]);
    const { ACTION_LABELS } = await import('./admin-audit');
    for (const a of audit) {
      const after = (a.after as Record<string, unknown> | null) ?? {};
      const changed = Object.keys(after).slice(0, 4).map(k => {
        const v = after[k];
        const name = k.replace(/Cents$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
        const shown = /Cents$/.test(k) && typeof v === 'number' ? money(v) : typeof v === 'object' || v === null ? '' : String(v).slice(0, 40);
        return shown ? `${name} ${shown}` : name;
      });
      items.push({
        id: `au-${a.id}`, at: a.createdAt.toISOString(), group: 'changes',
        title: ACTION_LABELS[a.action] ?? a.action.replace(/_/g, ' '),
        detail: [a.reason ? `“${a.reason}”` : '', changed.join(', ')].filter(Boolean).join(' · ') || undefined,
        who: a.actorName || a.admin.name,
      });
    }
    for (const c of staffChanges) {
      items.push({ id: `sp-${c.id}`, at: c.createdAt.toISOString(), group: 'changes', title: 'Staff permissions changed', detail: `${c.before.length} → ${c.after.length} permissions`, who: c.changedBy });
    }
    for (const r of legacy) {
      const ev = decodeOne(r.actorName, r.createdAt);
      if (ev?.type !== 'settings_changed') continue;
      // The admin's own edits are already in the audit record; this keeps the operator's.
      items.push({ id: `sc-${r.id}`, at: ev.at, group: 'changes', title: 'Course settings changed', detail: ev.data.changes.map(ch => ch.field).slice(0, 6).join(', '), who: ev.data.by });
    }
  })());

  if (want.has('problems')) tasks.push((async () => {
    const [stages, calls, alerts] = await Promise.all([
      inquiry ? prisma.inquiryStatusEvent.findMany({ where: { inquiryId: inquiry.id, createdAt: lt }, orderBy: { createdAt: 'desc' }, take: take * 2 }) : Promise.resolve([]),
      prisma.call.findMany({ where: { createdAt: lt, OR: [{ courseId }, ...(inquiry ? [{ inquiryId: inquiry.id }] : [])] }, orderBy: { createdAt: 'desc' }, take }),
      prisma.adminAlert.findMany({ where: { OR: [{ key: { contains: courseId } }, ...(inquiry ? [{ key: { contains: inquiry.id } }] : [])] }, orderBy: { firstSeenAt: 'desc' }, take }),
    ]);
    for (const s of stages) {
      if (s.fromStatus !== s.toStatus) {
        items.push({ id: `st-${s.id}`, at: s.createdAt.toISOString(), group: 'problems', title: `Onboarding: ${STAGE[s.fromStatus] ?? s.fromStatus} → ${STAGE[s.toStatus] ?? s.toStatus}`, who: s.actorName ?? (s.trigger === 'system' ? 'automatic' : undefined) });
        continue;
      }
      const ev = decodeOne(s.actorName, s.createdAt);
      if (!ev || ev.type === 'settings_changed') continue;
      const title = ev.type === 'note_added' ? 'Note' : ev.type === 'checkin_call' ? 'Check-in call notes' : ev.type === 'agreement_accepted' ? `Signed the Operator Agreement (${ev.data.version})`
        : ev.type === 'document_uploaded' ? `Document added: ${ev.data.name}` : ev.type === 'reminder_sent' ? 'Onboarding reminder sent'
        : ev.type === 'reminders_paused' ? 'Onboarding reminders paused' : 'Onboarding reminders resumed';
      const detail = ev.type === 'note_added' || ev.type === 'checkin_call' ? ev.data.text : undefined;
      const who = 'by' in ev.data ? (ev.data as { by: string }).by : ev.type === 'agreement_accepted' ? ev.data.acceptedBy : undefined;
      items.push({ id: `mk-${s.id}`, at: ev.at, group: 'problems', title, detail, who });
    }
    for (const c of calls) {
      const when = c.scheduledAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
      items.push({ id: `call-${c.id}`, at: c.createdAt.toISOString(), group: 'problems', title: `${c.kind === 'checkin' ? 'Check-in' : 'Discovery'} call ${c.outcome === 'scheduled' ? 'booked for' : `on ${when}:`} ${c.outcome === 'scheduled' ? when : c.outcome.replace(/_/g, ' ')}`, detail: c.notes ? c.notes.slice(0, 240) : undefined, who: c.createdBy || undefined });
    }
    for (const a of alerts) {
      if (!cur || a.firstSeenAt <= cur.at) items.push({ id: `al-${a.id}`, at: a.firstSeenAt.toISOString(), group: 'problems', title: `Problem: ${a.title}`, detail: a.detail, tone: 'bad' });
      if (a.resolvedAt && (!cur || a.resolvedAt <= cur.at)) items.push({ id: `alr-${a.id}`, at: a.resolvedAt.toISOString(), group: 'problems', title: `Cleared: ${a.title}`, tone: 'ok' });
    }
  })());

  await Promise.all(tasks);
  // Newest first; ties by id. A page continues strictly after its cursor.
  items.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  const after = cur ? items.filter(it => it.at < cur.atIso || (it.at === cur.atIso && it.id > cur.id)) : items;
  const page = after.slice(0, limit);
  return { items: page, next: after.length > limit ? feedCursor(page[page.length - 1]) : null };
}
