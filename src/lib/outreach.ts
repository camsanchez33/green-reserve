// @brain outreach
// Inquiries data (Cam 2026-11-17, lanes/admin.md "Inquiries"): the INTERNAL outreach pipeline — courses we
// contact, from Target to Said yes. Client-safe: no database, no server imports.
//
// A course in outreach is a CourseInquiry with status 'lead' (AW-6c). Its stage is DERIVED from what is
// on record (touches and calls), never stored, so it cannot drift from the log:
//   target     nothing logged yet
//   contacted  we emailed, called, texted or visited (an 'out' touch), or a call was logged
//   replied    they wrote or called back (an 'in' touch)
//   call       a discovery call is on the calendar (or went off and is not logged yet)
// "Said yes" is the existing Move to Talking (lead → in_review): the course is Onboarding's from then on.
// "Not now" closes it with the closed reason NOT_NOW_REASON and an optional recheck date; Restore brings it back.
import { nextCall, overdueCall, type CallLike } from './inquiry-call';

export type OutreachStage = 'target' | 'contacted' | 'replied' | 'call';

export const OUTREACH_STAGES: { key: OutreachStage; label: string; hint: string }[] = [
  { key: 'target', label: 'Targets', hint: 'On the list, not contacted yet' },
  { key: 'contacted', label: 'Contacted', hint: 'Email or call sent, no answer yet' },
  { key: 'replied', label: 'Replied', hint: 'They wrote or called back' },
  { key: 'call', label: 'Call booked', hint: 'A call is on the calendar' },
];
export const STAGE_LABEL: Record<OutreachStage, string> = Object.fromEntries(OUTREACH_STAGES.map(s => [s.key, s.label])) as Record<OutreachStage, string>;

/** The closed reason "Not now" writes (also in inquiry-status CLOSED_REASONS). */
export const NOT_NOW_REASON = 'Not now';

/** company/outreach/plan.md: emails start Dec 1 (Cam 2026-11-16). Midnight Eastern. Email 1 is never due before it. */
export const OUTREACH_START = new Date('2026-12-01T05:00:00Z');

/** company/outreach/plan.md "Follow-up timing": days after Email 1. */
export const CADENCE_DAYS = { call: 1, email2: 4, email3: 11, stop: 14 } as const;

export const OWNER_TYPES = [
  { key: 'town', label: 'Town or village', kind: 'Town course' },
  { key: 'county', label: 'County', kind: 'County course' },
  { key: 'independent', label: 'Independent', kind: 'Independent' },
  { key: 'group', label: 'Group or company', kind: 'Group course' },
] as const;
export type OwnerType = typeof OWNER_TYPES[number]['key'];

/** Suggestions for "Books today by"; the column is free text (the public form fills it too). */
export const BOOKING_METHODS = ['Phone only', 'Marketplace (GolfNow and similar)', 'Its own tee sheet', 'Full golf POS'] as const;

/** Suggestions for "Why it fits"; any short tag is accepted. */
export const FIT_TAGS = [
  'Muni with a resident rate', 'Phone-only booking', 'Several courses, one owner', 'Has a member list',
  'Pro shop at the counter', 'Website says call to book',
] as const;

export const CONTACT_ROLES = ['General manager', 'Head pro', 'Owner', 'Parks director', 'Other'] as const;
export const CONTACT_CHANNELS = ['email', 'phone', 'text'] as const;

export const CALL_RESULTS = ['said_yes', 'follow_up', 'not_now', 'no_answer'] as const;
export type CallResult = typeof CALL_RESULTS[number];
export const CALL_RESULT_LABEL: Record<CallResult, string> = {
  said_yes: 'Said yes → Onboarding', follow_up: 'Follow up', not_now: 'Not now', no_answer: 'No answer',
};

export const LIMITS = { name: 200, town: 100, state: 40, text: 200, address: 300, phone: 40, email: 200, tag: 40, tags: 8, note: 4000, nextStep: 300 } as const;

// ─── Stage and next step ─────────────────────────────────────────────────────

export type TouchLike = { at: string | Date; channel: string; direction: string };
export type OutreachCall = CallLike & { createdAt?: string | Date; bookedByCourse?: boolean };
export type OutreachInput = {
  touches: TouchLike[];
  calls: OutreachCall[];
  snoozeUntil?: string | Date | null;
  nextFollowUpAt?: string | Date | null;
};

const t = (d: string | Date) => new Date(d).getTime();
const DAY = 86_400_000;
const LOGGED = (c: CallLike) => c.outcome !== 'scheduled' && c.outcome !== 'cancelled';

export function outreachStage(inq: OutreachInput, now: Date = new Date()): OutreachStage {
  if (nextCall(inq.calls, now) || overdueCall(inq.calls, now)) return 'call';
  if (inq.touches.some(x => x.direction === 'in')) return 'replied';
  if (inq.touches.some(x => x.direction === 'out') || inq.calls.some(LOGGED)) return 'contacted';
  return 'target';
}

/** Outbound emails in the order they went (Email 1, 2, 3). */
export function emailsSent(touches: TouchLike[]): Date[] {
  return touches.filter(x => x.channel === 'email' && x.direction === 'out').map(x => new Date(x.at)).sort((a, b) => a.getTime() - b.getTime());
}

export type NextStep = { key: 'email1' | 'call_them' | 'email2' | 'email3' | 'close_no_reply' | 'answer_reply' | 'follow_up' | 'discovery_call' | 'log_call'; label: string; dueAt: string; due: boolean };

/** End of today, Eastern — "due" means on or before it. */
export function endOfEasternDay(now: Date): Date {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  // Midnight Eastern of the next day: try both offsets, keep the one that lands on that calendar day.
  const next = new Date(`${ymd}T00:00:00Z`).getTime() + DAY;
  for (const h of [4, 5]) {
    const cand = new Date(next + h * 3600_000);
    if (cand.toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hourCycle: 'h23' }).startsWith('00:00')) return cand;
  }
  return new Date(next + 5 * 3600_000);
}

/** The one next step for a course in outreach, from company/outreach/plan.md's cadence. nextFollowUpAt moves the date. */
export function outreachNext(inq: OutreachInput, now: Date = new Date()): NextStep {
  const eod = endOfEasternDay(now).getTime();
  const mk = (key: NextStep['key'], label: string, at: Date | number, forceDue = false): NextStep => {
    let when = new Date(at);
    const snooze = inq.snoozeUntil ? new Date(inq.snoozeUntil) : null;
    if (snooze && snooze.getTime() > now.getTime() && snooze.getTime() > when.getTime()) when = snooze;
    return { key, label, dueAt: when.toISOString(), due: forceDue ? !(snooze && snooze.getTime() > now.getTime()) : when.getTime() < eod };
  };
  const overdue = overdueCall(inq.calls, now);
  if (overdue) return mk('log_call', 'Log the call', t(overdue.scheduledAt), true);
  const upcoming = nextCall(inq.calls, now);
  if (upcoming) return mk('discovery_call', 'Discovery call', t(upcoming.scheduledAt));

  const followUp = inq.nextFollowUpAt ? new Date(inq.nextFollowUpAt) : null;
  const sorted = inq.touches.slice().sort((a, b) => t(a.at) - t(b.at));
  const last = sorted[sorted.length - 1];
  if (sorted.some(x => x.direction === 'in')) {
    // A reply of any kind takes the course out of the sequence (plan.md).
    if (last.direction === 'in') return mk('answer_reply', 'Answer their reply', t(last.at));
    return mk('follow_up', 'Follow up', followUp ?? t(last.at) + 7 * DAY);
  }
  const emails = emailsSent(inq.touches);
  const d0 = emails[0]?.getTime();
  let step: NextStep['key'], label: string, at: number;
  if (!emails.length) { step = 'email1'; label = 'Email 1'; at = Math.max(OUTREACH_START.getTime(), now.getTime()); }
  else {
    const calledAfterFirst = sorted.some(x => x.direction === 'out' && x.channel !== 'email' && t(x.at) >= d0!)
      || inq.calls.some(c => LOGGED(c) && t(c.scheduledAt) >= d0!);
    if (emails.length === 1 && !calledAfterFirst) { step = 'call_them'; label = 'Call them'; at = d0! + CADENCE_DAYS.call * DAY; }
    else if (emails.length === 1) { step = 'email2'; label = 'Email 2'; at = d0! + CADENCE_DAYS.email2 * DAY; }
    else if (emails.length === 2) { step = 'email3'; label = 'Email 3'; at = d0! + CADENCE_DAYS.email3 * DAY; }
    else { step = 'close_no_reply'; label = 'No reply — close, recheck in March'; at = d0! + CADENCE_DAYS.stop * DAY; }
  }
  // A follow-up date set by hand wins, except Email 1 still waits for the start date.
  if (followUp) at = step === 'email1' ? Math.max(followUp.getTime(), OUTREACH_START.getTime()) : followUp.getTime();
  return mk(step, label, at);
}

const fmtDay = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });

/** "Email 2 · Nov 12", "Replied · Nov 14", "Booked a call · Nov 13" — the newest thing on record, or ''. */
export function lastTouchLabel(inq: Pick<OutreachInput, 'touches' | 'calls'>): string {
  type Ev = { at: number; label: string };
  const evs: Ev[] = [];
  const emails = emailsSent(inq.touches).map(d => d.getTime());
  for (const x of inq.touches) {
    const at = t(x.at);
    if (x.direction === 'in') evs.push({ at, label: 'Replied' });
    else if (x.channel === 'email') evs.push({ at, label: `Email ${emails.indexOf(at) + 1}` });
    else evs.push({ at, label: x.channel === 'call' ? 'Called' : x.channel === 'text' ? 'Texted' : 'Visited' });
  }
  for (const c of inq.calls) {
    if (c.createdAt && c.outcome !== 'cancelled') evs.push({ at: t(c.createdAt), label: 'Booked a call' });
    if (LOGGED(c)) evs.push({ at: t(c.completedAt ?? c.scheduledAt), label: c.outcome === 'no_answer' ? 'Call · no answer' : 'Had a call' });
  }
  const last = evs.sort((a, b) => b.at - a.at)[0];
  return last ? `${last.label} · ${fmtDay(new Date(last.at))}` : '';
}

/** Email 1–3 for the course page: when each went, or when the next is due. */
export function emailRows(touches: TouchLike[], next: NextStep): { n: 1 | 2 | 3; sentAt: string | null; dueAt: string | null }[] {
  const sent = emailsSent(touches);
  return ([1, 2, 3] as const).map(n => ({
    n,
    sentAt: sent[n - 1]?.toISOString() ?? null,
    dueAt: !sent[n - 1] && next.key === `email${n}` ? next.dueAt : null,
  }));
}

/** "Town course · 18 holes", "Independent · 9 holes", or just one of them. */
export function courseKind(ownerType: string | null | undefined, holes: number | null | undefined): string {
  const own = OWNER_TYPES.find(o => o.key === ownerType)?.kind ?? '';
  return [own, holes ? `${holes} holes` : ''].filter(Boolean).join(' · ');
}

export function townLabel(city: string | null | undefined, state: string | null | undefined): string {
  return [city, state].map(s => (s ?? '').trim()).filter(Boolean).join(', ');
}

// ─── Validation ──────────────────────────────────────────────────────────────

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CourseFacts = {
  courseName?: string; city?: string; state?: string; address?: string; zipCode?: string; website?: string;
  coursePhone?: string | null; holes?: number | null; ownerType?: string | null; currentBookingMethod?: string;
  currentSoftware?: string | null; softwareContractEnds?: string | null; greenFeeRange?: string; roundsPerYear?: number | null;
  hasResidentPricing?: boolean; hasProShop?: boolean | null; hasRange?: boolean | null; season?: string | null;
  fitTags?: string[]; latitude?: number | null; longitude?: number | null; osmRef?: string | null;
};

const FACT_KEYS = [
  'courseName', 'city', 'state', 'address', 'zipCode', 'website', 'coursePhone', 'holes', 'ownerType', 'currentBookingMethod',
  'currentSoftware', 'softwareContractEnds', 'greenFeeRange', 'roundsPerYear', 'hasResidentPricing', 'hasProShop', 'hasRange',
  'season', 'fitTags', 'latitude', 'longitude', 'osmRef',
] as const;
export type FactKey = typeof FACT_KEYS[number];

/** "https://x.com/" → "x.com". Only http(s) is kept; anything else is dropped. */
export function cleanWebsite(v: unknown): string {
  let s = clean(v, LIMITS.text);
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    if (!u.hostname.includes('.')) return '';
    return (u.hostname.replace(/^www\./i, '') + u.pathname.replace(/\/$/, '')).toLowerCase().slice(0, LIMITS.text);
  } catch { return ''; }
}

export const cleanPhone = (v: unknown) => clean(v, LIMITS.phone).replace(/[^0-9+()\-. x]/g, '').trim();

const triBool = (v: unknown): boolean | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  if (['no', 'n', 'false', '0'].includes(s)) return false;
  return null;
};

/** Only the keys present in `input` are returned, so a PATCH never blanks what it did not send. */
export function validateFacts(input: Record<string, unknown>, opts: { requireNameAndTown?: boolean } = {}): { facts: CourseFacts } | { error: string } {
  const f: CourseFacts = {};
  const has = (k: FactKey) => Object.prototype.hasOwnProperty.call(input, k);
  if (has('courseName') || opts.requireNameAndTown) {
    const v = clean(input.courseName, LIMITS.name);
    if (!v) return { error: 'The course name is needed.' };
    f.courseName = v;
  }
  if (has('city') || opts.requireNameAndTown) {
    const v = clean(input.city, LIMITS.town);
    if (!v && opts.requireNameAndTown) return { error: 'The town is needed.' };
    f.city = v;
  }
  if (has('state')) f.state = clean(input.state, LIMITS.state);
  if (has('address')) f.address = clean(input.address, LIMITS.address);
  if (has('zipCode')) f.zipCode = clean(input.zipCode, 20);
  if (has('website')) {
    const raw = clean(input.website, LIMITS.text);
    const v = cleanWebsite(raw);
    if (raw && !v) return { error: 'That website doesn’t look right.' };
    f.website = v;
  }
  if (has('coursePhone')) f.coursePhone = cleanPhone(input.coursePhone) || null;
  if (has('holes')) {
    const v = input.holes;
    if (v === null || v === '') f.holes = null;
    else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 72) return { error: 'Holes must be a whole number like 9, 18 or 27.' };
      f.holes = n;
    }
  }
  if (has('ownerType')) {
    const v = clean(input.ownerType, 40);
    const match = OWNER_TYPES.find(o => o.key === v.toLowerCase() || o.label.toLowerCase() === v.toLowerCase() || o.kind.toLowerCase() === v.toLowerCase());
    if (v && !match) return { error: `Owned by must be one of: ${OWNER_TYPES.map(o => o.label).join(', ')}.` };
    f.ownerType = match?.key ?? null;
  }
  if (has('currentBookingMethod')) f.currentBookingMethod = clean(input.currentBookingMethod, LIMITS.text);
  if (has('currentSoftware')) f.currentSoftware = clean(input.currentSoftware, LIMITS.text) || null;
  if (has('softwareContractEnds')) f.softwareContractEnds = clean(input.softwareContractEnds, 60) || null;
  if (has('greenFeeRange')) f.greenFeeRange = clean(input.greenFeeRange, 100);
  if (has('roundsPerYear')) {
    const v = input.roundsPerYear;
    if (v === null || v === '') f.roundsPerYear = null;
    else {
      const n = Number(String(v).replace(/[,\s]/g, ''));
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return { error: 'Rounds a year must be a whole number.' };
      f.roundsPerYear = n;
    }
  }
  if (has('hasResidentPricing')) f.hasResidentPricing = triBool(input.hasResidentPricing) === true;
  if (has('hasProShop')) f.hasProShop = triBool(input.hasProShop) ?? null;
  if (has('hasRange')) f.hasRange = triBool(input.hasRange) ?? null;
  if (has('season')) f.season = clean(input.season, 60) || null;
  if (has('fitTags')) {
    const raw = Array.isArray(input.fitTags) ? input.fitTags : [];
    const tags = Array.from(new Set(raw.map(x => clean(x, LIMITS.tag)).filter(Boolean)));
    if (tags.length > LIMITS.tags) return { error: `At most ${LIMITS.tags} reasons it fits.` };
    f.fitTags = tags;
  }
  if (has('latitude') || has('longitude')) {
    const lat = input.latitude === null || input.latitude === '' || input.latitude === undefined ? null : Number(input.latitude);
    const lon = input.longitude === null || input.longitude === '' || input.longitude === undefined ? null : Number(input.longitude);
    if ((lat === null) !== (lon === null)) return { error: 'A location needs both latitude and longitude.' };
    if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon!) || lon! < -180 || lon! > 180)) return { error: 'That location is not a real place.' };
    f.latitude = lat; f.longitude = lon;
  }
  if (has('osmRef')) {
    const v = clean(input.osmRef, 40);
    if (v && !/^osm:(node|way|relation)\/\d{1,15}$/.test(v)) return { error: 'Unknown map reference.' };
    f.osmRef = v || null;
  }
  return { facts: f };
}

export type ContactInput = { name: string; role: string; email: string; phone: string; decisionMaker: boolean; preferredChannel: string; bestTime: string };

/** A whole contact (create) or, with partial: true, only the keys sent (edit). */
export function validateContact(input: Record<string, unknown>, partial = false): { contact: Partial<ContactInput> } | { error: string } {
  const c: Partial<ContactInput> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(input, k);
  if (has('name') || !partial) {
    const v = clean(input.name, 120);
    if (!v) return { error: 'The contact needs a name.' };
    c.name = v;
  }
  if (has('role') || !partial) c.role = clean(input.role, 120);
  if (has('email') || !partial) {
    const v = clean(input.email, LIMITS.email).toLowerCase();
    if (v && !EMAIL_RE.test(v)) return { error: 'That email doesn’t look right.' };
    c.email = v;
  }
  if (has('phone') || !partial) c.phone = cleanPhone(input.phone);
  if (has('decisionMaker') || !partial) c.decisionMaker = input.decisionMaker === true;
  if (has('preferredChannel') || !partial) {
    const v = clean(input.preferredChannel, 10).toLowerCase();
    if (v && !(CONTACT_CHANNELS as readonly string[]).includes(v)) return { error: 'Best reached by email, phone or text.' };
    c.preferredChannel = v;
  }
  if (has('bestTime') || !partial) c.bestTime = clean(input.bestTime, 120);
  return { contact: c };
}

// ─── Duplicate check ─────────────────────────────────────────────────────────

const STOP = new Set(['the', 'golf', 'course', 'club', 'gc', 'cc', 'country', 'links', 'municipal', 'muni', 'and', 'at', 'of']);

/** "The Maple Run Golf Course" → "maple run". Falls back to every word when the name is only generic words. */
export function nameKey(name: string): string {
  const words = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  const core = words.filter(w => !STOP.has(w));
  return (core.length ? core : words).join(' ');
}
const townKey = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const domainKey = (w: string | null | undefined) => cleanWebsite(w).split('/')[0];
const phoneKey = (p: string | null | undefined) => { const d = (p ?? '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };

export type DupCandidate = { courseName: string; city?: string | null; state?: string | null; website?: string | null; coursePhone?: string | null; osmRef?: string | null };
export type DupPoolRow = DupCandidate & { id: string; kind: 'inquiry' | 'course'; status?: string };
export type DupMatch = { id: string; kind: 'inquiry' | 'course'; courseName: string; town: string; status?: string; why: string };

/** Which existing inquiries or live courses look like the same course. */
export function findDuplicates(c: DupCandidate, pool: DupPoolRow[]): DupMatch[] {
  const nk = nameKey(c.courseName);
  const tk = townKey(c.city);
  const sk = townKey(c.state);
  const dk = domainKey(c.website);
  const pk = phoneKey(c.coursePhone);
  const out: DupMatch[] = [];
  for (const p of pool) {
    let why = '';
    if (c.osmRef && p.osmRef && c.osmRef === p.osmRef) why = 'same map listing';
    else if (dk && dk === domainKey(p.website)) why = 'same website';
    else if (pk && pk === phoneKey(p.coursePhone)) why = 'same phone';
    else if (nk && nk === nameKey(p.courseName)) {
      const ptk = townKey(p.city), psk = townKey(p.state);
      // Same name and town; a blank town on either side still counts, a different state does not.
      if ((!tk || !ptk || tk === ptk) && (!sk || !psk || sk === psk)) why = tk && ptk ? 'same name and town' : 'same name';
    }
    if (why) out.push({ id: p.id, kind: p.kind, courseName: p.courseName, town: townLabel(p.city, p.state), status: p.status, why });
  }
  return out;
}

// ─── CSV import ──────────────────────────────────────────────────────────────

export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_BYTES = 512 * 1024;

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<string, string> = {
  name: 'courseName', 'course name': 'courseName', course: 'courseName',
  town: 'town', city: 'town', 'town/city': 'town', state: 'state', zip: 'zipCode', 'zip code': 'zipCode',
  address: 'address', website: 'website', 'course phone': 'coursePhone', holes: 'holes',
  'owned by': 'ownerType', owner: 'ownerType', 'owner type': 'ownerType',
  'books today by': 'currentBookingMethod', 'books today': 'currentBookingMethod', 'booking method': 'currentBookingMethod',
  software: 'currentSoftware', 'current software': 'currentSoftware', season: 'season',
  'green fees': 'greenFeeRange', 'rounds a year': 'roundsPerYear',
  'contact name': 'contactName', contact: 'contactName', role: 'contactRole', 'contact role': 'contactRole',
  email: 'contactEmail', 'contact email': 'contactEmail', 'contact phone': 'contactPhone',
  'why it fits': 'fitTags', tags: 'fitTags', notes: 'notes',
};

export type ImportRow = { row: number; facts: CourseFacts; contact: Partial<ContactInput> | null; notes: string; error?: string };

/**
 * Header row first. The mockup's column list has "phone" twice: the first is the course's, the second
 * the contact's (one "phone" alone is the course's). "Town" may be "Ashgrove, NY".
 */
export function importRows(text: string): { rows: ImportRow[]; error?: string } {
  if (text.length > IMPORT_MAX_BYTES) return { rows: [], error: 'That file is too big — keep it under 500 KB.' };
  const all = parseCsv(text);
  if (all.length < 2) return { rows: [], error: 'The file needs a header row and at least one course.' };
  const header = all[0].map(h => h.trim().toLowerCase().replace(/\s+/g, ' '));
  let phones = 0;
  const cols = header.map(h => {
    if (h === 'phone') return phones++ === 0 ? 'coursePhone' : 'contactPhone';
    return HEADER_ALIASES[h] ?? '';
  });
  if (!cols.includes('courseName')) return { rows: [], error: 'The file needs a "name" column.' };
  if (!cols.includes('town')) return { rows: [], error: 'The file needs a "town" column.' };
  const body = all.slice(1);
  if (body.length > IMPORT_MAX_ROWS) return { rows: [], error: `At most ${IMPORT_MAX_ROWS} courses at a time.` };
  const rows = body.map((cells, i): ImportRow => {
    const get = (k: string) => { const j = cols.indexOf(k); return j >= 0 ? (cells[j] ?? '').trim() : ''; };
    const hasCol = (k: string) => cols.includes(k);
    let city = get('town'), state = get('state');
    const m = /^(.*),\s*([A-Za-z]{2})$/.exec(city);
    if (m && !state) { city = m[1].trim(); state = m[2].toUpperCase(); }
    const raw: Record<string, unknown> = { courseName: get('courseName'), city };
    if (state) raw.state = state;
    for (const k of ['address', 'zipCode', 'website', 'coursePhone', 'holes', 'ownerType', 'currentBookingMethod', 'currentSoftware', 'season', 'greenFeeRange', 'roundsPerYear']) {
      if (hasCol(k) && get(k)) raw[k] = get(k);
    }
    if (hasCol('fitTags') && get('fitTags')) raw.fitTags = get('fitTags').split(/[;|]/);
    const v = validateFacts(raw, { requireNameAndTown: true });
    const rowNo = i + 2;
    if ('error' in v) return { row: rowNo, facts: { courseName: get('courseName'), city }, contact: null, notes: '', error: v.error };
    let contact: Partial<ContactInput> | null = null;
    const cn = get('contactName'), ce = get('contactEmail'), cp = get('contactPhone'), cr = get('contactRole');
    if (cn || ce || cp) {
      const cv = validateContact({ name: cn || ce || cp, role: cr, email: ce, phone: cp, decisionMaker: false, preferredChannel: '', bestTime: '' });
      if ('error' in cv) return { row: rowNo, facts: v.facts, contact: null, notes: '', error: cv.error };
      contact = cv.contact;
    }
    return { row: rowNo, facts: v.facts, contact, notes: clean(get('notes'), LIMITS.note) };
  });
  return { rows };
}
