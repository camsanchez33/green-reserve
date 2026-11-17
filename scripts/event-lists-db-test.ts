// Events lists (Cam 2026-11-17) against a real database: the course adds, edits
// and removes its own items in each built-in list (never a built-in one, never
// another course's), its own checklist steps join a new event's checklist, its
// own kind of event is kept, and an event's staff notes and included items
// change one line at a time. Needs a database. Run: npx tsx scripts/event-lists-db-test.ts
import { PrismaClient } from '@prisma/client';
import { courseLists, addOwnItem, editOwnItem, removeOwnItem, changeNotes, changeIncludes, staffNotesOf, cleanOwnItem, changeEventLines, setIncludes } from '../src/lib/event-lists';
import { cleanQuestionShape } from '../src/lib/event-questions';
import { createEvent, updateEvent } from '../src/lib/course-events';

const prisma = new PrismaClient();
const TAG = 'evlisttest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail && !ok ? ' — ' + detail : ''}`); if (!ok) failed++; };

async function cleanup() {
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  await cleanup();
  const mk = async (n: number) => {
    const op = await prisma.courseOperator.create({ data: { name: 'A', email: `${TAG}${n}@test.local`, password: 'x' } });
    return prisma.course.create({ data: { name: `L${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'T', state: 'NJ', zipCode: '07000', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC' } });
  };
  const a = await mk(1), b = await mk(2);

  // Pure shapes.
  check('a choice question needs two choices', typeof cleanQuestionShape({ type: 'choice', choices: 'S' }) === 'string');
  const shirt = cleanQuestionShape({ type: 'choice', choices: 'S, M, L, M' });
  check('choices typed with commas are split and de-duplicated', typeof shirt !== 'string' && shirt.choices.join() === 'S,M,L', JSON.stringify(shirt));
  check('an unknown type reads as short text with no choices', JSON.stringify(cleanQuestionShape({ type: 'essay', choices: ['a', 'b'] })) === '{"type":"text","choices":[]}');
  check('a step more than a year before is refused', !cleanOwnItem('task', { label: 'x', daysBefore: 400 }).ok);

  // Built-ins and the course's own.
  const l0 = await courseLists(a.id);
  check('built-in lists are returned', l0.builtIn.include.length === 6 && l0.builtIn.task.length === 5 && l0.builtIn.question.length === 5 && l0.builtIn.kind.length === 3);
  check('a new course has none of its own', Object.values(l0.own).every(x => x.length === 0));
  const inc = await addOwnItem(a.id, { list: 'include', label: 'Hot dog at the turn' });
  check('the course adds its own included item', inc.ok);
  check('a built-in item can’t be added again', !(await addOwnItem(a.id, { list: 'include', label: 'range balls' })).ok);
  check('nor one of its own twice', !(await addOwnItem(a.id, { list: 'include', label: 'HOT DOG AT THE TURN' })).ok);
  check('a list that doesn’t exist is refused', !(await addOwnItem(a.id, { list: 'timeline', label: 'x' })).ok);
  const q = await addOwnItem(a.id, { list: 'question', label: 'Cart partner', type: 'choice', choices: ['Walk', 'Ride'] });
  check('the course adds its own question with its answer type', q.ok && q.value.type === 'choice' && q.value.choices?.join() === 'Walk,Ride', JSON.stringify(q));
  const kind = await addOwnItem(a.id, { list: 'kind', label: 'Member night' });
  check('the course adds its own kind of event', kind.ok);
  const step = await addOwnItem(a.id, { list: 'task', label: 'Print the sponsor banners', detail: 'Pro shop printer, 11x17', daysBefore: 3 });
  const step2 = await addOwnItem(a.id, { list: 'task', label: 'Thank-you email', daysBefore: '' });
  check('the course adds its own checklist steps', step.ok && step2.ok && step.ok && step.value.daysBefore === 3 && step2.ok && step2.value.daysBefore === null);

  if (inc.ok) {
    const e = await editOwnItem(a.id, inc.value.id, { label: 'Hot dog and a drink' });
    check('the course edits its own item', e.ok && e.value.label === 'Hot dog and a drink');
    check('another course can’t edit it', !(await editOwnItem(b.id, inc.value.id, { label: 'Hijack' })).ok);
    check('another course can’t remove it', !(await removeOwnItem(b.id, inc.value.id)).ok);
    check('an edit can’t rename it to a built-in item', !(await editOwnItem(a.id, inc.value.id, { label: 'Lunch' })).ok);
  }
  const lb = await courseLists(b.id);
  check('another course sees none of them', Object.values(lb.own).every(x => x.length === 0));
  const la = await courseLists(a.id);
  check('the course sees its own', la.own.include.length === 1 && la.own.question.length === 1 && la.own.kind.length === 1 && la.own.task.length === 2);

  // A new event's checklist: the built-in steps, then the course's own.
  const { event } = await createEvent(a.id, { name: 'Member night', kind: 'other', kindLabel: 'Member night', date: '2031-06-10', format: 'shotgun', startTime: '17:00', holes: 9, payer: 'players' }, 'owner@test.local');
  const tasks = await prisma.courseEventTask.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
  check('the course’s own steps join the checklist after the built-in ones', tasks.length === 7 && tasks[5].label === 'Print the sponsor banners' && tasks[6].label === 'Thank-you email', tasks.map(t => t.label).join(' | '));
  check('…due as many days before as the course said, with its how-to', tasks[5].dueDate === '2031-06-07' && tasks[5].detail === 'Pro shop printer, 11x17' && tasks[6].dueDate === null);
  check('the course’s own kind of event is kept', event.kind === 'other' && event.kindLabel === 'Member night');
  const { event: e2 } = await createEvent(b.id, { name: 'Outing', kind: 'outing', kindLabel: 'ignored', date: '2031-06-10', format: 'shotgun', startTime: '08:00', payer: 'organizer' }, 'owner@test.local');
  check('another course’s event gets only the built-in steps, and a built-in kind keeps no own name', (await prisma.courseEventTask.count({ where: { eventId: e2.id } })) === 5 && e2.kindLabel === '');

  if (step.ok) {
    check('removing its own step', (await removeOwnItem(a.id, step.value.id)).ok);
    check('…leaves the events that already have it alone', (await prisma.courseEventTask.count({ where: { eventId: event.id, label: 'Print the sponsor banners' } })) === 1);
  }

  // One event's notes and included items.
  const n1 = changeNotes([], 'add', { topic: 'Rain plan', note: 'Organizer decides by 6 AM' });
  check('a note is added', n1.ok && n1.value.length === 1 && n1.value[0].topic === 'Rain plan');
  if (n1.ok) {
    const id = n1.value[0].id;
    const n2 = changeNotes(n1.value, 'edit', { noteId: id, topic: 'Rain plan', note: 'Decides by 5:30 AM' });
    check('a note is changed in place', n2.ok && n2.value[0].id === id && n2.value[0].note === 'Decides by 5:30 AM');
    check('an empty note is refused', !changeNotes(n1.value, 'edit', { noteId: id, topic: '', note: '' }).ok);
    check('a note that isn’t there is refused', !changeNotes(n1.value, 'remove', { noteId: 'nope' }).ok);
    const n3 = changeNotes(n1.value, 'remove', { noteId: id });
    check('a note is removed', n3.ok && n3.value.length === 0);
    await prisma.courseEvent.update({ where: { id: event.id }, data: { staffNotes: n1.value } });
    const back = staffNotesOf((await prisma.courseEvent.findUniqueOrThrow({ where: { id: event.id } })).staffNotes);
    check('notes read back from the database', back.length === 1 && back[0].id === id);
  }
  check('stored junk reads as no notes', staffNotesOf('nonsense').length === 0 && staffNotesOf([1, null, { topic: 'x' }]).length === 0);
  const i1 = changeIncludes(['Cart'], 'add', { label: 'Lunch' });
  check('an included item is added', i1.ok && i1.value.join() === 'Cart,Lunch');
  check('…but not twice', !changeIncludes(['Cart'], 'add', { label: 'cart' }).ok);
  const i2 = changeIncludes(['Cart', 'Lunch'], 'edit', { index: 1, was: 'Lunch', label: 'Lunch and a drink' });
  check('an included item is changed', i2.ok && i2.value[1] === 'Lunch and a drink');
  const i3 = changeIncludes(['Cart', 'Lunch', 'Prizes'], 'remove', { index: 0, was: 'Cart' });
  check('an included item is removed', i3.ok && i3.value.join() === 'Lunch,Prizes');
  check('a double tap of remove is refused the second time (the line there is a different one)', i3.ok && !changeIncludes(i3.value, 'remove', { index: 0, was: 'Cart' }).ok);
  check('an edit from a stale page is refused rather than landing on another line', i3.ok && !changeIncludes(i3.value, 'edit', { index: 1, was: 'Lunch', label: 'x' }).ok);
  check('an index that isn’t there is refused', !changeIncludes(['Cart'], 'remove', { index: 3, was: 'Cart' }).ok);

  // Two people at once, and labels with _ or % in them.
  const twice = await Promise.all([1, 2].map(() => addOwnItem(b.id, { list: 'include', label: 'Hot dog' })));
  check('two people adding the same item at once make one row', twice.filter(r => r.ok).length === 1 && (await prisma.courseEventListItem.count({ where: { courseId: b.id, list: 'include', label: 'Hot dog' } })) === 1);
  const many = await Promise.all(Array.from({ length: 60 }, (_, i) => addOwnItem(b.id, { list: 'kind', label: `Kind ${i}` })));
  check('sixty at once stop at the cap of fifty', many.filter(r => r.ok).length === 50 && (await prisma.courseEventListItem.count({ where: { courseId: b.id, list: 'kind' } })) === 50);
  check('“Print banners” and “Print_banners” are different items', (await addOwnItem(b.id, { list: 'task', label: 'Print banners' })).ok && (await addOwnItem(b.id, { list: 'task', label: 'Print_banners' })).ok);
  check('“%” is just a label, not a wildcard', (await addOwnItem(b.id, { list: 'task', label: '%' })).ok);
  check('a blank or true “days before” isn’t a day', cleanOwnItem('task', { label: 'x', daysBefore: ' ' }).ok && (cleanOwnItem('task', { label: 'x', daysBefore: ' ' }) as unknown as { value: { data: { daysBefore: unknown } } }).value.data.daysBefore === null && !cleanOwnItem('task', { label: 'x', daysBefore: true }).ok && !cleanOwnItem('task', { label: 'x', daysBefore: [3] }).ok);
  const st = await addOwnItem(b.id, { list: 'task', label: 'Call the caterer', detail: 'Ask for Sam', daysBefore: 4 });
  if (st.ok) {
    const e = await editOwnItem(b.id, st.value.id, { label: 'Call the caterer again' });
    check('a label-only edit keeps the step’s how-to and due day', e.ok && e.value.detail === 'Ask for Sam' && e.value.daysBefore === 4, JSON.stringify(e));
  }

  // The route's locked changes, through the course.
  await prisma.courseEvent.update({ where: { id: event.id }, data: { includes: ['Cart', 'Lunch', 'Prizes'], staffNotes: [] } });
  const dbl = await Promise.all([1, 2].map(() => changeEventLines(a.id, event.id, 'include_remove', { index: 0, was: 'Cart' })));
  check('a double tap of remove on the event removes one line', dbl.filter(r => r.ok).length === 1 && (await prisma.courseEvent.findUniqueOrThrow({ where: { id: event.id } })).includes.join() === 'Lunch,Prizes');
  const tenNotes = await Promise.all(Array.from({ length: 10 }, (_, i) => changeEventLines(a.id, event.id, 'note_add', { topic: `T${i}`, note: 'n' })));
  check('ten notes added at once are all kept', tenNotes.every(r => r.ok) && staffNotesOf((await prisma.courseEvent.findUniqueOrThrow({ where: { id: event.id } })).staffNotes).length === 10);
  check('another course can’t change the event’s lines', !(await changeEventLines(b.id, event.id, 'includes_set', { includes: ['Hijack'] })).ok);
  const set = await changeEventLines(a.id, event.id, 'includes_set', { includes: [' Cart ', 'cart', '', 'Beverage cart'] });
  check('the whole included list can be set, cleaned and de-duplicated', set.ok && (await prisma.courseEvent.findUniqueOrThrow({ where: { id: event.id } })).includes.join() === 'Cart,Beverage cart');
  check('…but not to more than 20 or to something that isn’t a list', !setIncludes(Array.from({ length: 21 }, (_, i) => `I${i}`)).ok && !setIncludes('Cart').ok);

  // Saving the event without the fields the page now edits elsewhere keeps them.
  await prisma.courseEvent.update({ where: { id: event.id }, data: { includes: ['Cart', 'Lunch'], notes: 'Old note' } });
  await updateEvent(a.id, event.id, { name: 'Member night', kind: 'other', date: '2031-06-10', format: 'shotgun', startTime: '17:00', holes: 9, payer: 'players' });
  const kept = await prisma.courseEvent.findUniqueOrThrow({ where: { id: event.id } });
  check('a save that leaves out the own kind, included items and notes keeps them', kept.kindLabel === 'Member night' && kept.includes.join() === 'Cart,Lunch' && kept.notes === 'Old note', JSON.stringify(kept));

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
  console.log('\nALL PASSED');
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
