// Build follow-ups (2026-11-14): the admin rail's Course support badge counts chats not answered — the last real
// message in each chat (or a course's earlier-messages chat, keyed by its thread) is the course's. Old broadcast
// copies never count. Run with DATABASE_URL: npx tsx scripts/support-unanswered-db-test.ts
import { prisma } from '../src/lib/prisma';
import { unansweredChatCount } from '../src/lib/support-chats';

const TAG = `unans-${Date.now()}`;
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

(async () => {
  const op = await prisma.courseOperator.create({ data: { name: 'Unanswered Test', email: `${TAG}@test.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Unanswered GC', slug: TAG, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'NY', zipCode: '12866' } });
  try {
    const t = await prisma.messageThread.create({ data: { courseId: c.id } });
    const chat = (subject: string) => prisma.supportChat.create({ data: { threadId: t.id, courseId: c.id, subject } });
    const ago = (s: number) => new Date(Date.now() - s * 1000);
    const msg = (chatId: string | null, senderType: string, s: number, isBroadcast = false) =>
      prisma.message.create({ data: { threadId: t.id, chatId, senderType, senderId: 'x', senderName: 'x', body: 'b', createdAt: ago(s), isBroadcast } });
    const base = await unansweredChatCount();
    const answered = await chat('Answered');
    await msg(answered.id, 'operator', 60); await msg(answered.id, 'admin', 50);
    ok('a chat we replied to last is not counted', (await unansweredChatCount()) === base);
    const waiting = await chat('Waiting');
    await msg(waiting.id, 'admin', 60); await msg(waiting.id, 'operator', 50);
    ok('a chat the course wrote last is counted', (await unansweredChatCount()) === base + 1);
    await msg(null, 'operator', 40);
    ok('the earlier-messages chat counts once when the course wrote last', (await unansweredChatCount()) === base + 2);
    await msg(null, 'admin', 10, true);
    ok('an old broadcast copy is not a reply', (await unansweredChatCount()) === base + 2);
    await msg(waiting.id, 'operator', 30);
    ok('two unanswered messages in one chat are one chat', (await unansweredChatCount()) === base + 2);
    await msg(waiting.id, 'admin', 5);
    ok('replying answers it', (await unansweredChatCount()) === base + 1);
  } finally {
    await prisma.messageThread.deleteMany({ where: { courseId: c.id } });
    await prisma.course.delete({ where: { id: c.id } });
    await prisma.courseOperator.delete({ where: { id: op.id } });
    await prisma.$disconnect();
  }
  if (failed) { console.error(`support-unanswered: ${failed} failed`); process.exit(1); }
  console.log('support-unanswered: all passed');
})().catch(e => { console.error(e); process.exit(1); });
