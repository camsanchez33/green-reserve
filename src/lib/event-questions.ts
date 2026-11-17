// Events sign-up questions (Cam 2026-11-17, "Add question" builder): a question
// has its text, an answer type and whether it is required. Name, email and
// phone are always asked and are never questions. Client-safe: no Node or
// Prisma imports, so the dashboard and the golfer page share these shapes.

export const QUESTION_TYPES = ['text', 'choice', 'yesno', 'number'] as const;
export type QuestionType = typeof QUESTION_TYPES[number];
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = { text: 'Short text', choice: 'Choice', yesno: 'Yes / no', number: 'Number' };
export const MAX_CHOICES = 12;

export const isQuestionType = (v: unknown): v is QuestionType => typeof v === 'string' && (QUESTION_TYPES as readonly string[]).includes(v);

const str = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

/**
 * The answer type and choices of a question, cleaned. Choices come as a list or
 * as the course typed them ("S, M, L, XL"). A choice question needs two choices;
 * any other type has none. Returns an error string when it can't be used.
 */
export function cleanQuestionShape(input: { type?: unknown; choices?: unknown }): { type: QuestionType; choices: string[] } | string {
  const type: QuestionType = isQuestionType(input.type) ? input.type : 'text';
  if (type !== 'choice') return { type, choices: [] };
  const raw = Array.isArray(input.choices) ? input.choices : String(input.choices ?? '').split(',');
  const choices = [...new Set(raw.map(c => str(c, 60)).filter(Boolean))];
  if (choices.length < 2) return 'A choice question needs at least two choices.';
  if (choices.length > MAX_CHOICES) return `A choice question can have up to ${MAX_CHOICES} choices.`;
  return { type, choices };
}
