// W2-9d (Cam 2026-10-22): an event's public sign-up page, /events/[id].
// The course opens it per event and decides:
//   signupPay 'now'   — a spot is held 30 minutes while the group pays; unpaid,
//                       the hold lapses and the spot frees up.
//   signupPay 'later' — they go straight on the list; the course collects
//                       later (pay links, or at the course).
// One person signs up a group of up to signupMaxGroup (≤4) — they share a
// groupKey, are paired together and, when paying now, pay one charge for all
// of them. Name and email always; mobile optional; plus the course's own
// questions (handicap, shirt size …), asked of every player.
// When the event is full (CourseEvent.players reached; 0 = no limit) the
// group goes on the waiting list and pays nothing; staff move people on.
//
// Capacity is decided under a lock on the event row, so two sign-ups can't
// both take the last spots.
import { randomBytes, randomUUID } from 'crypto';
import { prisma } from './prisma';
import { todayIn } from './course-time';
import { eventFeeFor, settleOpenPayment, HOLD_MINUTES } from './event-payments';
import { sendEventSignupEmail, isPlaceholderEmail, type SignupEmailVariant } from './email';
import { formatTeeDay, formatTeeTime } from './format';

export { HOLD_MINUTES };
export const MAX_GROUP = 4;
export const MAX_QUESTIONS = 10;

export type SignupQuestion = { id: string; label: string; required: boolean };
type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const str = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Read the stored questions defensively (it is JSON). */
export function questionsOf(raw: unknown): SignupQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(q => q && typeof q === 'object' && typeof (q as SignupQuestion).id === 'string' && typeof (q as SignupQuestion).label === 'string')
    .map(q => ({ id: (q as SignupQuestion).id, label: (q as SignupQuestion).label, required: !!(q as SignupQuestion).required }))
    .slice(0, MAX_QUESTIONS);
}

/** Staff side: clean the course's questions. An existing question keeps its id, so answers stay attached. */
export function cleanQuestions(raw: unknown): SignupQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: SignupQuestion[] = [];
  for (const q of raw.slice(0, MAX_QUESTIONS)) {
    const label = str((q as { label?: unknown })?.label, 120);
    if (!label) continue;
    const given = String((q as { id?: unknown })?.id ?? '');
    out.push({ id: /^[a-z0-9]{6,24}$/.test(given) ? given : randomBytes(6).toString('hex'), label, required: !!(q as { required?: unknown })?.required });
  }
  return out;
}

/** Players holding a spot right now: on the list, or held and the hold not run out. */
export function spotsTaken(players: { status: string; holdUntil: Date | null }[], now: Date = new Date()): number {
  return players.filter(p => p.status === 'in' || (p.status === 'held' && p.holdUntil && p.holdUntil > now)).length;
}

/** What the public page shows. Null when there is no page to show (closed, cancelled, not found). */
export async function signupPage(eventId: string) {
  const e = await prisma.courseEvent.findUnique({
    where: { id: eventId },
    include: {
      course: { select: { name: true, slug: true, brandColor: true, logoUrl: true, heroImageUrl: true, timezone: true, stripeAccountId: true, stripeAccountActive: true, liveStatus: true } },
      entrants: { select: { status: true, holdUntil: true } },
    },
  });
  // Only a live course has public pages (as booking does).
  if (!e || e.status !== 'planned' || !e.signupOpen || e.course.liveStatus !== 'live') return null;
  const today = todayIn(e.course.timezone);
  const cap = e.players > 0 ? e.players : null;
  const taken = spotsTaken(e.entrants);
  const payNow = e.signupPay === 'now' && e.pricePerPlayerCents > 0 && !!e.course.stripeAccountId && e.course.stripeAccountActive;
  return {
    id: e.id, name: e.name, kind: e.kind, date: e.date, format: e.format, startTime: e.startTime, holes: e.holes,
    pricePerPlayerCents: e.pricePerPlayerCents, includes: e.includes, terms: e.terms,
    payNow, feePerPlayerCents: payNow ? eventFeeFor('player', null) : 0,
    maxGroup: Math.min(MAX_GROUP, Math.max(1, e.signupMaxGroup)), questions: questionsOf(e.signupQuestions),
    spotsLeft: cap == null ? null : Math.max(0, cap - taken), past: e.date < today,
    course: { name: e.course.name, brandColor: e.course.brandColor, logoUrl: e.course.logoUrl, photoUrl: e.course.heroImageUrl },
  };
}

export type SignupInput = { players?: unknown; answers?: unknown };
export type SignupResult = { status: 'in' | 'waitlist' | 'pay'; payUrl?: string; names: string[]; groupKey: string };

/** A sign-up from the public page. */
export async function submitSignup(eventId: string, input: SignupInput, now: Date = new Date()): Promise<Result<SignupResult>> {
  const page = await signupPage(eventId);
  if (!page) return fail(404, 'Sign-ups for this event are closed.');
  if (page.past) return fail(409, 'This event has already happened.');
  const raw = Array.isArray(input.players) ? input.players : [];
  if (raw.length < 1) return fail(400, 'Add at least one player.');
  if (raw.length > page.maxGroup) return fail(400, `Up to ${page.maxGroup} players can sign up together.`);
  const players: { name: string; email: string; phone: string; answers: Record<string, string> }[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Record<string, unknown>;
    const who = i === 0 ? 'Your' : `Player ${i + 1}’s`;
    const name = str(r?.name, 120);
    if (!name) return fail(400, `${who} name is missing.`);
    const email = str(r?.email, 200).toLowerCase();
    if (i === 0 && !email) return fail(400, 'Add your email so we can confirm your spot.');
    if (email && !EMAIL.test(email)) return fail(400, `${who} email doesn’t look right.`);
    const phone = str(r?.phone, 40);
    if (phone && phone.replace(/\D/g, '').length < 10) return fail(400, `${who} mobile number looks too short.`);
    const given = (r?.answers && typeof r.answers === 'object' ? r.answers : {}) as Record<string, unknown>;
    const answers: Record<string, string> = {};
    for (const q of page.questions) {
      const a = str(given[q.id], 300);
      if (q.required && !a) return fail(400, `${who} answer to “${q.label}” is missing.`);
      if (a) answers[q.id] = a;
    }
    players.push({ name, email, phone, answers });
  }
  const lead = players[0];
  const groupKey = randomUUID();
  const n = players.length;

  const out = await prisma.$transaction(async tx => {
    // One sign-up at a time per event: the spots are counted and taken under this lock.
    await tx.$queryRaw`SELECT id FROM "CourseEvent" WHERE id = ${eventId} FOR UPDATE`;
    const ev = await tx.courseEvent.findUniqueOrThrow({ where: { id: eventId }, include: { entrants: { select: { status: true, holdUntil: true, sortOrder: true } } } });
    if (ev.status !== 'planned' || !ev.signupOpen) return { closed: true as const };
    const cap = ev.players > 0 ? ev.players : null;
    const fits = cap == null || spotsTaken(ev.entrants, now) + n <= cap;
    const status: 'in' | 'held' | 'waitlist' = !fits ? 'waitlist' : page.payNow ? 'held' : 'in';
    const holdUntil = status === 'held' ? new Date(now.getTime() + HOLD_MINUTES * 60_000) : null;
    let order = ev.entrants.reduce((m, p) => Math.max(m, p.sortOrder), -1);
    const made = [];
    for (const p of players) {
      made.push(await tx.courseEventPlayer.create({ data: { eventId, name: p.name, email: p.email, phone: p.phone, status, holdUntil, source: 'signup', groupKey, answers: p.answers, sortOrder: ++order } }));
    }
    if (status !== 'held') return { status };
    // Paying now: one charge for the whole group, on the lead's name.
    const payToken = randomUUID();
    const pay = await tx.courseEventPayment.create({
      data: {
        eventId, courseId: ev.courseId, kind: 'player', label: n === 1 ? `${lead.name} — entry` : `Entry for ${n} players`,
        amountCents: ev.pricePerPlayerCents * n, feeCents: eventFeeFor('player', null) * n, method: 'link', status: 'open', payToken,
        playerId: made[0].id, groupKey, payerName: lead.name, payerEmail: lead.email, payerPhone: lead.phone, createdBy: 'sign-up page',
      },
    });
    return { status, payId: pay.id, payToken };
  });
  if ('closed' in out) return fail(409, 'Sign-ups for this event just closed.');
  const names = players.map(p => p.name);
  if (out.status !== 'held') {
    // On the list or the waiting list: tell them now. (Paying now: the email goes when they've paid.)
    await sendSignupConfirmation({ groupKey, variant: out.status === 'in' ? 'in' : 'waitlist' }).catch(err =>
      console.error(JSON.stringify({ ev: 'event_signup.email.fail', eventId, error: err instanceof Error ? err.message : String(err) })));
  }
  if (out.status === 'held') return { ok: true, value: { status: 'pay', payUrl: `/pay/event/${out.payId}?token=${out.payToken}`, names, groupKey } };
  return { ok: true, value: { status: out.status, names, groupKey } };
}

/**
 * Holds that ran out become 'lapsed': shown to staff, not counted, and their
 * open payment is cancelled (if the card went through meanwhile, the void
 * finds it and they go on the list instead). Called when the event page loads.
 */
export async function lapseHolds(courseId: string, eventId: string, now: Date = new Date()): Promise<number> {
  // Always through the course: a guessed event id from another course changes nothing.
  const where = { eventId, event: { courseId }, status: 'held', holdUntil: { lt: now } };
  const gone = await prisma.courseEventPlayer.findMany({ where, select: { groupKey: true } });
  if (!gone.length) return 0;
  const r = await prisma.courseEventPlayer.updateMany({ where, data: { status: 'lapsed' } });
  const keys = [...new Set(gone.map(g => g.groupKey).filter(Boolean))];
  const open = await prisma.courseEventPayment.findMany({ where: { eventId, courseId, groupKey: { in: keys }, status: 'open' }, select: { id: true } });
  for (const p of open) {
    const v = await settleOpenPayment(courseId, p.id, 'void').catch(err => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));
    if (!v.ok) console.error(JSON.stringify({ ev: 'event_signup.lapse_void.fail', paymentId: p.id, error: v.error }));
  }
  return r.count;
}

/** Staff: the sign-up page's settings for one event. */
export function signupSettings(input: Record<string, unknown>): Result<{ signupOpen: boolean; signupPay: string; signupMaxGroup: number; signupQuestions: SignupQuestion[] }> {
  const max = Number(input.signupMaxGroup ?? MAX_GROUP);
  if (!Number.isInteger(max) || max < 1 || max > MAX_GROUP) return fail(400, `A group can be 1 to ${MAX_GROUP} players.`);
  if (Array.isArray(input.signupQuestions) && input.signupQuestions.length > MAX_QUESTIONS) return fail(400, `Up to ${MAX_QUESTIONS} questions.`);
  return { ok: true, value: { signupOpen: !!input.signupOpen, signupPay: input.signupPay === 'now' ? 'now' : 'later', signupMaxGroup: max, signupQuestions: cleanQuestions(input.signupQuestions) } };
}

/**
 * Staff move a group off the waiting list (or a group whose hold ran out) onto
 * the list. The course decides — it may go over the expected number. They are
 * emailed that they're in; any money is collected as for everyone else.
 */
export async function moveOntoList(courseId: string, eventId: string, groupKey: string, replyTo: string): Promise<Result<{ moved: number; emailed: 'sent' | 'no_email' | 'failed' }>> {
  if (!groupKey) return fail(400, 'Pick a sign-up.');
  const r = await prisma.courseEventPlayer.updateMany({ where: { eventId, groupKey, status: { in: ['waitlist', 'lapsed'] }, event: { courseId } }, data: { status: 'in', holdUntil: null } });
  if (!r.count) return fail(404, 'That sign-up is gone or already on the list — refresh the page.');
  const emailed = await sendSignupConfirmation({ groupKey, variant: 'moved_in', replyTo }).then(sent => sent ? 'sent' as const : 'no_email' as const, err => {
    console.error(JSON.stringify({ ev: 'event_signup.moved_email.fail', eventId, error: err instanceof Error ? err.message : String(err) }));
    return 'failed' as const;
  });
  return { ok: true, value: { moved: r.count, emailed } };
}

/**
 * Email the person who signed a group up: on the list, on the waiting list,
 * paid, or moved on by staff. Returns false when there was no one to email.
 */
export async function sendSignupConfirmation(opts: { groupKey?: string; paymentId?: string; variant?: SignupEmailVariant; replyTo?: string }): Promise<boolean> {
  let groupKey = opts.groupKey ?? '';
  let paidCents = 0;
  let variant = opts.variant;
  if (opts.paymentId) {
    const p = await prisma.courseEventPayment.findUnique({ where: { id: opts.paymentId }, select: { groupKey: true, status: true, amountCents: true, feeCents: true } });
    if (!p?.groupKey || p.status !== 'paid') return false;
    groupKey = p.groupKey; paidCents = p.amountCents + p.feeCents; variant = 'paid';
  }
  if (!groupKey || !variant) return false;
  const group = await prisma.courseEventPlayer.findMany({
    where: { groupKey }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { event: { select: { id: true, name: true, date: true, startTime: true, format: true, terms: true, courseId: true, course: { select: { name: true, phone: true, operator: { select: { email: true } } } } } } },
  });
  const lead = group[0];
  if (!lead?.email || isPlaceholderEmail(lead.email)) return false;
  const ev = lead.event;
  await sendEventSignupEmail({
    courseId: ev.courseId, variant, email: lead.email, name: lead.name, players: group.map(g => g.name),
    courseName: ev.course.name, coursePhone: ev.course.phone, replyTo: opts.replyTo || ev.course.operator?.email || null,
    eventName: ev.name, dateLabel: formatTeeDay(ev.date), startLabel: `${ev.format === 'shotgun' ? 'Shotgun start' : 'First tee time'} ${formatTeeTime(ev.startTime)}`,
    paidCents, terms: ev.terms,
  });
  return true;
}
