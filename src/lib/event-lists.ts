// Events lists (Cam 2026-11-17, "they should be able to add or edit there own
// things"; lanes/dashboard.md item 3 "Lists the course edits").
//
// Two kinds of list:
//   - Course lists: the pick lists in event setup — what's included, checklist
//     steps, common sign-up questions and kinds of event. Each is the built-in
//     items (here, in code, never edited) plus the course's OWN items
//     (CourseEventListItem), which the course adds, edits and removes. A course's
//     own checklist steps join the checklist of every event it sets up after.
//   - Event lists: one event's notes for staff (CourseEvent.staffNotes). What's
//     included (CourseEvent.includes) and the checklist (CourseEventTask) were
//     already per event; their add/edit/remove is in the event route.
// Everything is looked up through the session's course.
import { randomBytes } from 'crypto';
import { prisma } from './prisma';
import { DEFAULT_TASKS, KIND_LABEL, EVENT_KINDS } from './course-events';
import { cleanQuestionShape, type QuestionType } from './event-questions';

export const COURSE_LISTS = ['include', 'task', 'question', 'kind'] as const;
export type CourseList = typeof COURSE_LISTS[number];
export const isCourseList = (v: unknown): v is CourseList => typeof v === 'string' && (COURSE_LISTS as readonly string[]).includes(v);

/** Most of the course's own items in one list. */
export const MAX_OWN_ITEMS = 50;
export const MAX_STAFF_NOTES = 30;

/** The built-in items of each list (the mockup's, Cam 2026-11-17). */
export const BUILT_IN = {
  include: ['Range balls', 'Cart', 'Lunch', 'Beverage cart', 'Prizes', 'Gift bag'].map(label => ({ label })),
  task: DEFAULT_TASKS.map(t => ({ label: t.label, daysBefore: t.daysBefore })),
  question: [
    { label: 'Handicap', type: 'number' as QuestionType, choices: [] as string[] },
    { label: 'Shirt size', type: 'choice' as QuestionType, choices: ['S', 'M', 'L', 'XL'] },
    { label: 'Dietary needs', type: 'text' as QuestionType, choices: [] as string[] },
    { label: 'Team name', type: 'text' as QuestionType, choices: [] as string[] },
    { label: 'Partner’s name', type: 'text' as QuestionType, choices: [] as string[] },
  ],
  kind: EVENT_KINDS.filter(k => k !== 'other').map(k => ({ key: k, label: KIND_LABEL[k] })),
};

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const str = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

export type OwnItem = { id: string; label: string; detail: string; type?: QuestionType; choices?: string[]; daysBefore?: number | null };

const LABEL_MAX: Record<CourseList, number> = { include: 60, task: 200, question: 120, kind: 60 };

/** Clean one of the course's own items for its list. */
export function cleanOwnItem(list: CourseList, input: Record<string, unknown>): Result<{ label: string; detail: string; data: Record<string, unknown> }> {
  const label = str(input.label, LABEL_MAX[list]);
  if (!label) return fail(400, list === 'question' ? 'Type the question.' : list === 'task' ? 'Say what needs doing.' : 'Give it a name.');
  const detail = list === 'task' || list === 'include' ? String(input.detail ?? '').trim().slice(0, 1000) : '';
  let data: Record<string, unknown> = {};
  if (list === 'question') {
    const shape = cleanQuestionShape(input);
    if (typeof shape === 'string') return fail(400, shape);
    data = shape;
  } else if (list === 'task') {
    const d = input.daysBefore;
    if (d === '' || d == null) data = { daysBefore: null };
    else {
      const n = Number(d);
      if (!Number.isInteger(n) || n < -30 || n > 365) return fail(400, 'Days before the event has to be a whole number from -30 to 365.');
      data = { daysBefore: n };
    }
  }
  return { ok: true, value: { label, detail, data } };
}

function toOwn(r: { id: string; list: string; label: string; detail: string; data: unknown }): OwnItem {
  const d = (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>;
  if (r.list === 'question') {
    const shape = cleanQuestionShape(d);
    return { id: r.id, label: r.label, detail: '', ...(typeof shape === 'string' ? { type: 'text' as QuestionType, choices: [] } : shape) };
  }
  if (r.list === 'task') return { id: r.id, label: r.label, detail: r.detail, daysBefore: typeof d.daysBefore === 'number' ? d.daysBefore : null };
  return { id: r.id, label: r.label, detail: r.detail };
}

/** Every list: built-in items and the course's own. */
export async function courseLists(courseId: string) {
  const rows = await prisma.courseEventListItem.findMany({ where: { courseId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  const own = Object.fromEntries(COURSE_LISTS.map(l => [l, rows.filter(r => r.list === l).map(toOwn)])) as Record<CourseList, OwnItem[]>;
  return { builtIn: BUILT_IN, own };
}

/** Add one of the course's own items to a list. */
export async function addOwnItem(courseId: string, input: Record<string, unknown>): Promise<Result<OwnItem>> {
  if (!isCourseList(input.list)) return fail(400, 'Pick a list.');
  const list = input.list;
  const c = cleanOwnItem(list, input);
  if (!c.ok) return c;
  const count = await prisma.courseEventListItem.count({ where: { courseId, list } });
  if (count >= MAX_OWN_ITEMS) return fail(400, `A list can have up to ${MAX_OWN_ITEMS} of your own items.`);
  const builtIn = (BUILT_IN[list] as { label: string }[]).some(b => b.label.toLowerCase() === c.value.label.toLowerCase());
  const dupe = builtIn || !!(await prisma.courseEventListItem.findFirst({ where: { courseId, list, label: { equals: c.value.label, mode: 'insensitive' } }, select: { id: true } }));
  if (dupe) return fail(409, `“${c.value.label}” is already on this list.`);
  const last = await prisma.courseEventListItem.findFirst({ where: { courseId, list }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const row = await prisma.courseEventListItem.create({ data: { courseId, list, ...c.value, data: c.value.data as object, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  return { ok: true, value: toOwn(row) };
}

/** Change one of the course's own items (never a built-in one). */
export async function editOwnItem(courseId: string, id: string, input: Record<string, unknown>): Promise<Result<OwnItem>> {
  const row = await prisma.courseEventListItem.findFirst({ where: { id, courseId } });
  if (!row || !isCourseList(row.list)) return fail(404, 'That item is gone — refresh the page.');
  const c = cleanOwnItem(row.list, input);
  if (!c.ok) return c;
  const builtIn = (BUILT_IN[row.list] as { label: string }[]).some(b => b.label.toLowerCase() === c.value.label.toLowerCase());
  const dupe = builtIn || !!(await prisma.courseEventListItem.findFirst({ where: { courseId, list: row.list, id: { not: id }, label: { equals: c.value.label, mode: 'insensitive' } }, select: { id: true } }));
  if (dupe) return fail(409, `“${c.value.label}” is already on this list.`);
  const r = await prisma.courseEventListItem.update({ where: { id }, data: { ...c.value, data: c.value.data as object } });
  return { ok: true, value: toOwn(r) };
}

/** Remove one of the course's own items. Events that already use it keep their copy. */
export async function removeOwnItem(courseId: string, id: string): Promise<Result<null>> {
  const r = await prisma.courseEventListItem.deleteMany({ where: { id, courseId } });
  if (!r.count) return fail(404, 'That item is gone — refresh the page.');
  return { ok: true, value: null };
}

// ── One event's notes for staff ────────────────────────────────────────────
export type StaffNote = { id: string; topic: string; note: string };

/** Read the stored notes defensively (it is JSON). */
export function staffNotesOf(raw: unknown): StaffNote[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(n => n && typeof n === 'object' && typeof (n as StaffNote).id === 'string')
    .map(n => ({ id: (n as StaffNote).id, topic: String((n as StaffNote).topic ?? ''), note: String((n as StaffNote).note ?? '') }))
    .slice(0, MAX_STAFF_NOTES);
}

function cleanNote(input: { topic?: unknown; note?: unknown }): Result<{ topic: string; note: string }> {
  const topic = str(input.topic, 80);
  const note = String(input.note ?? '').trim().slice(0, 1000);
  if (!topic && !note) return fail(400, 'Write the note.');
  return { ok: true, value: { topic, note } };
}

/** Pure: a note added, changed or removed. Throws nothing; says what went wrong. */
export function changeNotes(current: StaffNote[], action: 'add' | 'edit' | 'remove', input: { noteId?: unknown; topic?: unknown; note?: unknown }): Result<StaffNote[]> {
  if (action === 'add') {
    if (current.length >= MAX_STAFF_NOTES) return fail(400, `An event can have up to ${MAX_STAFF_NOTES} notes.`);
    const c = cleanNote(input);
    if (!c.ok) return c;
    return { ok: true, value: [...current, { id: randomBytes(6).toString('hex'), ...c.value }] };
  }
  const i = current.findIndex(n => n.id === String(input.noteId ?? ''));
  if (i < 0) return fail(404, 'That note is gone — refresh the page.');
  if (action === 'remove') return { ok: true, value: current.filter((_, j) => j !== i) };
  const c = cleanNote(input);
  if (!c.ok) return c;
  return { ok: true, value: current.map((n, j) => (j === i ? { ...n, ...c.value } : n)) };
}

/** Pure: one event's included items, one added, changed or removed (the same limits as eventFields). */
export function changeIncludes(current: string[], action: 'add' | 'edit' | 'remove', input: { index?: unknown; label?: unknown }): Result<string[]> {
  if (action === 'add') {
    const label = str(input.label, 60);
    if (!label) return fail(400, 'Say what’s included.');
    if (current.length >= 20) return fail(400, 'An event can list up to 20 included items.');
    if (current.some(x => x.toLowerCase() === label.toLowerCase())) return fail(409, `“${label}” is already included.`);
    return { ok: true, value: [...current, label] };
  }
  const i = Number(input.index);
  if (!Number.isInteger(i) || i < 0 || i >= current.length) return fail(404, 'That item is gone — refresh the page.');
  if (action === 'remove') return { ok: true, value: current.filter((_, j) => j !== i) };
  const label = str(input.label, 60);
  if (!label) return fail(400, 'Say what’s included.');
  if (current.some((x, j) => j !== i && x.toLowerCase() === label.toLowerCase())) return fail(409, `“${label}” is already included.`);
  return { ok: true, value: current.map((x, j) => (j === i ? label : x)) };
}
