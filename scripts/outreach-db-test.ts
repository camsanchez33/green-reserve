// Inquiries data (Cam 2026-11-17): the outreach pipeline against a real database — add a course with the
// duplicate check, contacts and the mirrored primary contact, stages on the Outreach tab, Said yes and Not
// now, CSV import, call notes and logging, the Calls tab, the Cal.com webhook matching a course in outreach
// by a contact's email, and the public-listing search with a stubbed fetch. Needs a database.
// Run: npx tsx scripts/outreach-db-test.ts
import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import {
  addCourse, addContact, updateContact, deleteContact, listOutreach, outreachCourse, saidYes, notNow, importPreview, importCommit,
  updateFacts, listCalls, callDetail, saveCallNotes, logOutreachCall, deleteTouch,
} from '../src/lib/outreach-server';
import { lookupCourses } from '../src/lib/course-lookup';
import { AGENDA } from '../src/lib/inquiry-call';
import { NOT_NOW_REASON } from '../src/lib/outreach';
import { WIPED_TABLES } from '../src/lib/data-reset';

const prisma = new PrismaClient();
const TAG = 'outreachdbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); if (!ok) failed++; };
const ADMIN = 'Test Admin';
const full = { canSeeContactDetails: true };
const viewerOnly = { canSeeContactDetails: false };

async function cleanup() {
  await prisma.courseInquiry.deleteMany({ where: { courseName: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'osm-lookup:' } } });
}

async function main() {
  await cleanup();
  check('CourseContact is in WIPED_TABLES', (WIPED_TABLES as readonly string[]).includes('CourseContact'));

  // ── Add a course ──
  const a = await addCourse({ facts: { courseName: `${TAG} Maple Run Golf Course`, city: 'Riverton', state: 'NY', holes: 18, ownerType: 'town', website: 'maplerun-test.example.com' }, contact: { name: 'Dana Whitfield', role: 'Pro shop manager', email: 'dana@maplerun-test.example.com', phone: '(555) 010-2201' }, notes: 'Town budget year starts Jan 1.' }, ADMIN);
  check('add: a course with name and town is added', a.ok);
  if (!a.ok) throw new Error('cannot continue');
  const id = a.id;
  const inq = await prisma.courseInquiry.findUniqueOrThrow({ where: { id }, include: { contacts: true, events: true } });
  check('add: it is a lead (in outreach), source Cold outreach', inq.status === 'lead' && inq.source === 'Cold outreach');
  check('add: the contact is a CourseContact and mirrored on the inquiry', inq.contacts.length === 1 && inq.contactName === 'Dana Whitfield' && inq.email === 'dana@maplerun-test.example.com' && inq.firstName === 'Dana');
  check('add: the note and the event are written', inq.adminNotes.includes('Town budget') && inq.events.some(e => e.actorName === `Added to Targets by ${ADMIN}`));
  const noTown = await addCourse({ facts: { courseName: `${TAG} X` } }, ADMIN);
  check('add: no town → 400', !noTown.ok && noTown.status === 400);
  const dup = await addCourse({ facts: { courseName: `${TAG} Maple Run GC`, city: 'riverton' } }, ADMIN);
  check('add: the same course again → 409 duplicate with the match', !dup.ok && dup.status === 409 && (dup.duplicates as { id: string }[])[0]?.id === id, dup);
  const dupWeb = await addCourse({ facts: { courseName: `${TAG} Other Name`, city: 'Elsewhere', website: 'https://www.maplerun-test.example.com/book' } }, ADMIN);
  check('add: same website → 409', !dupWeb.ok && dupWeb.status === 409);
  // A live course on GreenReserve with the same name and town is a duplicate too; a test course is not.
  const op = await prisma.courseOperator.create({ data: { name: 'T', email: `${TAG}@test.local`, password: 'x' } });
  await prisma.course.create({ data: { name: `${TAG} Stone Bridge`, slug: `${TAG}-sb`, operatorId: op.id, address: '1', city: 'Millbrook', state: 'NJ', zipCode: '07000', holes: 9, timezone: 'America/New_York' } });
  await prisma.course.create({ data: { name: `${TAG} Test Only`, slug: `${TAG}-t`, operatorId: op.id, address: '1', city: 'Testville', state: 'NJ', zipCode: '07000', holes: 9, timezone: 'America/New_York', isTest: true } });
  const dupCourse = await addCourse({ facts: { courseName: `${TAG} Stone Bridge Links`, city: 'Millbrook', state: 'NJ' } }, ADMIN);
  check('add: a course already on GreenReserve → 409, kind course', !dupCourse.ok && (dupCourse.duplicates as { kind: string }[])[0]?.kind === 'course');
  const testOk = await addCourse({ facts: { courseName: `${TAG} Test Only`, city: 'Testville', state: 'NJ' } }, ADMIN);
  check('add: a test course does not count as on GreenReserve', testOk.ok);
  const forced = await addCourse({ facts: { courseName: `${TAG} Maple Run GC`, city: 'Riverton' }, confirmDuplicate: true }, ADMIN);
  check('add: confirmDuplicate adds it anyway', forced.ok);
  if (forced.ok) await prisma.courseInquiry.delete({ where: { id: forced.id } });

  // ── Contacts ──
  const c2 = await addContact(id, { name: 'Chris Alder', role: 'Parks & Recreation director', email: 'chris@maplerun-test.example.com', decisionMaker: true, preferredChannel: 'email', bestTime: 'Mornings' });
  check('contact: added', c2.ok);
  const mirrored = await prisma.courseInquiry.findUniqueOrThrow({ where: { id } });
  check('contact: the decision maker becomes the mirrored contact', mirrored.contactName === 'Chris Alder' && mirrored.email === 'chris@maplerun-test.example.com' && mirrored.contactTitle === 'Parks & Recreation director');
  const badC = await addContact(id, { name: 'X', email: 'nope' });
  check('contact: a bad email → 400', !badC.ok && badC.status === 400);
  if (c2.ok) {
    const e = await updateContact(id, c2.contact.id, { bestTime: 'Weekdays 2–4 PM' });
    check('contact: a partial edit keeps the rest', e.ok && e.contact.bestTime === 'Weekdays 2–4 PM' && e.contact.email === 'chris@maplerun-test.example.com');
    const wrong = await updateContact(forced.ok ? forced.id : 'nope', c2.contact.id, { name: 'X' });
    check('contact: editing through another course → 404', !wrong.ok && wrong.status === 404);
  }
  const page = await outreachCourse(id, full);
  check('course page: decision maker first', page?.contacts[0]?.name === 'Chris Alder' && page?.contacts.length === 2, page?.contacts);
  const pageViewer = await outreachCourse(id, viewerOnly);
  check('course page: a viewer gets no emails, phones or notes', pageViewer!.contacts.every(c => c.email === '' && c.phone === '') && pageViewer!.notes === null && page!.notes?.includes('Town budget') === true);
  check('course page: Email 1 due, stage Targets, kind', page?.statusLabel === 'Targets' && page?.emails[0].dueAt !== null && page?.kind === 'Town course · 18 holes', page);
  const facts = await updateFacts(id, { season: 'Apr – Nov', roundsPerYear: '24000', hasRange: true });
  check('facts: edited, only the keys sent', facts.ok && facts.facts.season === 'Apr – Nov' && facts.facts.roundsPerYear === 24000 && facts.facts.city === 'Riverton' && Object.keys(facts.after).sort().join() === 'hasRange,roundsPerYear,season');
  const badFacts = await updateFacts(id, { holes: -1 });
  check('facts: a bad value → 400', !badFacts.ok && badFacts.status === 400);

  // A lead added the old way (no CourseContact rows) shows its inquiry contact, marked.
  const old = await prisma.courseInquiry.create({ data: { status: 'lead', courseName: `${TAG} Old Lead`, contactName: 'Old Contact', contactTitle: 'Owner', email: 'old@example.com', phone: '', address: '', city: 'Oldtown', state: 'NY', zipCode: '', courseType: '', lookingFor: [] } });
  const oldPage = await outreachCourse(old.id, full);
  check('course page: an older lead shows its inquiry contact, marked fromInquiry', oldPage?.contacts.length === 1 && (oldPage.contacts[0] as { fromInquiry?: boolean }).fromInquiry === true);
  // Editing an older lead's inquiry-row contact replaces it (no seed), and the inquiry takes the new email.
  const edited = await prisma.courseInquiry.create({ data: { status: 'lead', courseName: `${TAG} Edited Lead`, contactName: 'Old Name', contactTitle: 'GM', email: 'old.email@example.com', phone: '555-0101', address: '', city: 'Edittown', state: 'NY', zipCode: '', courseType: '', lookingFor: [] } });
  const rep = await addContact(edited.id, { name: 'New Name', role: 'GM', email: 'new.email@example.com', replacesInquiryContact: true });
  const editedRows = await prisma.courseContact.findMany({ where: { inquiryId: edited.id } });
  const editedInq = await prisma.courseInquiry.findUniqueOrThrow({ where: { id: edited.id } });
  check('contact: replacesInquiryContact replaces the inquiry-row contact and its email', rep.ok && editedRows.length === 1 && editedInq.email === 'new.email@example.com' && editedInq.contactName === 'New Name', { editedRows, editedInq });
  // Two first saves at once on an older lead seed it once.
  const racy = await prisma.courseInquiry.create({ data: { status: 'lead', courseName: `${TAG} Racy Lead`, contactName: 'Pat Race', contactTitle: '', email: 'race@example.com', phone: '', address: '', city: 'Racetown', state: 'NY', zipCode: '', courseType: '', lookingFor: [] } });
  await Promise.all([addContact(racy.id, { name: 'A One' }), addContact(racy.id, { name: 'B Two' })]);
  check('contact: two first saves at once copy the inquiry contact once', (await prisma.courseContact.count({ where: { inquiryId: racy.id, name: 'Pat Race' } })) === 1 && (await prisma.courseContact.count({ where: { inquiryId: racy.id } })) === 3);
  const seeded = await prisma.courseInquiry.create({ data: { status: 'lead', courseName: `${TAG} Seeded Lead`, contactName: 'Pat GM', contactTitle: 'GM', email: 'pat.gm@example.com', phone: '555-0100', address: '', city: 'Seedtown', state: 'NY', zipCode: '', courseType: '', lookingFor: [] } });
  const addSam = await addContact(seeded.id, { name: 'Sam Pro', role: 'Head pro' });
  const seededRows = await prisma.courseContact.findMany({ where: { inquiryId: seeded.id }, orderBy: { sortOrder: 'asc' } });
  const seededInq = await prisma.courseInquiry.findUniqueOrThrow({ where: { id: seeded.id } });
  check('contact: adding to an older lead keeps its inquiry contact as the first contact', addSam.ok && seededRows.length === 2 && seededRows[0].name === 'Pat GM' && seededRows[0].email === 'pat.gm@example.com' && seededInq.email === 'pat.gm@example.com' && seededInq.phone === '555-0100', { seededRows, seededInq });
  // Said yes when the only email belongs to someone other than the decision maker: Onboarding gets that person.
  const split = await prisma.courseInquiry.create({ data: { status: 'lead', courseName: `${TAG} Split`, contactName: '', contactTitle: '', email: '', phone: '', address: '', city: 'Splitton', state: 'NY', zipCode: '', courseType: '', lookingFor: [] } });
  await addContact(split.id, { name: 'Dee Maker', decisionMaker: true });
  await addContact(split.id, { name: 'Shop Clerk', role: 'Clerk', email: 'clerk@example.com', phone: '555-0199' });
  const splitYes = await saidYes(split.id, ADMIN);
  const splitInq = await prisma.courseInquiry.findUniqueOrThrow({ where: { id: split.id } });
  check('said yes: the email and the name come from the same contact', splitYes.ok && splitInq.email === 'clerk@example.com' && splitInq.contactName === 'Shop Clerk' && splitInq.phone === '555-0199', splitInq);

  // ── Stages on the Outreach tab ──
  const now = new Date();
  const mk = async (name: string) => (await prisma.courseInquiry.create({ data: { status: 'lead', courseName: `${TAG} ${name}`, contactName: '', contactTitle: '', email: '', phone: '', address: '', city: 'T', state: 'NY', zipCode: '', courseType: '', lookingFor: [] } })).id;
  const contacted = await mk('Contacted');
  await prisma.outreachTouch.create({ data: { inquiryId: contacted, at: new Date(now.getTime() - 2 * 86_400_000), channel: 'email', direction: 'out' } });
  const replied = await mk('Replied');
  await prisma.outreachTouch.create({ data: { inquiryId: replied, at: new Date(now.getTime() - 3 * 86_400_000), channel: 'email', direction: 'out' } });
  await prisma.outreachTouch.create({ data: { inquiryId: replied, at: new Date(now.getTime() - 3600_000), channel: 'email', direction: 'in' } });
  const booked = await mk('Booked');
  const futureCall = await prisma.call.create({ data: { kind: 'discovery', inquiryId: booked, scheduledAt: new Date(now.getTime() + 2 * 86_400_000), attendeeName: 'Morgan Hale', attendeeEmail: 'morgan@example.com', meetingUrl: 'https://cal.example.com/video/abc', agendaJson: JSON.stringify(['booking_today', 'people']) } });
  const board = await listOutreach(now);
  const where = (cid: string) => board.stages.find(s => s.rows.some(r => r.id === cid))?.key;
  check('board: target / contacted / replied / call', where(id) === 'target' && where(contacted) === 'contacted' && where(replied) === 'replied' && where(booked) === 'call', board.stages.map(s => [s.key, s.rows.map(r => r.courseName)]));
  const repliedRow = board.stages.find(s => s.key === 'replied')!.rows.find(r => r.id === replied)!;
  check('board: replied row says Answer their reply, due, last "Replied · …"', repliedRow.next.key === 'answer_reply' && repliedRow.next.due && repliedRow.last.startsWith('Replied · '), repliedRow);

  // ── Calls ──
  const calls = await listCalls(full, now);
  const up = calls.upcoming.find(c => c.id === futureCall.id);
  check('calls: the booked call is upcoming, with who and prep', !!up && up.who.name === 'Morgan Hale' && up.prepReady && up.stage === 'Call booked', up);
  const viewerCalls = await listCalls(viewerOnly, now);
  check('calls: a viewer gets no email', viewerCalls.upcoming.find(c => c.id === futureCall.id)?.who.email === '');
  const det = await callDetail(futureCall.id, full, now);
  check('call detail: the agenda is inquiry-call.ts AGENDA, with the call\'s items marked', det?.agenda.length === AGENDA.length && det.agenda.filter(x => x.onAgenda).map(x => x.key).sort().join() === 'booking_today,people', det?.agenda);
  check('call detail: Join link and who', det?.joinUrl === 'https://cal.example.com/video/abc' && det?.who.name === 'Morgan Hale');
  const saved = await saveCallNotes(futureCall.id, { agendaNotes: { booking_today: 'Phone line only, misses calls on weekends.' }, notes: 'Good call.' });
  check('call notes: saved', saved.ok);
  await Promise.all([
    saveCallNotes(futureCall.id, { agendaNotes: { green_fees: '$32–$48.' } }),
    saveCallNotes(futureCall.id, { agendaNotes: { tee_times: '8-minute gaps.' } }),
  ]);
  const bothNotes = await prisma.call.findUniqueOrThrow({ where: { id: futureCall.id } });
  check('call notes: two saves at once both keep their note', bothNotes.answersJson.includes('$32–$48.') && bothNotes.answersJson.includes('8-minute gaps.') && bothNotes.answersJson.includes('Phone line only'));
  const badNote = await saveCallNotes(futureCall.id, { agendaNotes: { not_a_key: 'x' } });
  check('call notes: an unknown agenda item → 400', !badNote.ok && badNote.status === 400);
  const det2 = await callDetail(futureCall.id, full, now);
  check('call notes: the note reads back on its agenda item', det2?.agenda.find(x => x.key === 'booking_today')?.note === 'Phone line only, misses calls on weekends.' && det2?.notes === 'Good call.');
  const detV = await callDetail(futureCall.id, viewerOnly, now);
  check('call detail: a viewer gets no notes, Join or Cal.com links', detV?.notes === null && detV?.joinUrl === null && detV?.calcom === null && detV?.agenda.every(x => x.note === '' && x.captured === null) && detV?.who.email === '', detV);
  const early = await logOutreachCall(futureCall.id, { result: 'said_yes' }, ADMIN);
  check('log: a call two days out cannot be logged yet', !early.ok && early.status === 400);
  // Move it to an hour ago, then log Said yes: the lead (no email anywhere) is refused first.
  await prisma.call.update({ where: { id: futureCall.id }, data: { scheduledAt: new Date(now.getTime() - 3600_000) } });
  const noEmail = await logOutreachCall(futureCall.id, { result: 'said_yes' }, ADMIN);
  check('log: said yes with no email anywhere → 400 email_needed, call not logged', !noEmail.ok && noEmail.code === 'email_needed' && (await prisma.call.findUniqueOrThrow({ where: { id: futureCall.id } })).outcome === 'scheduled');
  const badEmail = await logOutreachCall(futureCall.id, { result: 'said_yes', email: 'bob@' }, ADMIN);
  check('log: said yes with a bad email → 400 and the call is not logged', !badEmail.ok && badEmail.status === 400 && (await prisma.call.findUniqueOrThrow({ where: { id: futureCall.id } })).outcome === 'scheduled');
  const yes = await logOutreachCall(futureCall.id, { result: 'said_yes', email: 'morgan@example.com', nextStep: 'Send the setup sheet', agendaNotes: { people: 'Morgan signs.' } }, ADMIN);
  check('log: said yes logs the call and hands to Onboarding', yes.ok && yes.handoff?.ok === true, yes);
  const afterYes = await prisma.courseInquiry.findUniqueOrThrow({ where: { id: booked }, include: { calls: true, events: true } });
  check('log: lead → in_review with the email, call talked/said_yes', afterYes.status === 'in_review' && afterYes.email === 'morgan@example.com' && afterYes.calls[0].outcome === 'talked' && afterYes.calls[0].result === 'said_yes' && afterYes.calls[0].nextStep === 'Send the setup sheet');
  check('log: the per-item notes are kept', afterYes.calls[0].answersJson.includes('Morgan signs.') && afterYes.calls[0].answersJson.includes('Phone line only'));
  check('log: the handoff event', afterYes.events.some(e => e.fromStatus === 'lead' && e.toStatus === 'in_review' && e.actorName?.startsWith('Said yes → Onboarding')));
  const again = await logOutreachCall(futureCall.id, { result: 'no_answer' }, ADMIN);
  check('log: a call is logged once', !again.ok && again.status === 409);
  const calls2 = await listCalls(full, now);
  check('calls: the logged call is in Past, labelled', calls2.past.find(c => c.id === futureCall.id)?.resultLabel === 'Said yes → Onboarding');
  const board2 = await listOutreach(now);
  check('board: the said-yes course left outreach and counts this month', !board2.stages.some(s => s.rows.some(r => r.id === booked)) && board2.saidYesThisMonth >= 1);

  // Follow up and Not now from a call.
  const fuCall = await prisma.call.create({ data: { kind: 'discovery', inquiryId: replied, scheduledAt: new Date(now.getTime() - 3600_000) } });
  const noDate = await logOutreachCall(fuCall.id, { result: 'follow_up' }, ADMIN);
  check('log: follow up needs a date', !noDate.ok && noDate.status === 400);
  const fuAt = new Date(now.getTime() + 10 * 86_400_000).toISOString();
  const fu = await logOutreachCall(fuCall.id, { result: 'follow_up', followUpAt: fuAt, nextStep: 'Send town board one-pager' }, ADMIN);
  check('log: follow up sets the course\'s follow-up date', fu.ok && (await prisma.courseInquiry.findUniqueOrThrow({ where: { id: replied } })).nextFollowUpAt?.toISOString() === fuAt);
  const fuEvent = await prisma.inquiryStatusEvent.findFirst({ where: { inquiryId: replied, actorName: { startsWith: 'Call logged' } }, orderBy: { createdAt: 'desc' } });
  check('log: the timeline says how it went, not the next step (viewers read it)', !!fuEvent && !fuEvent.actorName!.includes('one-pager'), fuEvent);
  // Undo a mis-logged touch.
  const oops = await prisma.outreachTouch.create({ data: { inquiryId: replied, at: new Date(now.getTime() - 60_000), channel: 'email', direction: 'out' } });
  const wrongCourse = await deleteTouch(id, oops.id, ADMIN);
  check('touch: removing it through another course → 404', !wrongCourse.ok && wrongCourse.status === 404);
  const undo = await deleteTouch(replied, oops.id, ADMIN);
  check('touch: removed, and the timeline says so', undo.ok && !(await prisma.outreachTouch.findUnique({ where: { id: oops.id } })) && (await prisma.inquiryStatusEvent.count({ where: { inquiryId: replied, actorName: { startsWith: 'Removed a logged email' } } })) === 1);
  const nnCall = await prisma.call.create({ data: { kind: 'discovery', inquiryId: contacted, scheduledAt: new Date(now.getTime() - 3600_000) } });
  const badRecheck = await logOutreachCall(nnCall.id, { result: 'not_now', recheckAt: '2020-01-01' }, ADMIN);
  check('log: not now with a past recheck → 400 and the call is not logged', !badRecheck.ok && (await prisma.call.findUniqueOrThrow({ where: { id: nnCall.id } })).outcome === 'scheduled');
  const recheck = new Date(now.getTime() + 100 * 86_400_000).toISOString();
  const nn = await logOutreachCall(nnCall.id, { result: 'not_now', recheckAt: recheck }, ADMIN);
  const afterNn = await prisma.courseInquiry.findUniqueOrThrow({ where: { id: contacted } });
  check('log: not now closes it with the reason and recheck date', nn.ok && afterNn.status === 'rejected' && afterNn.closedReason === NOT_NOW_REASON && afterNn.nextFollowUpAt?.toISOString() === recheck);
  const board3 = await listOutreach(now);
  check('board: Not now list has it with the recheck date', board3.notNow.find(r => r.id === contacted)?.recheckAt === recheck);

  // Said yes / Not now from the course page.
  const noEmailYes = await saidYes(await mk('NoEmail'), ADMIN);
  check('said yes: no email anywhere → 400', !noEmailYes.ok && noEmailYes.status === 400);
  const yes2 = await saidYes(id, ADMIN);
  check('said yes: uses the decision maker\'s email', yes2.ok && (await prisma.courseInquiry.findUniqueOrThrow({ where: { id } })).email === 'chris@maplerun-test.example.com');
  const yes3 = await saidYes(id, ADMIN);
  check('said yes: twice → 409', !yes3.ok && yes3.status === 409);
  const c3 = await addContact(id, { name: 'After Handoff', email: 'late@example.com', decisionMaker: true });
  check('contacts after Said yes do not overwrite Onboarding\'s contact', c3.ok && (await prisma.courseInquiry.findUniqueOrThrow({ where: { id } })).contactName === 'Chris Alder');
  const nn2 = await notNow(old.id, ADMIN, '', 'Happy with current system.');
  const oldAfter = await prisma.courseInquiry.findUniqueOrThrow({ where: { id: old.id } });
  check('not now: no recheck date is fine; the note is kept', nn2.ok && oldAfter.closedReason === NOT_NOW_REASON && oldAfter.nextFollowUpAt === null && oldAfter.adminNotes.includes('Happy with current system.'));
  const nn3 = await notNow(old.id, ADMIN);
  check('not now: on a closed course → 409', !nn3.ok && nn3.status === 409);
  if (c2.ok) {
    const del = await deleteContact(id, c2.contact.id);
    check('contact: deleted', del.ok && !(await prisma.courseContact.findUnique({ where: { id: c2.contact.id } })));
  }

  // ── CSV import ──
  const csv = [
    'name,town,website,phone,holes,owned by,contact name,role,email,phone',
    `${TAG} Ashgrove Links,"Ashgrove, NY",,,18,County,Pat Lee,Head pro,pat@example.com,(555) 010-2222`,
    `${TAG} Maple Run,Riverton,,,,,,,,`,
    `${TAG} Kingsbury Muni,Kingsbury,,,9,Town or village,,,,`,
    `${TAG} Kingsbury Municipal,Kingsbury,,,,,,,,`,
    `,Nowhere,,,,,,,,`,
  ].join('\n');
  const pv = await importPreview(csv);
  const checks = pv.ok ? pv.rows.map(r => r.check) : [];
  check('import preview: new, duplicate (on list), new, duplicate (in file), invalid', checks.join() === 'new,duplicate,new,duplicate,invalid', pv);
  const before = await prisma.courseInquiry.count({ where: { courseName: { startsWith: TAG } } });
  const commit = await importCommit(csv, ADMIN);
  const after = await prisma.courseInquiry.count({ where: { courseName: { startsWith: TAG } } });
  check('import commit: only the two new rows are added', commit.ok && commit.added === 2 && after - before === 2, commit);
  const ash = await prisma.courseInquiry.findFirst({ where: { courseName: `${TAG} Ashgrove Links` }, include: { contacts: true } });
  check('import commit: facts and contact land', ash?.state === 'NY' && ash.ownerType === 'county' && ash.contacts[0]?.email === 'pat@example.com' && ash.status === 'lead');
  const commit2 = await importCommit(csv, ADMIN);
  check('import commit: running it again adds nothing', commit2.ok && commit2.added === 0);

  // ── Cal.com webhook: a course in outreach books on the plain link with a contact's email ──
  process.env.CALCOM_WEBHOOK_SECRET = 'outreach-test-secret';
  const target = await mk('Webhook Lead');
  await prisma.courseContact.create({ data: { inquiryId: target, name: 'Robin Shaw', role: 'Head pro', email: 'robin.webhook@example.com' } });
  const { POST } = await import('../src/app/api/calcom/webhook/route');
  const send = async (body: object) => {
    const raw = JSON.stringify(body);
    const sig = createHmac('sha256', 'outreach-test-secret').update(raw).digest('hex');
    return POST(new NextRequest('http://localhost/api/calcom/webhook', { method: 'POST', body: raw, headers: { 'x-cal-signature-256': sig, 'content-type': 'application/json' } }));
  };
  const start = new Date(now.getTime() + 3 * 86_400_000);
  const uid = `${TAG}-uid-1`;
  const res = await send({ triggerEvent: 'BOOKING_CREATED', payload: { uid, startTime: start.toISOString(), endTime: new Date(start.getTime() + 30 * 60_000).toISOString(), attendees: [{ name: 'Robin Shaw', email: 'Robin.Webhook@example.com' }], videoCallData: { url: 'https://app.cal.com/video/xyz' } } });
  const wcall = await prisma.call.findFirst({ where: { createdBy: `calcom:${uid}` } });
  check('webhook: answered 200', res.status === 200);
  check('webhook: the call lands on the lead (matched by a contact email), with who and the link', wcall?.inquiryId === target && wcall.attendeeEmail === 'robin.webhook@example.com' && wcall.attendeeName === 'Robin Shaw' && wcall.meetingUrl === 'https://app.cal.com/video/xyz', wcall);
  check('webhook: no second inquiry was opened', (await prisma.courseInquiry.count({ where: { email: { equals: 'robin.webhook@example.com', mode: 'insensitive' } } })) === 0);
  check('webhook: the lead is now Call booked', (await listOutreach(now)).stages.find(s => s.key === 'call')!.rows.some(r => r.id === target));
  await prisma.call.deleteMany({ where: { createdBy: `calcom:${uid}` } });
  // A lead whose contact also filled in the public form: the open inquiry wins, as before, and no third one opens.
  const both = await mk('Both Lead');
  await prisma.courseContact.create({ data: { inquiryId: both, name: 'Lee Both', email: 'both@example.com' } });
  const pending = await prisma.courseInquiry.create({ data: { status: 'pending', courseName: `${TAG} Both Pending`, contactName: 'Lee Both', contactTitle: '', email: 'both@example.com', phone: '', address: '', city: 'T', state: 'NY', zipCode: '', courseType: '', lookingFor: [] } });
  const uid2 = `${TAG}-uid-2`;
  await send({ triggerEvent: 'BOOKING_CREATED', payload: { uid: uid2, startTime: start.toISOString(), endTime: new Date(start.getTime() + 30 * 60_000).toISOString(), attendees: [{ name: 'Lee Both', email: 'both@example.com' }], location: 'https://evil.example.com/' } });
  const call2 = await prisma.call.findFirst({ where: { createdBy: `calcom:${uid2}` } });
  check('webhook: lead + open inquiry with the same email → the open inquiry gets the call', call2?.inquiryId === pending.id, call2);
  check('webhook: no third inquiry opened', (await prisma.courseInquiry.count({ where: { email: 'both@example.com' } })) === 1);
  check('webhook: a free-form location is never the Join link', call2?.meetingUrl === null);
  await prisma.call.deleteMany({ where: { createdBy: `calcom:${uid2}` } });
  // The booking page answers for a lead invited with "Send Cal.com link".
  const tokLead = await mk('Token Lead');
  const tok = 'a'.repeat(47) + 'b';
  await prisma.courseInquiry.update({ where: { id: tokLead }, data: { callInviteToken: tok, callInviteExpiresAt: new Date(now.getTime() + 7 * 86_400_000) } });
  const callRoute = await import('../src/app/api/call/[token]/route');
  const tr = await callRoute.GET(new NextRequest(`http://localhost/api/call/${tok}`, { headers: { 'x-forwarded-for': '203.0.113.9' } }), { params: Promise.resolve({ token: tok }) });
  check('booking page: a lead with a live invite is not "expired"', tr.status === 200, tr.status);
  await prisma.rateLimit.deleteMany({ where: { key: { contains: '203.0.113.9' } } });

  // ── Public listing search (stubbed fetch; the real one is never called here) ──
  let calledWith = '';
  let ua = '';
  const fake = (async (url: string, init?: RequestInit) => {
    calledWith = String(url); ua = String((init?.headers as Record<string, string>)['User-Agent']);
    return new Response(JSON.stringify([
      { osm_type: 'way', osm_id: 1, lat: '40', lon: '-73', category: 'leisure', type: 'golf_course', name: 'Brookfield Hills Golf Course', address: { town: 'Brookfield', 'ISO3166-2-lvl4': 'US-CT' } },
      { osm_type: 'node', osm_id: 2, lat: '40', lon: '-73', category: 'amenity', type: 'cafe', name: 'Brookfield Cafe', address: {} },
    ]), { status: 200 });
  }) as unknown as typeof fetch;
  const look = await lookupCourses('Brookfield Hills', 'Brookfield, CT', 'admin-test', fake);
  check('search: only golf courses come back, with public facts', look.ok && look.results.length === 1 && look.results[0].state === 'CT' && look.results[0].osmRef === 'osm:way/1', look);
  check('search: a generic user agent with no personal details', ua === 'GreenReserve-Admin/1.0 (+https://greenreserve.app)' && !/@/.test(ua));
  check('search: the query asks for US results with addresses', /countrycodes=us/.test(calledWith) && /addressdetails=1/.test(calledWith));
  const tooFast = await lookupCourses('Brookfield Hills', '', 'admin-test', fake);
  check('search: a second search in the same second → 429 (1 a second platform-wide)', !tooFast.ok && tooFast.status === 429);
  const short = await lookupCourses('ab', '', 'admin-test', fake);
  check('search: under three letters → 400', !short.ok && short.status === 400);

  await cleanup();
}

main()
  .catch(e => { console.error(e); failed++; })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
    process.exit(failed ? 1 : 0);
  });
