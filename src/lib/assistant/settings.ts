// ASSIST-1 (Cam 2026-11-24, lanes/build.md "AI assistant overhaul"): the course's own settings for its assistant.
// Client-safe: Settings → Assistant and the routes read these one lists. Every input is checked here, on the
// server, before it is saved; the page only mirrors the same limits.

export const ASSISTANT_TONES = [
  { key: 'friendly', label: 'Friendly', prompt: 'Warm and welcoming, like a good pro shop. Short sentences.' },
  { key: 'brief', label: 'Brief', prompt: 'As few words as answer the question. No small talk.' },
  { key: 'formal', label: 'Formal', prompt: 'Polite and formal, like a private club. No slang, no exclamation marks.' },
] as const;
export type AssistantTone = typeof ASSISTANT_TONES[number]['key'];

/** What golfers may ask about. The golfer brief carries only the sections of the topics the course allowed. */
export const GOLFER_TOPICS = [
  { key: 'rates', label: 'Tee times and prices' },
  { key: 'policy', label: 'Booking and cancellation policy' },
  { key: 'info', label: 'Course info and directions' },
  { key: 'events', label: 'Events' },
  { key: 'memberships', label: 'Memberships and log-in' },
  { key: 'range', label: 'Range and pro shop' },
] as const;
export type GolferTopic = typeof GOLFER_TOPICS[number]['key'];
export const ALL_GOLFER_TOPICS: GolferTopic[] = GOLFER_TOPICS.map(t => t.key);

/** Cam 2026-11-24: golfer questions are capped at 300 per course per day. A course may set a lower limit, never higher. */
export const GOLFER_DAILY_MAX = 300;
export const UNKNOWN_LINE_CHARS = 200;
export const NOTE_QUESTION_CHARS = 200;
export const NOTE_ANSWER_CHARS = 600;
export const MAX_NOTES = 40;
export const NOTE_AUDIENCES = ['golfers', 'staff'] as const;
export type NoteAudience = typeof NOTE_AUDIENCES[number];

export type AssistantSettings = {
  staffOn: boolean;
  golferOn: boolean;
  tone: AssistantTone;
  /** Never empty once read: an empty column means every topic. */
  golferTopics: GolferTopic[];
  /** The course's own line, or '' to use the default from its phone. */
  unknownLine: string;
  golferDailyLimit: number;
};

const isTone = (v: unknown): v is AssistantTone => ASSISTANT_TONES.some(t => t.key === v);
const isTopic = (v: unknown): v is GolferTopic => GOLFER_TOPICS.some(t => t.key === v);

/** Course-written text that sits next to the brief: one line, no angle brackets (it can never close a tag). */
export const safeLine = (v: string, max: number) => plainLine(v, max).replace(/</g, '‹').replace(/>/g, '›');

/** One line of plain text: no control characters, no line breaks, spaces collapsed. */
export function plainLine(v: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
/** Plain text that may keep single line breaks (a note's answer). */
export function plainText(v: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]+/g, ' ')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

/** The Course row's columns → settings, with every unknown value made safe. */
export function readAssistantSettings(c: {
  assistantStaffOn: boolean; assistantGolferOn: boolean; assistantTone: string; assistantGolferTopics: string[];
  assistantUnknownLine: string; assistantGolferDailyLimit: number;
}): AssistantSettings {
  const topics = (c.assistantGolferTopics ?? []).filter(isTopic);
  return {
    staffOn: c.assistantStaffOn !== false,
    golferOn: c.assistantGolferOn === true,
    tone: isTone(c.assistantTone) ? c.assistantTone : 'friendly',
    golferTopics: topics.length ? ALL_GOLFER_TOPICS.filter(t => topics.includes(t)) : [...ALL_GOLFER_TOPICS],
    unknownLine: safeLine(c.assistantUnknownLine ?? '', UNKNOWN_LINE_CHARS),
    golferDailyLimit: clampLimit(c.assistantGolferDailyLimit),
  };
}

export function clampLimit(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(GOLFER_DAILY_MAX, Math.max(1, Math.round(n))) : GOLFER_DAILY_MAX;
}

/** "I'm not sure. Please call the pro shop at <phone>." — the course's own line wins when it wrote one. */
export function unknownLineFor(s: Pick<AssistantSettings, 'unknownLine'>, course: { name: string; phone: string; proShopPhone: string }): string {
  if (s.unknownLine) return s.unknownLine;
  const phone = safeLine(course.proShopPhone || course.phone || '', 40);
  return phone ? `I'm not sure. Please call the pro shop at ${phone}.` : "I'm not sure. Please ask at the pro shop.";
}

export type SettingsPatch = Partial<{
  assistantStaffOn: boolean; assistantGolferOn: boolean; assistantTone: AssistantTone; assistantGolferTopics: GolferTopic[];
  assistantUnknownLine: string; assistantGolferDailyLimit: number;
}>;

/** A PATCH body → only the fields it sends, each checked. Unknown keys are ignored; a bad value is an error. */
export function readSettingsPatch(body: unknown): { ok: true; data: SettingsPatch } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Nothing to save.' };
  const b = body as Record<string, unknown>;
  const data: SettingsPatch = {};
  if ('staffOn' in b) { if (typeof b.staffOn !== 'boolean') return { ok: false, error: 'Staff switch must be on or off.' }; data.assistantStaffOn = b.staffOn; }
  if ('golferOn' in b) { if (typeof b.golferOn !== 'boolean') return { ok: false, error: 'Golfer switch must be on or off.' }; data.assistantGolferOn = b.golferOn; }
  if ('tone' in b) { if (!isTone(b.tone)) return { ok: false, error: 'Pick Friendly, Brief or Formal.' }; data.assistantTone = b.tone; }
  if ('golferTopics' in b) {
    if (!Array.isArray(b.golferTopics) || !b.golferTopics.every(isTopic)) return { ok: false, error: 'Unknown golfer topic.' };
    const set = b.golferTopics as GolferTopic[];
    if (!set.length) return { ok: false, error: 'Leave at least one topic on, or turn golfer questions off.' };
    data.assistantGolferTopics = ALL_GOLFER_TOPICS.filter(t => set.includes(t));
  }
  if ('unknownLine' in b) {
    if (typeof b.unknownLine !== 'string') return { ok: false, error: 'The "when it doesn\'t know" line must be text.' };
    data.assistantUnknownLine = safeLine(b.unknownLine, UNKNOWN_LINE_CHARS);
  }
  if ('golferDailyLimit' in b) {
    const n = b.golferDailyLimit;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > GOLFER_DAILY_MAX) return { ok: false, error: `The daily limit is 1 to ${GOLFER_DAILY_MAX} questions.` };
    data.assistantGolferDailyLimit = n;
  }
  if (!Object.keys(data).length) return { ok: false, error: 'Nothing to save.' };
  return { ok: true, data };
}

/** A note from the page → checked text, or an error. */
export function readNote(body: unknown): { ok: true; data: { question: string; answer: string; audience: NoteAudience } } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Write a question and an answer.' };
  const b = body as Record<string, unknown>;
  const question = typeof b.question === 'string' ? plainLine(b.question, NOTE_QUESTION_CHARS) : '';
  const answer = typeof b.answer === 'string' ? plainText(b.answer, NOTE_ANSWER_CHARS) : '';
  const audience = b.audience === undefined ? 'golfers' : b.audience;
  if (!question || !answer) return { ok: false, error: 'Write a question and an answer.' };
  if (audience !== 'golfers' && audience !== 'staff') return { ok: false, error: 'A note is for golfers or staff.' };
  return { ok: true, data: { question, answer, audience } };
}
