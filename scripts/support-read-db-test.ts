// Read chats (Cam 2026-11-15): a chat whose last message is ours (GreenReserve's) and which the course has opened
// never shows "New reply" in the course's list; it shows "Answered" — the GreenReserve announcements chat included.
// Run with DATABASE_URL: npx tsx scripts/support-read-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { courseChats, openCourseChat, ANNOUNCEMENTS_CHAT_ID } from '../src/lib/support-chats';

const TAG = `supread-${Date.now()}`;
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

(async () => {
  const op = await prisma.courseOperator.create({ data: { name: 'Read Test', email: `${TAG}@test.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Read GC', slug: TAG, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'NY', zipCode: '12866', active: true, liveStatus: 'live', firstWentLiveAt: new Date(Date.now() - 86_400_000) } });
  const ann = await prisma.announcement.create({ data: { title: `${TAG} title`, body: 'News', sentById: 'x' } });
  try {
    const t = await prisma.messageThread.create({ data: { courseId: c.id } });
    const chat = await prisma.supportChat.create({ data: { threadId: t.id, courseId: c.id, subject: 'Question' } });
    const ago = (s: number) => new Date(Date.now() - s * 1000);
    const msg = (chatId: string | null, senderType: string, s: number) =>
      prisma.message.create({ data: { threadId: t.id, chatId, senderType, senderId: 'x', senderName: 'x', body: 'b', createdAt: ago(s) } });
    await msg(chat.id, 'operator', 60); await msg(chat.id, 'admin', 50);
    await msg(null, 'operator', 40); await msg(null, 'admin', 30);
    const states = async (operatorId: string | null) => Object.fromEntries((await courseChats(c.id, operatorId)).map(x => [x.id, x.state]));

    const s0 = await states(op.id);
    ok('our unread reply shows New reply (chat, earlier messages, announcements)', s0[chat.id] === 'reply' && s0[t.id] === 'reply' && s0[ANNOUNCEMENTS_CHAT_ID] === 'reply', s0);
    const opened = await openCourseChat(c.id, chat.id, op.id);
    ok('opening it: the chat it returns is Answered', opened?.chat.state === 'answered', opened?.chat);
    ok('…and the list shows it Answered', (await states(op.id))[chat.id] === 'answered');
    await openCourseChat(c.id, t.id, op.id);
    ok('the earlier-messages chat, once opened, is Answered', (await states(op.id))[t.id] === 'answered');
    await openCourseChat(c.id, ANNOUNCEMENTS_CHAT_ID, op.id);
    ok('the GreenReserve chat, once opened, is Answered', (await states(op.id))[ANNOUNCEMENTS_CHAT_ID] === 'answered');
    ok('a staff member (no owner id) never sees an announcement as New reply', (await states(null))[ANNOUNCEMENTS_CHAT_ID] === 'answered');
    await msg(chat.id, 'admin', 1);
    ok('a new reply after opening shows New reply again', (await states(op.id))[chat.id] === 'reply');
    await msg(chat.id, 'operator', 0);
    ok('the course writing last is Waiting on us, not New reply', (await states(op.id))[chat.id] === 'waiting');

    const page = readFileSync('src/app/dashboard/support/page.tsx', 'utf8');
    ok('the page gives the list the opened chat\'s state at once (before checking the user is still on it)',
      /if \(r\.ok\) setChats\(cs => cs && cs\.map\(x => \(x\.id === id \? \{ \.\.\.x, state: r\.data\.chat\.state, unread: 0 \} : x\)\)\);\s*\n\s*if \(openRef\.current !== id\) return;/.test(page));
  } finally {
    await prisma.announcement.delete({ where: { id: ann.id } });
    await prisma.messageThread.deleteMany({ where: { courseId: c.id } });
    await prisma.course.delete({ where: { id: c.id } });
    await prisma.courseOperator.delete({ where: { id: op.id } });
    await prisma.$disconnect();
  }
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('support-read-db: all passed');
})().catch(e => { console.error(e); process.exit(1); });
