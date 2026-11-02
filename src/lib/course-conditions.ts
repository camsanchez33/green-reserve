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
export type CourseConditions = Partial<Record<ConditionKey, string>>;

/** Only known keys with known values survive — anything else is dropped. */
export function cleanConditions(raw: unknown): CourseConditions {
  const out: CourseConditions = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const f of CONDITION_FIELDS) {
    const v = (raw as Record<string, unknown>)[f.key];
    if (typeof v === 'string' && f.options.some(([k]) => k === v)) out[f.key] = v;
  }
  return out;
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
  return CONDITION_FIELDS.filter(f => c[f.key]).map(f => `${f.label}: ${conditionLabel(f.key, c[f.key])}`);
}

/** Home's warning: conditions are set but golfers no longer see them — the same rule as the booking page, by construction. */
export function conditionsOffBookingPage(raw: unknown, detailAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  return Object.keys(cleanConditions(raw)).length > 0 && golferConditionLines(raw, detailAt, now).length === 0;
}
