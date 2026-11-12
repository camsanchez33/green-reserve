// SUPPORT (Cam 2026-11-12, ADMIN_REDO_SPEC "Course dashboard Support" + "Admin Course support"): a course's support
// conversations with GreenReserve, as chats. Each chat (SupportChat) has a subject and its own messages, inside the
// course's one MessageThread (which keeps the email throttles).
//
//   * A message from before chats (Message.chatId null, not an old broadcast copy) belongs to the course's ONE
//     "earlier messages" chat, whose id is the thread's id. Nothing is backfilled.
//   * State, per chat, from its messages: 'waiting' — the course wrote last (we owe a reply, due 2 business days
//     after the first unanswered message, lib/support-ticket); 'reply' — we replied and the course hasn't read it;
//     'answered' — otherwise.
//   * Announcements are a read-only chat from GreenReserve (id 'greenreserve'), from the Announcement rows a course
//     can see (lib/announcement-audience); an owner's unread = not yet seen (AnnouncementDismissal).
// Routes: /api/operator/support (messages.use) and /api/admin/support (support+, Messages area).
import { prisma } from './prisma';
import { replyDueAt, waitingSince } from './support-ticket';
import { sendMessageNotificationEmail } from './email';
import { ADMIN_EMAIL } from './contact';
import { announcementsSince } from './announcement-audience';

export const ANNOUNCEMENTS_CHAT_ID = 'greenreserve';
export const MAX_MESSAGE = 5000;
const ONE_HOUR = 3_600_000;
const EARLIER_SUBJECT = 'Earlier messages';

/** A chat's subject from its first message: the first non-empty line, cut to about 60 characters at a word. */
export function subjectFrom(body: string): string {
  const line = String(body ?? '').split(/\r?\n/).map(l => l.trim().replace(/\s+/g, ' ')).find(Boolean) ?? '';
  if (!line) return 'New message';
  if (line.length <= 60) return line;
  const cut = line.slice(0, 60);
  const space = cut.lastIndexOf(' ');
  return `${(space >= 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The trimmed text of a message, or an error to show. */
export function messageText(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { ok: false, error: 'Write a message first.' };
  if (text.length > MAX_MESSAGE) return { ok: false, error: `Keep it under ${MAX_MESSAGE.toLocaleString()} characters.` };
  return { ok: true, text };
}

export type Row = { id: string; senderType: string; senderName: string; body: string; createdAt: Date; readAt: Date | null; isBroadcast: boolean };
export type ChatState = 'waiting' | 'reply' | 'answered';

/** A chat's state from its messages (oldest first). Old broadcast copies never count. Pure. */
export function chatSummary(messages: Row[], now: Date = new Date()) {
  const real = messages.filter(m => !m.isBroadcast);
  const last = real[real.length - 1] ?? null;
  const unanswered = last?.senderType === 'operator';
  const first = unanswered ? waitingSince(real) : null;
  const dueAt = first ? replyDueAt(first.createdAt) : null;
  const unreadByCourse = real.filter(m => m.senderType === 'admin' && !m.readAt).length;
  const state: ChatState = unanswered ? 'waiting' : unreadByCourse > 0 ? 'reply' : 'answered';
  return { state, last, unanswered, dueAt, overdue: !!dueAt && now.getTime() >= dueAt.getTime(), unreadByCourse };
}

const ROW = { id: true, senderType: true, senderName: true, body: true, createdAt: true, readAt: true, isBroadcast: true, chatId: true } as const;
const earlierSubject = (rows: Row[]) => {
  const first = rows.find(m => m.senderType === 'operator') ?? rows[0];
  return first ? subjectFrom(first.body) : EARLIER_SUBJECT;
};

// ── The course's side ────────────────────────────────────────────────────────────────────────────────────────────

export type CourseChat = {
  id: string; subject: string; state: ChatState;
  last: { body: string; fromUs: boolean; at: string } | null;
  dueAt: string | null; unread: number; fromGreenReserve: boolean;
};
export type CourseMessage = { id: string; body: string; fromUs: boolean; senderName: string; at: string };

const courseChat = (id: string, subject: string, rows: Row[]): CourseChat => {
  const s = chatSummary(rows);
  return {
    id, subject, state: s.state,
    last: s.last ? { body: s.last.body, fromUs: s.last.senderType === 'operator', at: s.last.createdAt.toISOString() } : null,
    dueAt: s.dueAt?.toISOString() ?? null, unread: s.unreadByCourse, fromGreenReserve: false,
  };
};
const courseMessage = (m: Row): CourseMessage => ({ id: m.id, body: m.body, fromUs: m.senderType === 'operator', senderName: m.senderName, at: m.createdAt.toISOString() });

/** The announcements a course can see, oldest first, with whether this owner has seen each. */
async function announcementRows(courseId: string, operatorId: string | null) {
  const since = await announcementsSince(courseId);
  if (!since) return [];
  const rows = await prisma.announcement.findMany({
    where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 50,
    select: { id: true, title: true, body: true, createdAt: true, dismissals: operatorId ? { where: { operatorId }, select: { id: true } } : { where: { id: '' }, select: { id: true } } },
  });
  return rows.reverse().map(a => ({ id: a.id, body: `${a.title}\n\n${a.body}`, at: a.createdAt, seen: !operatorId || a.dismissals.length > 0 }));
}

function announcementsChat(rows: Awaited<ReturnType<typeof announcementRows>>, operatorId: string | null): CourseChat | null {
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  return {
    id: ANNOUNCEMENTS_CHAT_ID, subject: 'GreenReserve', state: 'answered',
    last: { body: last.body, fromUs: false, at: last.at.toISOString() }, dueAt: null,
    unread: operatorId ? rows.filter(r => !r.seen).length : 0, fromGreenReserve: true,
  };
}

/** Every chat a course has, newest activity first (the announcements chat among them). */
export async function courseChats(courseId: string, operatorId: string | null): Promise<CourseChat[]> {
  const [thread, ann] = await Promise.all([
    prisma.messageThread.findUnique({ where: { courseId }, select: { id: true } }),
    announcementRows(courseId, operatorId),
  ]);
  const chats: CourseChat[] = [];
  if (thread) {
    const [rows, list] = await Promise.all([
      prisma.message.findMany({ where: { threadId: thread.id, isBroadcast: false }, orderBy: { createdAt: 'asc' }, select: ROW }),
      prisma.supportChat.findMany({ where: { threadId: thread.id }, select: { id: true, subject: true } }),
    ]);
    const by = new Map<string | null, Row[]>();
    for (const r of rows) { const k = r.chatId ?? null; (by.get(k) ?? by.set(k, []).get(k)!).push(r); }
    const earlier = by.get(null);
    if (earlier?.length) chats.push(courseChat(thread.id, earlierSubject(earlier), earlier));
    for (const c of list) { const rs = by.get(c.id); if (rs?.length) chats.push(courseChat(c.id, c.subject, rs)); }
  }
  const a = announcementsChat(ann, operatorId);
  if (a) chats.push(a);
  return chats.sort((x, y) => (y.last?.at ?? '').localeCompare(x.last?.at ?? ''));
}

type Resolved = { kind: 'chat'; id: string; threadId: string; subject: string } | { kind: 'earlier'; id: string; threadId: string };

/** A chat id at this course (a SupportChat, or the course's thread id for its earlier messages), or null. */
async function resolveCourseChat(courseId: string, id: string): Promise<Resolved | null> {
  const chat = await prisma.supportChat.findFirst({ where: { id, courseId }, select: { id: true, threadId: true, subject: true } });
  if (chat) return { kind: 'chat', ...chat };
  const thread = await prisma.messageThread.findFirst({ where: { id, courseId }, select: { id: true } });
  return thread ? { kind: 'earlier', id: thread.id, threadId: thread.id } : null;
}
const inChat = (r: Resolved) => (r.kind === 'chat' ? { chatId: r.id } : { threadId: r.threadId, chatId: null });

/** One chat with its messages (oldest first); opening it marks our replies in it read (or, for the announcements
 *  chat, every announcement seen by this owner). Null when the chat isn't this course's. */
export async function openCourseChat(courseId: string, id: string, operatorId: string | null): Promise<{ chat: CourseChat; messages: CourseMessage[] } | null> {
  if (id === ANNOUNCEMENTS_CHAT_ID) {
    const rows = await announcementRows(courseId, operatorId);
    if (!rows.length) return null;
    if (operatorId) {
      await prisma.announcementDismissal.createMany({ data: rows.filter(r => !r.seen).map(r => ({ announcementId: r.id, operatorId })), skipDuplicates: true });
    }
    return {
      chat: { ...announcementsChat(rows, operatorId)!, unread: 0 },
      messages: rows.map(r => ({ id: r.id, body: r.body, fromUs: false, senderName: 'GreenReserve', at: r.at.toISOString() })),
    };
  }
  const r = await resolveCourseChat(courseId, id);
  if (!r) return null;
  await prisma.message.updateMany({ where: { ...inChat(r), senderType: 'admin', readAt: null }, data: { readAt: new Date() } });
  const rows = await prisma.message.findMany({ where: { ...inChat(r), isBroadcast: false }, orderBy: { createdAt: 'asc' }, select: ROW });
  if (!rows.length) return null;
  return { chat: courseChat(r.id, r.kind === 'chat' ? r.subject : earlierSubject(rows), rows), messages: rows.map(courseMessage) };
}

export type Sender = { id: string; name: string };

/** Who is writing for the course: the owner's or staff member's name (as the old Messages route), else the email. */
export async function courseSender(session: { email: string; isStaff?: boolean; operatorId?: string | null; staffId?: string | null }): Promise<Sender> {
  let name = session.email;
  if (!session.isStaff && session.operatorId) {
    const op = await prisma.courseOperator.findUnique({ where: { id: session.operatorId }, select: { name: true } });
    if (op?.name) name = op.name;
  } else if (session.isStaff && session.staffId) {
    const staff = await prisma.courseStaff.findUnique({ where: { id: session.staffId }, select: { name: true } });
    if (staff?.name) name = staff.name;
  }
  return { id: session.operatorId || session.staffId || session.email, name };
}

/** Email GreenReserve about a course's message, at most once an hour per course. Never throws. */
async function notifyGreenReserve(threadId: string, chatId: string, courseName: string, sender: Sender, text: string) {
  try {
    const t = await prisma.messageThread.findUnique({ where: { id: threadId }, select: { adminLastEmailAt: true } });
    if (t?.adminLastEmailAt && Date.now() - t.adminLastEmailAt.getTime() <= ONE_HOUR) return;
    await sendMessageNotificationEmail({
      recipientEmail: ADMIN_EMAIL, recipientName: 'there', senderName: sender.name, courseName, messageBody: text,
      replyUrl: `${process.env.NEXT_PUBLIC_URL}/admin/support?id=${encodeURIComponent(chatId)}`,
    });
    await prisma.messageThread.update({ where: { id: threadId }, data: { adminLastEmailAt: new Date() } });
  } catch (e) {
    console.error('Support message notification email failed:', e);
  }
}

/** The course starts a chat with its first message. */
export async function startCourseChat(courseId: string, sender: Sender, text: string): Promise<CourseChat | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { name: true } });
  if (!course) return null;
  const made = await prisma.$transaction(async tx => {
    const thread = await tx.messageThread.upsert({ where: { courseId }, create: { courseId }, update: { closedAt: null } });
    const chat = await tx.supportChat.create({ data: { threadId: thread.id, courseId, subject: subjectFrom(text) } });
    const m = await tx.message.create({ data: { threadId: thread.id, chatId: chat.id, senderType: 'operator', senderId: sender.id, senderName: sender.name, body: text }, select: ROW });
    await tx.supportChat.update({ where: { id: chat.id }, data: { lastMessageAt: m.createdAt } });
    return { thread, chat, m };
  });
  await notifyGreenReserve(made.thread.id, made.chat.id, course.name, sender, text);
  return courseChat(made.chat.id, made.chat.subject, [made.m]);
}

/** The course writes in one of its chats. Null when the chat isn't this course's ('greenreserve' can't be replied to). */
export async function addCourseMessage(courseId: string, id: string, sender: Sender, text: string): Promise<CourseMessage | null> {
  if (id === ANNOUNCEMENTS_CHAT_ID) return null;
  const [r, course] = await Promise.all([resolveCourseChat(courseId, id), prisma.course.findUnique({ where: { id: courseId }, select: { name: true } })]);
  if (!r || !course) return null;
  const m = await prisma.$transaction(async tx => {
    const m = await tx.message.create({ data: { threadId: r.threadId, chatId: r.kind === 'chat' ? r.id : null, senderType: 'operator', senderId: sender.id, senderName: sender.name, body: text }, select: ROW });
    if (r.kind === 'chat') await tx.supportChat.update({ where: { id: r.id }, data: { lastMessageAt: m.createdAt } });
    await tx.messageThread.update({ where: { id: r.threadId }, data: { closedAt: null } }); // MP-7b: a new message reopens
    return m;
  });
  await notifyGreenReserve(r.threadId, r.id, course.name, sender, text);
  return courseMessage(m);
}

// ── GreenReserve's side ──────────────────────────────────────────────────────────────────────────────────────────

export type AdminThread = {
  id: string; courseId: string; courseName: string; isTest: boolean; subject: string;
  answered: boolean; lastAt: string; lastFrom: 'course' | 'us'; lastText: string;
  dueAt: string | null; overdue: boolean;
};
const trim = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };

function adminThread(id: string, course: { id: string; name: string; isTest: boolean }, subject: string, rows: Row[], now: Date): AdminThread | null {
  const s = chatSummary(rows, now);
  if (!s.last) return null;
  return {
    id, courseId: course.id, courseName: course.name, isTest: course.isTest, subject,
    answered: !s.unanswered, lastAt: s.last.createdAt.toISOString(), lastFrom: s.last.senderType === 'operator' ? 'course' : 'us',
    lastText: trim(s.last.body, 140), dueAt: s.dueAt?.toISOString() ?? null, overdue: s.overdue,
  };
}

/** Every course's chats, newest activity first; `q` matches the course name, the subject or any message. Test
 *  courses are included (a test course's chat is still a chat to answer) and flagged. */
export async function adminThreads(q: string, now: Date = new Date()): Promise<AdminThread[]> {
  const term = q.trim().slice(0, 100);
  const has = { contains: term, mode: 'insensitive' as const };
  const COURSE = { select: { id: true, name: true, isTest: true } } as const;
  const [chats, threads] = await Promise.all([
    prisma.supportChat.findMany({
      where: term ? { OR: [{ subject: has }, { thread: { course: { name: has } } }, { messages: { some: { body: has } } }] } : {},
      orderBy: { lastMessageAt: 'desc' }, take: 300,
      select: { id: true, subject: true, thread: { select: { course: COURSE } }, messages: { where: { isBroadcast: false }, orderBy: { createdAt: 'asc' }, select: ROW } },
    }),
    prisma.messageThread.findMany({
      // A course's earlier messages (from before chats). Its subject is a message's first line, so matching the
      // course name or any of its messages covers the subject too.
      where: { messages: { some: { chatId: null, isBroadcast: false } }, ...(term ? { OR: [{ course: { name: has } }, { messages: { some: { chatId: null, isBroadcast: false, body: has } } }] } : {}) },
      orderBy: { updatedAt: 'desc' }, take: 300,
      select: { id: true, course: COURSE, messages: { where: { chatId: null, isBroadcast: false }, orderBy: { createdAt: 'asc' }, select: ROW } },
    }),
  ]);
  const out: AdminThread[] = [];
  for (const c of chats) { const t = adminThread(c.id, c.thread.course, c.subject, c.messages, now); if (t) out.push(t); }
  for (const t of threads) { const a = adminThread(t.id, t.course, earlierSubject(t.messages), t.messages, now); if (a) out.push(a); }
  return out.sort((x, y) => y.lastAt.localeCompare(x.lastAt));
}

type AdminResolved = Resolved & { course: { id: string; name: string; isTest: boolean; archivedAt: Date | null; operator: { email: string; name: string } | null } };

async function resolveAdminChat(id: string): Promise<AdminResolved | null> {
  const COURSE = { select: { id: true, name: true, isTest: true, archivedAt: true, operator: { select: { email: true, name: true } } } } as const;
  const chat = await prisma.supportChat.findUnique({ where: { id }, select: { id: true, threadId: true, subject: true, thread: { select: { course: COURSE } } } });
  if (chat) return { kind: 'chat', id: chat.id, threadId: chat.threadId, subject: chat.subject, course: chat.thread.course };
  const thread = await prisma.messageThread.findUnique({ where: { id }, select: { id: true, course: COURSE } });
  return thread ? { kind: 'earlier', id: thread.id, threadId: thread.id, course: thread.course } : null;
}

export type AdminMessage = { id: string; at: string; from: 'course' | 'us'; authorName: string | null; text: string };
const adminMessage = (m: Row): AdminMessage => ({ id: m.id, at: m.createdAt.toISOString(), from: m.senderType === 'operator' ? 'course' : 'us', authorName: m.senderName || null, text: m.body });

/** One chat for GreenReserve; opening it marks the course's messages in it read. */
export async function openAdminChat(id: string, now: Date = new Date()) {
  const r = await resolveAdminChat(id);
  if (!r) return null;
  await prisma.message.updateMany({ where: { ...inChat(r), senderType: 'operator', readAt: null }, data: { readAt: new Date() } });
  const rows = await prisma.message.findMany({ where: { ...inChat(r), isBroadcast: false }, orderBy: { createdAt: 'asc' }, select: ROW });
  if (!rows.length) return null;
  const s = chatSummary(rows, now);
  return {
    id: r.id, courseId: r.course.id, courseName: r.course.name, isTest: r.course.isTest,
    subject: r.kind === 'chat' ? r.subject : earlierSubject(rows),
    answered: !s.unanswered, dueAt: s.dueAt?.toISOString() ?? null, overdue: s.overdue,
    messages: rows.map(adminMessage),
  };
}

/** GreenReserve replies in a chat. Returns the message and, when it's time to, the email to send the course
 *  (the route sends it after the response — at most once an hour per course, as before). */
export async function adminReply(id: string, admin: { adminId: string; name: string }, text: string):
  Promise<{ ok: false; status: number; error: string } | { ok: true; courseId: string; message: AdminMessage; email: (() => Promise<void>) | null }> {
  const r = await resolveAdminChat(id);
  if (!r) return { ok: false, status: 404, error: 'That conversation no longer exists — refresh the list.' };
  // MP-7a: an archived course's operator has left the platform.
  if (r.course.archivedAt) return { ok: false, status: 409, error: 'This course is archived — its operator has left the platform. Restore the course before messaging them.' };
  const m = await prisma.$transaction(async tx => {
    const m = await tx.message.create({ data: { threadId: r.threadId, chatId: r.kind === 'chat' ? r.id : null, senderType: 'admin', senderId: admin.adminId, senderName: admin.name, body: text }, select: ROW });
    if (r.kind === 'chat') await tx.supportChat.update({ where: { id: r.id }, data: { lastMessageAt: m.createdAt } });
    await tx.messageThread.update({ where: { id: r.threadId }, data: { closedAt: null } });
    await tx.message.updateMany({ where: { ...inChat(r), senderType: 'operator', readAt: null }, data: { readAt: new Date() } });
    return m;
  });
  const t = await prisma.messageThread.findUnique({ where: { id: r.threadId }, select: { operatorLastEmailAt: true } });
  const op = r.course.operator;
  const due = op && (!t?.operatorLastEmailAt || Date.now() - t.operatorLastEmailAt.getTime() > ONE_HOUR);
  const email = due && op ? async () => {
    try {
      await sendMessageNotificationEmail({
        recipientEmail: op.email, recipientName: op.name, senderName: admin.name, courseName: r.course.name, messageBody: text,
        replyUrl: `${process.env.NEXT_PUBLIC_URL}/dashboard/messages?chat=${encodeURIComponent(r.id)}`,
      });
      await prisma.messageThread.update({ where: { id: r.threadId }, data: { operatorLastEmailAt: new Date() } });
    } catch (e) {
      console.error('Support reply notification email failed:', e);
    }
  } : null;
  return { ok: true, courseId: r.course.id, message: adminMessage(m), email };
}
