// DASH-D Home (Cam 2026-11-01, "the course conditions"): what the course is like today,
// as a few fixed choices staff set in two taps — carts, range, greens, pins — next to the
// free-text course alert (Course.conditions) golfers already see on the booking page.
// Client-safe: the Home card and the route both read this one list.
export const CONDITION_FIELDS = [
  { key: 'carts', label: 'Carts', options: [['open', 'Anywhere'], ['path', 'Path only'], ['walking', 'Walking only'], ['none', 'No carts']] },
  { key: 'range', label: 'Range', options: [['grass', 'Grass'], ['mats', 'Mats'], ['closed', 'Closed']] },
  { key: 'greens', label: 'Greens', options: [['fast', 'Fast'], ['medium', 'Medium'], ['slow', 'Slow'], ['aerated', 'Aerated'], ['temporary', 'Temporary']] },
  { key: 'pins', label: 'Pins', options: [['front', 'Front'], ['middle', 'Middle'], ['back', 'Back'], ['mixed', 'Mixed']] },
] as const;

export type ConditionKey = typeof CONDITION_FIELDS[number]['key'];
/** HOME-2 (Cam 2026-11-05, "open to what they want — how the greens are rolling, cart path only"): the course's own lines beside the four choices. */
export type CourseConditions = Partial<Record<ConditionKey, string>> & { lines?: string[]; notes?: Partial<Record<ConditionKey, string>> };

/** HOME-3 (Cam 2026-11-12, the approved Home): the card shows cart path, greens and pins only, each with an optional detail line. */
export const HOME_CONDITIONS: { key: ConditionKey; label: string }[] = [{ key: 'carts', label: 'Cart path' }, { key: 'greens', label: 'Greens' }, { key: 'pins', label: 'Pins' }];
export const CONDITION_NOTE_CHARS = 80;

export const CONDITION_LINES_MAX = 6;
export const CONDITION_LINE_CHARS = 80;
/** Starting points staff can tap and edit — never shown to golfers unless saved. */
export const CONDITION_SUGGESTIONS = ['Greens rolling 10', 'Cart path only on 1–9', 'Frost delay until 9 AM', 'Bunkers under repair', 'Temporary green on 7', 'Range balls in the shop'] as const;

/** Only known keys with known values survive — anything else is dropped. */
export function cleanConditions(raw: unknown): CourseConditions {
  const out: CourseConditions = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const f of CONDITION_FIELDS) {
    const v = (raw as Record<string, unknown>)[f.key];
    if (typeof v === 'string' && f.options.some(([k]) => k === v)) out[f.key] = v;
  }
  // The course's own lines: plain text, trimmed, one line each, no repeats, a few short ones.
  const raw2 = (raw as { lines?: unknown }).lines;
  if (Array.isArray(raw2)) {
    const lines: string[] = [];
    for (const l of raw2) {
      if (typeof l !== 'string') continue;
      const t = l.replace(/\s+/g, ' ').trim().slice(0, CONDITION_LINE_CHARS);
      if (t && !lines.some(x => x.toLowerCase() === t.toLowerCase())) lines.push(t);
      if (lines.length >= CONDITION_LINES_MAX) break;
    }
    if (lines.length) out.lines = lines;
  }
  // HOME-3: a detail line per condition, kept only beside a condition that is set.
  const raw3 = (raw as { notes?: unknown }).notes;
  if (raw3 && typeof raw3 === 'object') {
    const notes: Partial<Record<ConditionKey, string>> = {};
    for (const f of CONDITION_FIELDS) {
      const v = (raw3 as Record<string, unknown>)[f.key];
      if (!out[f.key] || typeof v !== 'string') continue;
      const t = v.replace(/\s+/g, ' ').trim().slice(0, CONDITION_NOTE_CHARS);
      if (t) notes[f.key] = t;
    }
    if (Object.keys(notes).length) out.notes = notes;
  }
  return out;
}

/**
 * HOME-3 (Build 2026-11-12, "don't drop data"): what Home saves. Home sets cart path, greens and pins (and their
 * detail lines). Range and the course's own lines are shown on Home and can only be KEPT or REMOVED there: a range
 * or a line `home` no longer carries is removed; nothing new is added. Fields `home` doesn't mention at all are kept.
 */
export function mergeHomeConditions(current: unknown, home: CourseConditions): CourseConditions {
  const base = cleanConditions(current);
  const out: CourseConditions = { ...base, notes: { ...(base.notes ?? {}) } };
  if ('range' in home && home.range !== base.range) delete out.range;
  if (home.lines !== undefined) { const keep = (home.lines ?? []).map(l => l.toLowerCase()); out.lines = (base.lines ?? []).filter(l => keep.includes(l.toLowerCase())); if (!out.lines.length) delete out.lines; }
  for (const { key } of HOME_CONDITIONS) {
    const v = home[key];
    if (v) out[key] = v; else delete out[key];
    const n = home.notes?.[key]?.trim();
    if (v && n) out.notes![key] = n; else delete out.notes![key];
  }
  return cleanConditions(out);
}

/** "Path only" for carts=path, or '' when unset. */
export function conditionLabel(key: ConditionKey, value: string | undefined): string {
  const f = CONDITION_FIELDS.find(x => x.key === key);
  return (f?.options.find(([k]) => k === value)?.[1]) ?? '';
}

/** Golfers see conditions only when staff set them in the last 18 hours — yesterday's "path only" never reads as today's. */
export const CONDITIONS_FRESH_HOURS = 18;

/** The booking page's line: "Carts: Path only", … — only the fields set, only while fresh. */
export function golferConditionLines(raw: unknown, at: Date | string | null | undefined, now: Date = new Date()): string[] {
  if (!at) return [];
  const t = new Date(at).getTime();
  if (!Number.isFinite(t) || now.getTime() - t > CONDITIONS_FRESH_HOURS * 3600000) return [];
  const c = cleanConditions(raw);
  return [...CONDITION_FIELDS.filter(f => c[f.key]).map(f => `${f.label}: ${conditionLabel(f.key, c[f.key])}${c.notes?.[f.key] ? ` (${c.notes[f.key]})` : ''}`), ...(c.lines ?? [])];
}

/** Home's warning: conditions are set but golfers no longer see them — the same rule as the booking page, by construction. */
export function conditionsOffBookingPage(raw: unknown, detailAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  return Object.keys(cleanConditions(raw)).length > 0 && golferConditionLines(raw, detailAt, now).length === 0;
}
