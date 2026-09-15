// INQUIRY_CALL_SPEC IC-5 — structured discovery-call answers.
//
// The catalog of fields per agenda item, the v2 answersJson shape, a reader
// that tolerates the old flat prose shape, one-line summaries for every prose
// consumer, and the mapping onto the course's setup sheet.
//
// GOVERNING RULE: a call answer is a PROPOSAL. It pre-fills the course's own
// sheet; what the course submits wins; nothing is written onto a live Course.
//
// No import from ./inquiry-call — that file imports this one.

export type FieldType = 'money' | 'time' | 'date' | 'days' | 'bool' | 'enum' | 'text' | 'rows';

export type FieldSpec = {
  key: string;
  label: string;
  type: FieldType;
  /** enum only: [value, label] */
  options?: [string, string][];
  /** the setup-sheet key this pre-fills; `branch.<key>` feeds the sheet's IF-1 branch questions */
  sheetKey?: string;
  /** "Still need from them" names this field when the item was discussed but this is missing */
  need?: boolean;
};

export type ItemAnswers = { fields: Record<string, unknown>; note: string };
export type CallAnswers = { v: 2; items: Record<string, ItemAnswers> };

export const TEXT_MAX = 2000;
export const NOTE_MAX = 4000;
export const MONEY_MAX_CENTS = 10_000_000;

// The same five strings the inquiry form offers (IF-1).
export const BOOKING_METHOD_OPTIONS: [string, string][] = [
  ['Phone and a paper sheet', 'Phone and a paper sheet'],
  ['Phone and a spreadsheet', 'Phone and a spreadsheet'],
  ['GolfNow or a similar site', 'GolfNow or a similar site'],
  ['Our own website', 'Our own website'],
  ['Something else', 'Something else'],
];

// The sheet's season selects are month names, so the call captures the same.
export const MONTH_OPTIONS: [string, string][] = [['January', 'January'], ['February', 'February'], ['March', 'March'], ['April', 'April'], ['May', 'May'], ['June', 'June'], ['July', 'July'], ['August', 'August'], ['September', 'September'], ['October', 'October'], ['November', 'November'], ['December', 'December']];

export const CALL_FIELDS: Record<string, FieldSpec[]> = {
  green_fees: [
    { key: 'weekday', label: 'Weekday', type: 'money', sheetKey: 'greenFeeWeekday', need: true },
    { key: 'weekend', label: 'Weekend', type: 'money', sheetKey: 'greenFeeWeekend', need: true },
    { key: 'twilight', label: 'Twilight', type: 'money', sheetKey: 'twilightFee' },
  ],
  tee_times: [
    { key: 'first', label: 'First tee time', type: 'time', sheetKey: 'firstTeeTime', need: true },
    { key: 'last', label: 'Last tee time', type: 'time', sheetKey: 'lastTeeTime', need: true },
    { key: 'interval', label: 'Interval', type: 'enum', sheetKey: 'intervalMinutes', need: true,
      options: [['8', '8 min'], ['9', '9 min'], ['10', '10 min'], ['12', '12 min'], ['15', '15 min']] },
  ],
  booking_today: [
    { key: 'method', label: 'Method', type: 'enum', options: BOOKING_METHOD_OPTIONS },
    { key: 'software', label: 'Software', type: 'text' },
  ],
  resident_member: [
    { key: 'residentRates', label: 'Resident rates', type: 'bool', sheetKey: 'branch.passes' },
    { key: 'memberships', label: 'Memberships / passes', type: 'bool', sheetKey: 'branch.passes' },
    { key: 'memberPerRound', label: 'Members pay per round', type: 'bool', sheetKey: 'branch.member_rate' },
    { key: 'memberRate', label: 'Member rate', type: 'money', sheetKey: 'memberRate' },
    { key: 'residentWho', label: 'Who counts as a resident', type: 'text' },
  ],
  cancellation: [
    { key: 'hasPolicy', label: 'Has a policy', type: 'bool', sheetKey: 'cancellationPolicy', need: true },
    { key: 'hours', label: 'Window', type: 'enum', sheetKey: 'cancellationHours',
      options: [['24', '24 h'], ['48', '48 h'], ['72', '72 h']] },
    { key: 'lateFee', label: 'Late fee', type: 'money', sheetKey: 'lateFee' },
  ],
  carts_caddies: [
    { key: 'cartFee', label: 'Cart fee', type: 'money', sheetKey: 'cartFee' },
    // The sheet's own three options, so the value always lands in the control.
    { key: 'walking', label: 'Walking', type: 'enum', sheetKey: 'walkingAllowed',
      options: [['yes', 'Yes, always'], ['weekdays', 'Weekdays only'], ['no', 'No — cart required']] },
    { key: 'caddies', label: 'Caddies', type: 'bool' },
  ],
  season_hours: [
    { key: 'seasonOpen', label: 'Season opens', type: 'enum', sheetKey: 'seasonOpen', need: true, options: MONTH_OPTIONS },
    { key: 'seasonClose', label: 'Season closes', type: 'enum', sheetKey: 'seasonClose', need: true, options: MONTH_OPTIONS },
    { key: 'daysOpen', label: 'Days open', type: 'days', sheetKey: 'daysOpen' },
  ],
  protected_times: [
    { key: 'protectedTimes', label: 'Protected times', type: 'text', sheetKey: 'protectedTimes' },
    { key: 'outings', label: 'Outside outings', type: 'bool', sheetKey: 'branch.outings' },
    { key: 'outingsVolume', label: 'How often', type: 'enum', sheetKey: 'outingsVolume',
      options: [['weekly', 'Weekly'], ['monthly', 'Monthly'], ['seasonally', 'A few per season'], ['rarely', 'Rarely']] },
  ],
  assets: [
    { key: 'logo', label: 'Logo', type: 'enum', options: [['they_send', 'They send it'], ['pull_from_site', 'We pull it from their site'], ['none_yet', 'None yet']] },
    { key: 'photos', label: 'Photos', type: 'enum', options: [['they_send', 'They send them'], ['pull_from_site', 'We pull from their site'], ['none_yet', 'None yet']] },
    { key: 'by', label: 'By', type: 'date' },
  ],
  people: [
    { key: 'signer', label: 'Signs off', type: 'text' },
    { key: 'dayToDay', label: 'Runs the sheet day to day', type: 'text' },
  ],
  fee_model: [
    { key: 'walkedThrough', label: 'Walked through', type: 'bool' },
    { key: 'questions', label: 'Open questions', type: 'text' },
  ],
};

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function emptyAnswers(): CallAnswers { return { v: 2, items: {} }; }

export function isCaptured(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** Any input → v2. Old flat `{ key: "prose" }` becomes `items[key].note`. Unknown junk → empty. */
export function parseCallAnswers(raw: string | null | undefined | unknown): CallAnswers {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return emptyAnswers();
    try { obj = JSON.parse(raw); } catch { return emptyAnswers(); }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return emptyAnswers();
  const o = obj as Record<string, unknown>;
  const out = emptyAnswers();
  if (o.v === 2 && o.items && typeof o.items === 'object') {
    for (const [k, it] of Object.entries(o.items as Record<string, unknown>)) {
      if (!it || typeof it !== 'object') continue;
      const item = it as { fields?: unknown; note?: unknown };
      out.items[k] = {
        fields: item.fields && typeof item.fields === 'object' && !Array.isArray(item.fields) ? { ...(item.fields as Record<string, unknown>) } : {},
        note: typeof item.note === 'string' ? item.note : '',
      };
    }
    return out;
  }
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string' && v.trim()) out.items[k] = { fields: {}, note: v.trim() };
  }
  return out;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validField(spec: FieldSpec, v: unknown): unknown | undefined {
  switch (spec.type) {
    case 'money': {
      const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
      return Number.isInteger(n) && n >= 0 && n <= MONEY_MAX_CENTS ? n : undefined;
    }
    case 'time': return typeof v === 'string' && TIME_RE.test(v) ? v : undefined;
    case 'date': return typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(new Date(v + 'T00:00:00Z').getTime()) ? v : undefined;
    case 'days': {
      if (!Array.isArray(v)) return undefined;
      const days = [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
      return days.length ? days : undefined;
    }
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'enum': return typeof v === 'string' && (spec.options ?? []).some(([val]) => val === v) ? v : undefined;
    case 'text': return typeof v === 'string' && v.trim() ? v.trim().slice(0, TEXT_MAX) : undefined;
    case 'rows': return undefined; // declared, unused this phase
  }
}

/** Accepts v2 or v1; keeps only known items, known fields, well-typed values. */
export function validateAnswers(input: unknown): CallAnswers {
  const parsed = parseCallAnswers(input);
  const out = emptyAnswers();
  for (const [key, specs] of Object.entries(CALL_FIELDS)) {
    const item = parsed.items[key];
    if (!item) continue;
    const fields: Record<string, unknown> = {};
    for (const spec of specs) {
      const v = validField(spec, item.fields[spec.key]);
      if (v !== undefined) fields[spec.key] = v;
    }
    const note = item.note.trim().slice(0, NOTE_MAX);
    if (Object.keys(fields).length || note) out.items[key] = { fields, note };
  }
  return out;
}

export function fmtMoneyCents(c: number): string {
  return c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`;
}

export function fmtFieldValue(spec: FieldSpec, v: unknown): string {
  if (!isCaptured(v)) return '';
  switch (spec.type) {
    case 'money': return typeof v === 'number' ? fmtMoneyCents(v) : String(v);
    case 'days': return Array.isArray(v) ? (v as number[]).map(d => DAY_SHORT[d] ?? String(d)).join(' ') : String(v);
    case 'bool': return v === true ? 'Yes' : 'No';
    case 'enum': return (spec.options ?? []).find(([val]) => val === v)?.[1] ?? String(v);
    default: return String(v);
  }
}

/** One line for an item: "Weekday $45 · Weekend $60 — note". */
export function summarize(key: string, item: ItemAnswers | undefined | null): string {
  if (!item) return '';
  const parts = (CALL_FIELDS[key] ?? [])
    .filter(s => isCaptured(item.fields[s.key]))
    .map(s => (s.type === 'bool' ? `${s.label}: ${fmtFieldValue(s, item.fields[s.key])}` : `${s.label} ${fmtFieldValue(s, item.fields[s.key])}`));
  const head = parts.join(' · ');
  if (head && item.note) return `${head} — ${item.note}`;
  return head || item.note || '';
}

/** `{ agendaKey: "one line" }` for every item with anything captured — the shape the prose readers already use. */
export function flatSummaries(raw: string | null | undefined | unknown): Record<string, string> {
  const a = parseCallAnswers(raw);
  const out: Record<string, string> = {};
  for (const [k, item] of Object.entries(a.items)) {
    const s = summarize(k, item);
    if (s) out[k] = s;
  }
  return out;
}

export function hasAnyCapture(item: ItemAnswers | undefined | null): boolean {
  if (!item) return false;
  return !!item.note || Object.values(item.fields).some(isCaptured);
}

/** Labels of `need: true` fields not captured for an item that was discussed at all. */
export function missingNeedFields(key: string, item: ItemAnswers | undefined | null): string[] {
  // Only once at least one FIELD was captured — an old prose-only answer has
  // nothing to name and is not "missing" anything.
  if (!item || !Object.values(item.fields).some(isCaptured)) return [];
  return (CALL_FIELDS[key] ?? []).filter(s => s.need && !isCaptured(item!.fields[s.key])).map(s => s.label.toLowerCase());
}

export type SheetPrefill = Record<string, unknown> & { branch: Record<string, 'yes' | 'no'> };

/** What the sheet should show as defaults. The sheet wins on every key it already holds. */
export function toSheetPrefill(answers: CallAnswers): SheetPrefill {
  const out: SheetPrefill = { branch: {} };
  // branch.passes has two sources: yes if either says yes; no only if both say no.
  let passesYes = false; let passesNo = 0;
  for (const [key, specs] of Object.entries(CALL_FIELDS)) {
    const item = answers.items[key];
    if (!item) continue;
    for (const spec of specs) {
      const v = item.fields[spec.key];
      if (!spec.sheetKey || !isCaptured(v)) continue;
      if (spec.sheetKey.startsWith('branch.')) {
        const b = spec.sheetKey.slice('branch.'.length);
        if (b === 'passes') { if (v === true) passesYes = true; else if (v === false) passesNo++; continue; }
        out.branch[b] = v === true ? 'yes' : 'no';
        continue;
      }
      switch (spec.type) {
        case 'money': out[spec.sheetKey] = (Number(v) / 100).toFixed(2); break;
        case 'bool': out[spec.sheetKey] = v === true ? 'yes' : 'no'; break;
        case 'days': out[spec.sheetKey] = [...(v as number[])]; break;
        default: out[spec.sheetKey] = String(v);
      }
    }
  }
  if (passesYes) out.branch.passes = 'yes';
  else if (passesNo >= 2) out.branch.passes = 'no';
  return out;
}
