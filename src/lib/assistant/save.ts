// ASSIST-1: Settings → Assistant writes, each with its CourseSettingChange row in the same transaction. Every query is
// scoped by the courseId the route took from the signed-in session; a note id from another course matches nothing.
import { prisma } from '../prisma';
import type { SettingActor } from '../booking-look-save';
import { MAX_NOTES, type SettingsPatch, type NoteAudience } from './settings';

export type { SettingActor };

const audit = (courseId: string, actor: SettingActor, field: string, before: string, after: string) => ({
  courseId, actorType: actor.type, actorId: actor.id, actorName: actor.name.slice(0, 120), field, before: before.slice(0, 1000), after: after.slice(0, 1000),
});
const str = (v: unknown) => (Array.isArray(v) ? v.join(',') : String(v ?? ''));

/** The actor comes from the signed-in login's own row, never from the request. */
export async function actorFor(session: { isStaff: boolean; staffId?: string | null; operatorId?: string | null }): Promise<SettingActor> {
  const me = session.isStaff
    ? await prisma.courseStaff.findUnique({ where: { id: session.staffId ?? '' }, select: { name: true } })
    : await prisma.courseOperator.findUnique({ where: { id: session.operatorId ?? '' }, select: { name: true } });
  return session.isStaff ? { type: 'staff', id: session.staffId ?? '', name: me?.name ?? '' } : { type: 'operator', id: session.operatorId ?? '', name: me?.name ?? '' };
}

const FIELDS = ['assistantStaffOn', 'assistantGolferOn', 'assistantTone', 'assistantGolferTopics', 'assistantUnknownLine', 'assistantGolferDailyLimit'] as const;

/** Save what changed; one audit row per changed field. Null = no such course. */
export async function saveAssistantSettings(courseId: string, patch: SettingsPatch, actor: SettingActor) {
  return prisma.$transaction(async tx => {
    const before = await tx.course.findUnique({ where: { id: courseId }, select: Object.fromEntries(FIELDS.map(f => [f, true])) as Record<typeof FIELDS[number], true> });
    if (!before) return null;
    const changes = FIELDS.filter(f => f in patch && str(patch[f]) !== str(before[f]));
    if (changes.length) {
      await tx.course.update({ where: { id: courseId }, data: Object.fromEntries(changes.map(f => [f, patch[f]])) });
      await tx.courseSettingChange.createMany({ data: changes.map(f => audit(courseId, actor, f, str(before[f]), str(patch[f]))) });
    }
    return { changed: changes.length };
  });
}

export type NoteInput = { question: string; answer: string; audience: NoteAudience };

export async function addNote(courseId: string, input: NoteInput, actor: SettingActor) {
  return prisma.$transaction(async tx => {
    const count = await tx.courseAssistantNote.count({ where: { courseId } });
    if (count >= MAX_NOTES) return { error: `A course can keep ${MAX_NOTES} notes. Remove one first.` } as const;
    const last = await tx.courseAssistantNote.findFirst({ where: { courseId }, orderBy: { position: 'desc' }, select: { position: true } });
    const note = await tx.courseAssistantNote.create({ data: { courseId, ...input, position: (last?.position ?? -1) + 1 }, select: { id: true, question: true, answer: true, audience: true } });
    await tx.courseSettingChange.create({ data: audit(courseId, actor, `assistantNote:${note.id}`, '', `${input.audience}: ${input.question} — ${input.answer}`) });
    return { note } as const;
  });
}

/** Null = not this course's note. */
export async function updateNote(courseId: string, id: string, input: NoteInput, actor: SettingActor) {
  return prisma.$transaction(async tx => {
    const before = await tx.courseAssistantNote.findFirst({ where: { id, courseId }, select: { question: true, answer: true, audience: true } });
    if (!before) return null;
    const note = await tx.courseAssistantNote.update({ where: { id }, data: input, select: { id: true, question: true, answer: true, audience: true } });
    await tx.courseSettingChange.create({ data: audit(courseId, actor, `assistantNote:${id}`, `${before.audience}: ${before.question} — ${before.answer}`, `${input.audience}: ${input.question} — ${input.answer}`) });
    return note;
  });
}

/** False = not this course's note. */
export async function deleteNote(courseId: string, id: string, actor: SettingActor): Promise<boolean> {
  return prisma.$transaction(async tx => {
    const before = await tx.courseAssistantNote.findFirst({ where: { id, courseId }, select: { question: true, answer: true, audience: true } });
    if (!before) return false;
    await tx.courseAssistantNote.deleteMany({ where: { id, courseId } });
    await tx.courseSettingChange.create({ data: audit(courseId, actor, `assistantNote:${id}`, `${before.audience}: ${before.question} — ${before.answer}`, '') });
    return true;
  });
}

export function listNotes(courseId: string) {
  return prisma.courseAssistantNote.findMany({ where: { courseId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], select: { id: true, question: true, answer: true, audience: true } });
}
