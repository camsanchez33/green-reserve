import { prisma } from '@/lib/prisma';

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

export const CURRENT_AGREEMENT_VERSION = '2026-07';
export const CURRENT_BOOKING_TERMS_VERSION = '2026-01';

export interface SettingsChangedPayload { changes: { field: string; from: unknown; to: unknown }[]; by: string }
export interface ReminderSentPayload { step: string }
export interface AgreementAcceptedPayload { version: string; acceptedBy: string }
export interface DocumentUploadedPayload { name: string; url: string; by: string }
export interface NoteAddedPayload { text: string; by: string }

export type TimelineEvent =
  | { type: 'settings_changed'; at: string; data: SettingsChangedPayload }
  | { type: 'reminder_sent'; at: string; data: ReminderSentPayload }
  | { type: 'reminders_paused'; at: string; data: { by: string } }
  | { type: 'reminders_resumed'; at: string; data: { by: string } }
  | { type: 'agreement_accepted'; at: string; data: AgreementAcceptedPayload }
  | { type: 'document_uploaded'; at: string; data: DocumentUploadedPayload }
  | { type: 'note_added'; at: string; data: NoteAddedPayload };

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

export async function logAgreementAccepted(courseId: string, acceptedBy: string): Promise<boolean> {
  return log(courseId, encode(AGREEMENT_ACCEPTED_PREFIX, { version: CURRENT_AGREEMENT_VERSION, acceptedBy } as AgreementAcceptedPayload), 'system');
}

export async function logDocumentUploaded(courseId: string, name: string, url: string, by: string): Promise<boolean> {
  return log(courseId, encode(DOCUMENT_UPLOADED_PREFIX, { name, url, by } as DocumentUploadedPayload), 'admin');
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
