// @brain outreach-data
// Inquiries data (Cam 2026-11-17): the database side of the outreach pipeline (lib/outreach.ts has the
// rules). Read by /api/admin/outreach/**; every function here is admin-only through those routes.
//
// Contacts: for a course still in outreach (status 'lead') the CourseContact rows are the truth, and the
// inquiry's own contactName/email/phone mirror the decision maker (or the first contact), because
// Onboarding, its emails and the Cal.com match read those columns. After Said yes the mirror stops and
// Onboarding's "Edit contact" owns them.
import { prisma } from './prisma';
import { REAL_COURSE } from './real-courses';
import { LEAD_STATUS, STATUS_LABEL } from './inquiry-status';
import { AGENDA, parseJson, easternToIso } from './inquiry-call';
import { parseCallAnswers, validateAnswers, summarize, NOTE_MAX, type CallAnswers } from './call-answers';
import { calcomUidOf, calcomManageLinks } from './calcom';
import {
  OUTREACH_STAGES, STAGE_LABEL, NOT_NOW_REASON, CALL_RESULTS, CALL_RESULT_LABEL, LIMITS, EMAIL_RE,
  outreachStage, outreachNext, lastTouchLabel, emailRows, courseKind, townLabel, findDuplicates, importRows, validateFacts, validateContact,
  type CourseFacts, type ContactInput, type DupCandidate, type DupMatch, type DupPoolRow, type CallResult, type OutreachStage,
} from './outreach';

export type Fail = { ok: false; status: number; error: string; [k: string]: unknown };
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Fail => ({ ok: false, status, error, ...extra });

const stamp = () => new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });

async function logEvent(inquiryId: string, fromStatus: string, toStatus: string, actorName: string) {
  await prisma.inquiryStatusEvent.create({ data: { inquiryId, fromStatus, toStatus, trigger: 'admin', actorName } });
}

/** Statuses a call can still decide on (before the setup sheet). */
const PRE_SHEET = [LEAD_STATUS, 'pending', 'in_review'];

// ─── Duplicates ──────────────────────────────────────────────────────────────

/** Every inquiry (any status: a closed one is still "on your list") and every real course. */
export async function duplicatePool(): Promise<DupPoolRow[]> {
  const [inqs, courses] = await Promise.all([
    prisma.courseInquiry.findMany({ select: { id: true, courseName: true, city: true, state: true, website: true, coursePhone: true, osmRef: true, status: true } }),
    prisma.course.findMany({ where: { ...REAL_COURSE }, select: { id: true, name: true, city: true, state: true, website: true, phone: true } }),
  ]);
  return [
    ...inqs.map(i => ({ ...i, kind: 'inquiry' as const, status: STATUS_LABEL[i.status] ?? i.status })),
    ...courses.map(c => ({ id: c.id, courseName: c.name, city: c.city, state: c.state, website: c.website, coursePhone: c.phone, kind: 'course' as const })),
  ];
}

export type DupFlags = { onList: DupMatch | null; onGreenReserve: DupMatch | null };
export function dupFlags(matches: DupMatch[]): DupFlags {
  return { onList: matches.find(m => m.kind === 'inquiry') ?? null, onGreenReserve: matches.find(m => m.kind === 'course') ?? null };
}

export async function checkDuplicates(c: DupCandidate, pool?: DupPoolRow[]): Promise<DupMatch[]> {
  return findDuplicates(c, pool ?? await duplicatePool());
}

// ─── Contacts ────────────────────────────────────────────────────────────────

const CONTACT_ORDER = [{ decisionMaker: 'desc' as const }, { sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

/** Copy the decision maker (or first contact) onto the inquiry while it is still in outreach. */
export async function syncPrimaryContact(inquiryId: string): Promise<void> {
  const inq = await prisma.courseInquiry.findUnique({ where: { id: inquiryId }, select: { status: true } });
  if (!inq || inq.status !== LEAD_STATUS) return;
  const first = await prisma.courseContact.findFirst({ where: { inquiryId }, orderBy: CONTACT_ORDER });
  const name = first?.name ?? '';
  const [firstName = '', ...rest] = name.split(/\s+/).filter(Boolean);
  await prisma.courseInquiry.updateMany({
    where: { id: inquiryId, status: LEAD_STATUS },
    data: { contactName: name, firstName, lastName: rest.join(' '), contactTitle: first?.role ?? '', email: first?.email ?? '', phone: first?.phone ?? '' },
  });
}

export async function addContact(inquiryId: string, input: Record<string, unknown>) {
  const inq = await prisma.courseInquiry.findUnique({ where: { id: inquiryId }, select: { id: true, contactName: true, contactTitle: true, email: true, phone: true, _count: { select: { contacts: true } } } });
  if (!inq) return fail(404, 'That course is not on the list any more.');
  if (inq._count.contacts >= 20) return fail(400, 'A course can have at most 20 contacts.');
  const v = validateContact(input);
  if ('error' in v) return fail(400, v.error);
  // A course added before contacts existed (or by "Add a lead") has its one contact only on the inquiry row
  // (shown on the course page with fromInquiry: true). Two cases:
  //  - replacesInquiryContact: the page is EDITING that contact. The new row replaces it, and the inquiry's own
  //    columns take the new values, so Said yes and Onboarding use the corrected email.
  //  - otherwise: it is a second person. The inquiry-row contact is kept as the first contact, in the same
  //    transaction, so the mirror never erases it.
  const replaces = input.replacesInquiryContact === true;
  const c = v.contact as ContactInput;
  const r = await prisma.$transaction(async tx => {
    // The row is read under the lock (status and contact columns too), and contacts are counted under it,
    // so two first saves at once cannot both seed and an Onboarding edit cannot slip in between.
    const rows = await tx.$queryRaw<{ status: string; contactName: string; contactTitle: string; email: string; phone: string }[]>`
      SELECT status, "contactName", "contactTitle", email, phone FROM "CourseInquiry" WHERE id = ${inquiryId} FOR UPDATE`;
    const row = rows[0];
    if (!row) return fail(404, 'That course is not on the list any more.');
    const count = await tx.courseContact.count({ where: { inquiryId } });
    if (replaces) {
      // Only on a course still in outreach (after Said yes, Onboarding's Edit contact owns these columns), and
      // only while the inquiry-row contact is still the only one — otherwise the page is out of date.
      if (row.status !== LEAD_STATUS) return fail(409, 'This course is on Onboarding now — change its contact there.');
      if (count > 0) return fail(409, 'This contact was already saved — reload the course.');
      const [firstName = '', ...rest] = c.name.split(/\s+/).filter(Boolean);
      await tx.courseInquiry.update({ where: { id: inquiryId }, data: { contactName: c.name, firstName, lastName: rest.join(' '), contactTitle: c.role, email: c.email, phone: c.phone } });
      await tx.inquiryStatusEvent.create({ data: { inquiryId, fromStatus: row.status, toStatus: row.status, trigger: 'admin', actorName: 'Contact corrected on the outreach page' } });
      return { contact: await tx.courseContact.create({ data: { inquiryId, ...c, sortOrder: 0 } }), replaced: true };
    }
    const seedName = row.contactName.trim() || row.email.trim() || row.phone.trim();
    const seed = count === 0 && !!seedName;
    if (seed) await tx.courseContact.create({ data: { inquiryId, name: seedName, role: row.contactTitle, email: row.email, phone: row.phone, sortOrder: 0 } });
    return { contact: await tx.courseContact.create({ data: { inquiryId, ...c, sortOrder: count + (seed ? 1 : 0) } }), replaced: false };
  });
  if ('ok' in r) return r;
  await syncPrimaryContact(inquiryId);
  return { ok: true as const, contact: r.contact, replaced: r.replaced };
}

export async function updateContact(inquiryId: string, contactId: string, input: Record<string, unknown>) {
  const before = await prisma.courseContact.findFirst({ where: { id: contactId, inquiryId } });
  if (!before) return fail(404, 'That contact is not on this course.');
  const v = validateContact(input, true);
  if ('error' in v) return fail(400, v.error);
  const contact = await prisma.courseContact.update({ where: { id: contactId }, data: v.contact });
  await syncPrimaryContact(inquiryId);
  return { ok: true as const, contact, before };
}

export async function deleteContact(inquiryId: string, contactId: string) {
  const { count } = await prisma.courseContact.deleteMany({ where: { id: contactId, inquiryId } });
  if (!count) return fail(404, 'That contact is not on this course.');
  await syncPrimaryContact(inquiryId);
  return { ok: true as const };
}

// ─── Adding courses ──────────────────────────────────────────────────────────

type NewCourse = { facts: CourseFacts; contact: Partial<ContactInput> | null; notes: string; source: string };

function leadData(n: NewCourse) {
  const c = n.contact;
  const name = c?.name ?? '';
  const [firstName = '', ...rest] = name.split(/\s+/).filter(Boolean);
  const f = n.facts;
  return {
    status: LEAD_STATUS, source: n.source,
    courseName: f.courseName!, city: f.city ?? '', state: f.state ?? '', address: f.address ?? '', zipCode: f.zipCode ?? '',
    website: f.website ?? '', courseType: '', lookingFor: [] as string[],
    currentBookingMethod: f.currentBookingMethod ?? '', greenFeeRange: f.greenFeeRange ?? '', hasResidentPricing: f.hasResidentPricing ?? false,
    coursePhone: f.coursePhone ?? null, holes: f.holes ?? null, ownerType: f.ownerType ?? null, currentSoftware: f.currentSoftware ?? null,
    softwareContractEnds: f.softwareContractEnds ?? null, roundsPerYear: f.roundsPerYear ?? null, hasProShop: f.hasProShop ?? null,
    hasRange: f.hasRange ?? null, season: f.season ?? null, fitTags: f.fitTags ?? [], latitude: f.latitude ?? null, longitude: f.longitude ?? null,
    osmRef: f.osmRef ?? null,
    contactName: name, firstName, lastName: rest.join(' '), contactTitle: c?.role ?? '', email: c?.email ?? '', phone: c?.phone ?? '',
    adminNotes: n.notes ? `[${stamp()}]\n${n.notes}` : '',
  };
}

async function createLead(n: NewCourse, adminName: string, how: string) {
  return prisma.courseInquiry.create({
    data: {
      ...leadData(n),
      ...(n.contact ? { contacts: { create: [{ ...(n.contact as ContactInput), sortOrder: 0 }] } } : {}),
      events: { create: [{ fromStatus: LEAD_STATUS, toStatus: LEAD_STATUS, trigger: 'admin', actorName: `${how} by ${adminName}` }] },
    },
    select: { id: true, courseName: true },
  });
}

const SOURCES_FOR_ADD = ['Cold outreach', 'Referral', 'Event or conference', 'Partner', 'Other'];

/** "Add to Targets". Name and town are required; a likely duplicate is refused (409) unless confirmDuplicate. */
export async function addCourse(body: Record<string, unknown>, adminName: string) {
  const v = validateFacts((body.facts ?? body) as Record<string, unknown>, { requireNameAndTown: true });
  if ('error' in v) return fail(400, v.error);
  let contact: Partial<ContactInput> | null = null;
  const rawContact = body.contact as Record<string, unknown> | undefined;
  if (rawContact && Object.values(rawContact).some(x => typeof x === 'string' ? x.trim() : x === true)) {
    const cv = validateContact(rawContact);
    if ('error' in cv) return fail(400, cv.error);
    contact = cv.contact;
  }
  const source = String(body.source ?? '').trim() || 'Cold outreach';
  if (!SOURCES_FOR_ADD.includes(source)) return fail(400, `Unknown source "${source}".`);
  const notes = String(body.notes ?? '').trim().slice(0, LIMITS.note);
  const dups = await checkDuplicates(v.facts as DupCandidate);
  if (dups.length && body.confirmDuplicate !== true) {
    return fail(409, 'This looks like a course already on your list or on GreenReserve.', { code: 'duplicate', duplicates: dups });
  }
  const lead = await createLead({ facts: v.facts, contact, notes, source }, adminName, 'Added to Targets');
  return { ok: true as const, id: lead.id, duplicates: dups };
}

export type ImportPreviewRow = { row: number; courseName: string; town: string; check: 'new' | 'duplicate' | 'invalid'; why: string };

export async function importPreview(text: string) {
  const parsed = importRows(text);
  if (parsed.error) return { ok: false as const, status: 400, error: parsed.error, rows: [] as ImportPreviewRow[] };
  const pool = await duplicatePool();
  const seen: DupPoolRow[] = [];
  const rows: (ImportPreviewRow & { data?: (typeof parsed.rows)[number] })[] = parsed.rows.map(r => {
    const base = { row: r.row, courseName: r.facts.courseName ?? '', town: townLabel(r.facts.city, r.facts.state) };
    if (r.error) return { ...base, check: 'invalid' as const, why: r.error };
    const onList = findDuplicates(r.facts as DupCandidate, pool)[0];
    if (onList) return { ...base, check: 'duplicate' as const, why: onList.kind === 'course' ? `Already on GreenReserve (${onList.why})` : `Already on your list, skipped (${onList.why})` };
    const inFile = findDuplicates(r.facts as DupCandidate, seen)[0];
    if (inFile) return { ...base, check: 'duplicate' as const, why: `Same course as row ${inFile.id}` };
    seen.push({ ...(r.facts as DupCandidate), id: String(r.row), kind: 'inquiry' });
    return { ...base, check: 'new' as const, why: '', data: r };
  });
  return { ok: true as const, rows };
}

/** Re-checks everything server-side (never trusts the preview) and adds only the new rows. */
export async function importCommit(text: string, adminName: string) {
  const p = await importPreview(text);
  if (!p.ok) return fail(p.status, p.error);
  const created: string[] = [];
  for (const r of p.rows) {
    if (r.check !== 'new' || !r.data) continue;
    const lead = await createLead({ facts: r.data.facts, contact: r.data.contact, notes: r.data.notes, source: 'Cold outreach' }, adminName, 'Imported to Targets');
    created.push(lead.id);
  }
  return { ok: true as const, added: created.length, skipped: p.rows.length - created.length, ids: created, rows: p.rows.map(({ data: _d, ...rest }) => rest) };
}

// ─── Editing facts ───────────────────────────────────────────────────────────

const FACT_SELECT = {
  courseName: true, city: true, state: true, address: true, zipCode: true, website: true, coursePhone: true, holes: true, ownerType: true,
  currentBookingMethod: true, currentSoftware: true, softwareContractEnds: true, greenFeeRange: true, roundsPerYear: true,
  hasResidentPricing: true, hasProShop: true, hasRange: true, season: true, fitTags: true, latitude: true, longitude: true, osmRef: true,
} as const;

export async function updateFacts(inquiryId: string, input: Record<string, unknown>) {
  const before = await prisma.courseInquiry.findUnique({ where: { id: inquiryId }, select: { ...FACT_SELECT, status: true } });
  if (!before) return fail(404, 'That course is not on the list any more.');
  const v = validateFacts(input);
  if ('error' in v) return fail(400, v.error);
  if (!Object.keys(v.facts).length) return fail(400, 'Nothing to change.');
  const after = await prisma.courseInquiry.update({ where: { id: inquiryId }, data: v.facts, select: FACT_SELECT });
  const changed = Object.keys(v.facts) as (keyof typeof FACT_SELECT)[];
  const pick = (o: Record<string, unknown>) => Object.fromEntries(changed.map(k => [k, o[k]]));
  await logEvent(inquiryId, before.status, before.status, `Course facts edited (${changed.join(', ')})`);
  return { ok: true as const, facts: after, before: pick(before), after: pick(after) };
}

// ─── Said yes / Not now ──────────────────────────────────────────────────────

/** Hands the course to Onboarding: lead → in_review (the existing Move to Talking). Needs an email. */
export async function saidYes(inquiryId: string, adminName: string, givenEmail?: unknown) {
  const inq = await prisma.courseInquiry.findUnique({ where: { id: inquiryId }, select: { status: true, email: true } });
  if (!inq) return fail(404, 'That course is not on the list any more.');
  if (inq.status !== LEAD_STATUS) return fail(409, 'This course is already past outreach — it is on Onboarding.');
  const given = String(givenEmail ?? '').trim().toLowerCase();
  if (given && !EMAIL_RE.test(given)) return fail(400, 'That email doesn’t look right.');
  const withEmail = await prisma.courseContact.findFirst({ where: { inquiryId, email: { not: '' } }, orderBy: CONTACT_ORDER, select: { name: true, role: true, email: true, phone: true } });
  const email = given || inq.email || withEmail?.email || '';
  if (!email) return fail(400, 'Add their email first — Onboarding emails them the setup sheet.', { code: 'email_needed' });
  // When the email comes from a contact other than the mirrored one, Onboarding gets that person whole —
  // never one person's name with another's address.
  const person = !given && !inq.email && withEmail ? (() => {
    const [firstName = '', ...rest] = withEmail.name.split(/\s+/).filter(Boolean);
    return { contactName: withEmail.name, firstName, lastName: rest.join(' '), contactTitle: withEmail.role, phone: withEmail.phone };
  })() : {};
  // The move and its event are one write: Restore and "said yes this month" both read the event.
  const moved = await prisma.$transaction(async tx => {
    const m = await tx.courseInquiry.updateMany({ where: { id: inquiryId, status: LEAD_STATUS }, data: { status: 'in_review', email, snoozeUntil: null, ...person } });
    if (m.count) await tx.inquiryStatusEvent.create({ data: { inquiryId, fromStatus: LEAD_STATUS, toStatus: 'in_review', trigger: 'admin', actorName: `Said yes → Onboarding — by ${adminName}` } });
    return m;
  });
  if (!moved.count) return fail(409, 'It was already moved — refresh.');
  return { ok: true as const, status: 'in_review' };
}

/** "Not now": closed with the reason Not now and an optional recheck date (at most two years out). Restore brings it back. */
export async function notNow(inquiryId: string, adminName: string, recheckRaw?: unknown, noteRaw?: unknown) {
  const inq = await prisma.courseInquiry.findUnique({ where: { id: inquiryId }, select: { status: true, adminNotes: true } });
  if (!inq) return fail(404, 'That course is not on the list any more.');
  if (!PRE_SHEET.includes(inq.status)) return fail(409, 'Only a course that has not had the setup sheet can be set to Not now.');
  let recheck: Date | null = null;
  if (recheckRaw != null && recheckRaw !== '') {
    recheck = new Date(String(recheckRaw));
    if (Number.isNaN(recheck.getTime()) || recheck.getTime() <= Date.now() || recheck.getTime() > Date.now() + 731 * 86_400_000) {
      return fail(400, 'Pick a recheck date in the next two years.');
    }
  }
  const note = String(noteRaw ?? '').trim().slice(0, LIMITS.note);
  const notes = note ? (inq.adminNotes?.trim() ? `${inq.adminNotes.trim()}\n\n[${stamp()}]\n${note}` : `[${stamp()}]\n${note}`) : inq.adminNotes;
  // One write with its event: Restore reads the event to know it was a lead.
  const moved = await prisma.$transaction(async tx => {
    const m = await tx.courseInquiry.updateMany({
      where: { id: inquiryId, status: inq.status },
      data: { status: 'rejected', closedReason: NOT_NOW_REASON, snoozeUntil: null, nextFollowUpAt: recheck, adminNotes: notes },
    });
    // Same "<admin> — <reason>" shape as Reject, so the Closed tab reads it the same way.
    if (m.count) await tx.inquiryStatusEvent.create({ data: { inquiryId, fromStatus: inq.status, toStatus: 'rejected', trigger: 'admin', actorName: `${adminName} — ${NOT_NOW_REASON}${recheck ? ` (recheck ${fmtDate(recheck)})` : ''}` } });
    return m;
  });
  if (!moved.count) return fail(409, 'It changed while you were looking — refresh.');
  return { ok: true as const, status: 'rejected', recheckAt: recheck?.toISOString() ?? null };
}

/** Undo a mis-logged touch ("Email 1 sent" by mistake). Only a touch on this course. */
export async function deleteTouch(inquiryId: string, touchId: string, adminName: string) {
  const touch = await prisma.outreachTouch.findFirst({ where: { id: touchId, inquiryId }, select: { id: true, at: true, channel: true, direction: true, note: true, adminName: true, inquiry: { select: { status: true } } } });
  if (!touch) return fail(404, 'That contact is not logged on this course.');
  const gone = await prisma.$transaction(async tx => {
    // deleteMany + count: a second delete of the same touch at once gets a 404, not a 500, and writes no event.
    const d = await tx.outreachTouch.deleteMany({ where: { id: touch.id, inquiryId } });
    if (d.count) await tx.inquiryStatusEvent.create({ data: { inquiryId, fromStatus: touch.inquiry.status, toStatus: touch.inquiry.status, trigger: 'admin', actorName: `Removed a logged ${touch.channel.replace('_', ' ')} (${touch.direction === 'in' ? 'from them' : 'from us'}, ${fmtDate(touch.at)}) — by ${adminName}` } });
    return d.count;
  });
  if (!gone) return fail(404, 'That contact is not logged on this course.');
  // Everything the row held goes to the audit log, since the row itself is gone.
  return { ok: true as const, before: { at: touch.at.toISOString(), channel: touch.channel, direction: touch.direction, note: touch.note, loggedBy: touch.adminName } };
}

// ─── The Outreach tab ────────────────────────────────────────────────────────

const easternMonthStart = (now: Date) => {
  const ym = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).slice(0, 7);
  return new Date(easternToIso(`${ym}-01`, '00:00') ?? `${ym}-01T05:00:00Z`);
};

export type OutreachRow = {
  id: string; courseName: string; town: string; kind: string; stage: OutreachStage; last: string;
  next: ReturnType<typeof outreachNext>; snoozedUntil: string | null; source: string | null; booksToday: string;
};

export async function listOutreach(now: Date = new Date()) {
  const [leads, saidYesThisMonth, notNowRows] = await Promise.all([
    prisma.courseInquiry.findMany({
      where: { status: LEAD_STATUS },
      select: {
        id: true, courseName: true, city: true, state: true, ownerType: true, holes: true, source: true, currentBookingMethod: true,
        snoozeUntil: true, nextFollowUpAt: true,
        touches: { select: { at: true, channel: true, direction: true } },
        calls: { where: { kind: 'discovery' }, select: { scheduledAt: true, outcome: true, createdAt: true, completedAt: true } },
      },
    }),
    prisma.inquiryStatusEvent.count({ where: { fromStatus: LEAD_STATUS, toStatus: 'in_review', createdAt: { gte: easternMonthStart(now) } } }),
    prisma.courseInquiry.findMany({
      where: { status: 'rejected', closedReason: NOT_NOW_REASON },
      select: { id: true, courseName: true, city: true, state: true, nextFollowUpAt: true },
      orderBy: { nextFollowUpAt: { sort: 'asc', nulls: 'last' } },
    }),
  ]);
  const rows: OutreachRow[] = leads.map(l => {
    const input = { touches: l.touches, calls: l.calls, snoozeUntil: l.snoozeUntil, nextFollowUpAt: l.nextFollowUpAt };
    return {
      id: l.id, courseName: l.courseName, town: townLabel(l.city, l.state), kind: courseKind(l.ownerType, l.holes),
      stage: outreachStage(input, now), last: lastTouchLabel(input), next: outreachNext(input, now),
      snoozedUntil: l.snoozeUntil && l.snoozeUntil.getTime() > now.getTime() ? l.snoozeUntil.toISOString() : null,
      source: l.source, booksToday: l.currentBookingMethod,
    };
  });
  const byDue = (a: OutreachRow, b: OutreachRow) => (Number(b.next.due) - Number(a.next.due)) || a.next.dueAt.localeCompare(b.next.dueAt) || a.courseName.localeCompare(b.courseName);
  return {
    stages: OUTREACH_STAGES.map(s => ({ ...s, rows: rows.filter(r => r.stage === s.key).sort(byDue) })),
    dueToday: rows.filter(r => r.next.due).length,
    saidYesThisMonth,
    notNow: notNowRows.map(r => ({ id: r.id, courseName: r.courseName, town: townLabel(r.city, r.state), recheckAt: r.nextFollowUpAt?.toISOString() ?? null })),
  };
}

// ─── One course ──────────────────────────────────────────────────────────────

export type Viewer = { canSeeContactDetails: boolean };
const hideContact = <T extends { email: string; phone: string }>(c: T, v: Viewer): T => v.canSeeContactDetails ? c : { ...c, email: '', phone: '' };

export async function outreachCourse(inquiryId: string, viewer: Viewer, now: Date = new Date()) {
  const inq = await prisma.courseInquiry.findUnique({
    where: { id: inquiryId },
    select: {
      id: true, status: true, closedReason: true, source: true, createdAt: true, snoozeUntil: true, nextFollowUpAt: true, adminNotes: true,
      contactName: true, contactTitle: true, email: true, phone: true,
      ...FACT_SELECT,
      contacts: { orderBy: CONTACT_ORDER },
      touches: { orderBy: { at: 'desc' } },
      calls: { where: { kind: 'discovery' }, orderBy: { scheduledAt: 'desc' }, select: { id: true, scheduledAt: true, outcome: true, result: true, nextStep: true, createdAt: true, completedAt: true, durationMin: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 50, select: { fromStatus: true, toStatus: true, actorName: true, createdAt: true } },
    },
  });
  if (!inq) return null;
  const input = { touches: inq.touches, calls: inq.calls, snoozeUntil: inq.snoozeUntil, nextFollowUpAt: inq.nextFollowUpAt };
  const next = outreachNext(input, now);
  // A lead added before contacts existed keeps its one contact on the inquiry row: show it, marked, so
  // editing it adds a real contact (which then replaces the mirror).
  const contacts = inq.contacts.length
    ? inq.contacts.map(c => hideContact(c, viewer))
    : (inq.contactName || inq.email || inq.phone)
      ? [hideContact({ id: null, fromInquiry: true, name: inq.contactName || inq.email, role: inq.contactTitle, email: inq.email, phone: inq.phone, decisionMaker: false, preferredChannel: '', bestTime: '' }, viewer)]
      : [];
  const { contacts: _c, touches, calls, events, contactName: _n, contactTitle: _t, email: _e, phone: _p, adminNotes, ...rest } = inq;
  return {
    ...rest,
    inOutreach: inq.status === LEAD_STATUS,
    statusLabel: inq.status === LEAD_STATUS ? STAGE_LABEL[outreachStage(input, now)] : inq.closedReason === NOT_NOW_REASON ? NOT_NOW_REASON : (STATUS_LABEL[inq.status] ?? inq.status),
    stage: inq.status === LEAD_STATUS ? outreachStage(input, now) : null,
    kind: courseKind(inq.ownerType, inq.holes), town: townLabel(inq.city, inq.state),
    next: inq.status === LEAD_STATUS ? next : null,
    last: lastTouchLabel(input),
    emails: emailRows(touches, next),
    contacts,
    // Notes can hold names and numbers: support+ only, as on Onboarding.
    touches: touches.map(x => ({ id: x.id, at: x.at, channel: x.channel, direction: x.direction, note: viewer.canSeeContactDetails ? x.note : null, adminName: x.adminName })),
    calls: calls.map(c => ({ ...c, nextStep: viewer.canSeeContactDetails ? c.nextStep : null, resultLabel: c.result ? CALL_RESULT_LABEL[c.result as CallResult] ?? c.result : null })),
    events,
    notes: viewer.canSeeContactDetails ? adminNotes : null,
  };
}

// ─── Calls ───────────────────────────────────────────────────────────────────

const HALF_DAY = 12 * 3600_000;
const CALL_INQ_SELECT = {
  id: true, courseName: true, city: true, state: true, status: true, ownerType: true, holes: true, currentBookingMethod: true,
  contactName: true, contactTitle: true, email: true, phone: true, snoozeUntil: true, nextFollowUpAt: true,
  contacts: { orderBy: CONTACT_ORDER, select: { name: true, role: true, email: true, phone: true, decisionMaker: true } },
  touches: { select: { at: true, channel: true, direction: true } },
} as const;

function stageOf(inq: { status: string; touches: { at: Date; channel: string; direction: string }[] }, calls: { scheduledAt: Date; outcome: string; createdAt?: Date; completedAt?: Date | null }[], now: Date): string {
  if (inq.status === LEAD_STATUS) return STAGE_LABEL[outreachStage({ touches: inq.touches, calls }, now)];
  return STATUS_LABEL[inq.status] ?? inq.status;
}

type CallInq = { contactName: string; contactTitle: string; email: string; phone: string; contacts: { name: string; role: string; email: string; phone: string; decisionMaker: boolean }[] };
function whoOf(call: { attendeeName: string | null; attendeeEmail: string | null }, inq: CallInq) {
  const byEmail = call.attendeeEmail ? inq.contacts.find(c => c.email && c.email.toLowerCase() === call.attendeeEmail!.toLowerCase()) : null;
  const dm = inq.contacts.find(c => c.decisionMaker) ?? inq.contacts[0] ?? null;
  const c = byEmail ?? (call.attendeeName ? null : dm);
  return {
    name: call.attendeeName || c?.name || inq.contactName || '',
    role: c?.role ?? (call.attendeeName ? '' : inq.contactTitle),
    email: call.attendeeEmail || c?.email || inq.email || '',
    phone: c?.phone || inq.phone || '',
    decides: !!c?.decisionMaker,
  };
}

/** The Calls tab: every discovery call, upcoming (incl. unlogged from the last 12 h, and older unlogged ones flagged) and past. */
export async function listCalls(viewer: Viewer, now: Date = new Date()) {
  const calls = await prisma.call.findMany({
    where: { kind: 'discovery', inquiryId: { not: null } },
    orderBy: { scheduledAt: 'desc' },
    take: 300,
    select: {
      id: true, scheduledAt: true, durationMin: true, direction: true, outcome: true, result: true, nextStep: true, agendaJson: true,
      answersJson: true, attendeeName: true, attendeeEmail: true, bookedByCourse: true, createdAt: true, completedAt: true, followUpAt: true,
      inquiry: { select: { ...CALL_INQ_SELECT, calls: { where: { kind: 'discovery' }, select: { scheduledAt: true, outcome: true, createdAt: true, completedAt: true } } } },
    },
  });
  const rows = calls.filter(c => c.inquiry).map(c => {
    const inq = c.inquiry!;
    const who = whoOf(c, inq);
    const agenda = parseJson<string[]>(c.agendaJson, []);
    const scheduled = c.outcome === 'scheduled';
    return {
      id: c.id, inquiryId: inq.id, courseName: inq.courseName, town: townLabel(inq.city, inq.state),
      scheduledAt: c.scheduledAt.toISOString(), durationMin: c.durationMin, direction: c.direction, bookedByCourse: c.bookedByCourse,
      who: viewer.canSeeContactDetails ? who : { ...who, email: '', phone: '' },
      stage: stageOf(inq, inq.calls, now),
      prepReady: agenda.length > 0,
      notLogged: scheduled && c.scheduledAt.getTime() < now.getTime() - HALF_DAY,
      outcome: c.outcome,
      result: c.result,
      resultLabel: c.result ? CALL_RESULT_LABEL[c.result as CallResult] ?? c.result : c.outcome === 'cancelled' ? 'Cancelled' : c.outcome === 'no_answer' ? 'No answer' : c.outcome === 'talked' ? 'Talked' : c.outcome === 'not_a_fit' ? 'Not a fit' : null,
      nextStep: viewer.canSeeContactDetails ? c.nextStep : null, followUpAt: c.followUpAt?.toISOString() ?? null,
    };
  });
  const upcoming = rows.filter(r => r.outcome === 'scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const past = rows.filter(r => r.outcome !== 'scheduled');
  return { upcoming, past };
}

export async function callDetail(callId: string, viewer: Viewer, now: Date = new Date()) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: {
      inquiry: { select: { ...CALL_INQ_SELECT, detailsJson: true, needsJson: true, greenFeeRange: true, teeTimesPerDay: true, hasResidentPricing: true, hasMemberPricing: true, hasCaddies: true, callSkippedReason: true, calls: { where: { kind: 'discovery' }, select: { scheduledAt: true, outcome: true, createdAt: true, completedAt: true } } } },
    },
  });
  if (!call || call.kind !== 'discovery' || !call.inquiry) return null;
  const inq = call.inquiry;
  const sheet = parseJson<Record<string, unknown> | null>(inq.detailsJson, null);
  const needs = parseJson<Record<string, unknown> | null>(inq.needsJson, null);
  const answers = parseCallAnswers(call.answersJson);
  const onAgenda = new Set(parseJson<string[]>(call.agendaJson, []));
  const uid = calcomUidOf(call.createdBy);
  const links = uid ? calcomManageLinks(uid) : null;
  const who = whoOf(call, inq);
  const scrub = <T extends { email: string; phone: string }>(x: T) => viewer.canSeeContactDetails ? x : { ...x, email: '', phone: '' };
  // Viewers read the prep card only: no notes (they can hold names and numbers) and no Join or
  // reschedule/cancel links (those act on the booking).
  const full = viewer.canSeeContactDetails;
  const lastTouch = lastTouchLabel({ touches: inq.touches, calls: inq.calls });
  return {
    id: call.id, inquiryId: inq.id, courseName: inq.courseName, town: townLabel(inq.city, inq.state), kind: courseKind(inq.ownerType, inq.holes),
    scheduledAt: call.scheduledAt.toISOString(), durationMin: call.durationMin, direction: call.direction, phone: viewer.canSeeContactDetails ? call.phone : '',
    outcome: call.outcome, result: call.result, resultLabel: call.result ? CALL_RESULT_LABEL[call.result as CallResult] ?? call.result : null,
    nextStep: full ? call.nextStep : null, followUpAt: call.followUpAt?.toISOString() ?? null, notes: full ? call.notes : null,
    upcoming: call.outcome === 'scheduled', notLogged: call.outcome === 'scheduled' && call.scheduledAt.getTime() < now.getTime() - HALF_DAY,
    stage: stageOf(inq, inq.calls, now), inquiryStatus: inq.status,
    bookedByCourse: call.bookedByCourse, joinUrl: full ? call.meetingUrl : null, calcom: full ? links : null,
    who: scrub(who),
    contacts: inq.contacts.map(scrub),
    facts: { kind: courseKind(inq.ownerType, inq.holes), booksToday: inq.currentBookingMethod, town: townLabel(inq.city, inq.state), lastTouch },
    agenda: AGENDA.map(a => ({
      key: a.key, label: a.label, short: a.short,
      onAgenda: onAgenda.has(a.key),
      known: a.answered(inq, sheet, needs),
      captured: full ? (summarize(a.key, answers.items[a.key]) || null) : null,
      note: full ? (answers.items[a.key]?.note ?? '') : '',
    })),
    agendaExtra: full ? call.agendaExtra : '',
  };
}

/** Merge per-agenda-item notes into the call's structured answers (fields captured elsewhere are kept). */
function mergeNotes(existing: CallAnswers, agendaNotes: unknown): CallAnswers | string {
  if (agendaNotes == null) return existing;
  if (typeof agendaNotes !== 'object' || Array.isArray(agendaNotes)) return 'Agenda notes must be one note per agenda item.';
  const keys = new Set(AGENDA.map(a => a.key));
  const items = { ...existing.items };
  for (const [k, v] of Object.entries(agendaNotes as Record<string, unknown>)) {
    if (!keys.has(k)) return `Unknown agenda item "${k}".`;
    if (typeof v !== 'string') return 'Each agenda note is text.';
    if (v.length > NOTE_MAX) return `Keep each note under ${NOTE_MAX.toLocaleString()} characters.`;
    items[k] = { fields: existing.items[k]?.fields ?? {}, note: v };
  }
  return validateAnswers({ v: 2, items });
}

export async function saveCallNotes(callId: string, body: Record<string, unknown>) {
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 8000) : undefined;
  // Read, merge and write under a row lock: two autosaves (or an autosave and the log) each keep the other's
  // notes. Notes can be added after the call is logged too (what was said is written up afterwards).
  const r = await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string; kind: string; inquiryId: string | null; answersJson: string }[]>`
      SELECT id, kind, "inquiryId", "answersJson" FROM "Call" WHERE id = ${callId} FOR UPDATE`;
    const call = rows[0];
    if (!call || call.kind !== 'discovery' || !call.inquiryId) return fail(404, 'That call is not on the list.');
    const merged = mergeNotes(parseCallAnswers(call.answersJson), body.agendaNotes);
    if (typeof merged === 'string') return fail(400, merged);
    await tx.call.update({ where: { id: call.id }, data: { answersJson: JSON.stringify(merged), ...(notes !== undefined ? { notes } : {}) } });
    return null;
  });
  if (r) return r;
  return { ok: true as const, savedAt: new Date().toISOString() };
}

/**
 * Log how a call went. said_yes hands the course to Onboarding (when it is still in outreach), not_now closes it
 * with a recheck date, follow_up sets the follow-up date, no_answer only logs. A call is logged once.
 */
export async function logOutreachCall(callId: string, body: Record<string, unknown>, adminName: string) {
  const call = await prisma.call.findUnique({ where: { id: callId }, select: { id: true, kind: true, inquiryId: true, outcome: true, answersJson: true, scheduledAt: true, inquiry: { select: { status: true } } } });
  if (!call || call.kind !== 'discovery' || !call.inquiryId || !call.inquiry) return fail(404, 'That call is not on the list.');
  if (call.outcome !== 'scheduled') return fail(409, 'This call is already logged.');
  if (call.scheduledAt.getTime() > Date.now() + 15 * 60_000) return fail(400, 'This call has not happened yet.');
  const result = String(body.result ?? '') as CallResult;
  if (!(CALL_RESULTS as readonly string[]).includes(result)) return fail(400, `How it went must be one of: ${CALL_RESULTS.join(', ')}.`);
  const nextStep = typeof body.nextStep === 'string' ? body.nextStep.replace(/\s+/g, ' ').trim().slice(0, LIMITS.nextStep) : '';
  let followUpAt: Date | null = null;
  if (body.followUpAt != null && body.followUpAt !== '') {
    followUpAt = new Date(String(body.followUpAt));
    if (Number.isNaN(followUpAt.getTime()) || followUpAt.getTime() < Date.now() - 86_400_000 || followUpAt.getTime() > Date.now() + 731 * 86_400_000) {
      return fail(400, 'Pick a follow-up date in the next two years.');
    }
  }
  if (result === 'follow_up' && !followUpAt) return fail(400, 'Pick the date to follow up.');
  const merged = mergeNotes(parseCallAnswers(call.answersJson), body.agendaNotes);
  if (typeof merged === 'string') return fail(400, merged);
  const status = call.inquiry.status;
  if (result === 'not_now' && !PRE_SHEET.includes(status)) return fail(409, 'This course is already in setup — close it from Onboarding instead.');
  // The recheck date is checked before anything is written, so a bad date does not leave a half-done log.
  const recheckRaw = body.recheckAt ?? (followUpAt && followUpAt.getTime() > Date.now() ? followUpAt.toISOString() : null);
  if (result === 'not_now' && recheckRaw != null && recheckRaw !== '') {
    const d = new Date(String(recheckRaw));
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now() || d.getTime() > Date.now() + 731 * 86_400_000) return fail(400, 'Pick a recheck date in the next two years.');
  }
  if (result === 'said_yes' && status === LEAD_STATUS) {
    // Checked before the call is logged, so a missing email does not leave a half-done log.
    const inq = await prisma.courseInquiry.findUnique({ where: { id: call.inquiryId }, select: { email: true } });
    const given = String(body.email ?? '').trim().toLowerCase();
    if (given && !EMAIL_RE.test(given)) return fail(400, 'That email doesn’t look right.');
    const dm = await prisma.courseContact.findFirst({ where: { inquiryId: call.inquiryId, email: { not: '' } }, select: { id: true } });
    if (!given && !inq?.email && !dm) return fail(400, 'Add their email first — Onboarding emails them the setup sheet.', { code: 'email_needed' });
  }
  // Under the same row lock as saveCallNotes, re-reading the answers, so a note autosaved a moment ago is kept.
  const count = await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ answersJson: string }[]>`SELECT "answersJson" FROM "Call" WHERE id = ${call.id} FOR UPDATE`;
    const fresh = mergeNotes(parseCallAnswers(rows[0]?.answersJson), body.agendaNotes);
    const answers = typeof fresh === 'string' ? merged : fresh;
    const u = await tx.call.updateMany({
      where: { id: call.id, outcome: 'scheduled' },
      data: {
        outcome: result === 'no_answer' ? 'no_answer' : 'talked', result, nextStep: nextStep || null, followUpAt,
        completedAt: new Date(), answersJson: JSON.stringify(answers),
        ...(typeof body.notes === 'string' ? { notes: body.notes.slice(0, 8000) } : {}),
      },
    });
    return u.count;
  });
  if (!count) return fail(409, 'This call was logged while you were typing — reload to see it.');
  // The next step stays on the call row (support+); the timeline, which viewers read, only says how it went.
  await logEvent(call.inquiryId, status, status, `Call logged — ${CALL_RESULT_LABEL[result]} — by ${adminName}`);
  let handoff: { ok: boolean; error?: string } | null = null;
  if (result === 'said_yes' && status === LEAD_STATUS) {
    const r = await saidYes(call.inquiryId, adminName, body.email);
    handoff = r.ok ? { ok: true } : { ok: false, error: r.error };
  } else if (result === 'not_now') {
    const r = await notNow(call.inquiryId, adminName, recheckRaw);
    handoff = r.ok ? { ok: true } : { ok: false, error: r.error };
  } else if (followUpAt && (result === 'follow_up' || result === 'no_answer')) {
    await prisma.courseInquiry.update({ where: { id: call.inquiryId }, data: { nextFollowUpAt: followUpAt } });
  }
  return { ok: true as const, result, handoff };
}

