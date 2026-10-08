// BIRDIE_AI_SPEC B4b (Cam 2026-10-05) — propose-and-confirm CHANGES.
//
// Birdie never writes. A propose_* tool validates what the model asked for
// against the course's real rows (scoped to the session's courseId), and
// returns a CARD: what changes (old → new), what it does and does not touch,
// and the exact request the dashboard's own page would make. The widget shows
// the card; nothing happens until the operator clicks Confirm, and then the
// click calls that SAME route from the browser — so its requirePermission,
// agreement check and validation are the control, not this file.
//
// Allowlist (Cam): schedule edits (first/last tee, interval, days, rates,
// running/paused), block a day, unblock a day. ACT-2 (PLATFORM_ROADMAP_SPEC §3,
// Cam 2026-10-07: "able to move around stuff … not just a chat bot"): move a
// group, block or open tee times, add a phone booking or walk-in, send a pay
// link. Never money movement, refunds, cancelling (waits on Cam), the
// cancellation policy, Stripe or staff — there is no tool for those, the
// widget refuses any card body asking for them (proposal-types BODY_RULES),
// and the system prompt tells Birdie to say so.
import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../prisma';
import { listSchedules } from '../schedule-service';
import { todayIn } from '../course-time';
import { moveBooking } from '../move-booking';
import { isPlaceholderEmail } from '../email';
import type { ToolContext, ToolOutcome } from './tools';

import type { ProposalCard } from './proposal-types';
export type { ProposalCard } from './proposal-types';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const PROPOSE_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'propose_schedule_change',
    description:
      "Draft a change to ONE of the course's schedules for the operator to confirm: first tee, last tee, interval, days of the week, weekday/weekend green fee, cart fee, or running/paused. Call get_schedules first to get the schedule id and current values. Include only the fields that change. This does NOT change anything — it shows the operator a confirm card.",
    input_schema: {
      type: 'object',
      properties: {
        scheduleId: { type: 'string', description: 'The schedule id from get_schedules.' },
        firstTee: { type: 'string', description: 'New first tee time, 24-hour HH:MM.' },
        lastTee: { type: 'string', description: 'New last tee time, 24-hour HH:MM.' },
        intervalMinutes: { type: 'integer', description: 'Minutes between tee times, 5 to 20.' },
        days: { type: 'array', items: { type: 'string', enum: DOW }, description: 'The days this schedule runs.' },
        greenFeeWeekday: { type: 'number', description: 'Weekday green fee in dollars per player.' },
        greenFeeWeekend: { type: 'number', description: 'Weekend green fee in dollars per player.' },
        cartFee: { type: 'number', description: 'Cart fee in dollars per player.' },
        running: { type: 'boolean', description: 'true to run the schedule, false to pause it.' },
      },
      required: ['scheduleId'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_block_day',
    description:
      "Draft blocking a whole day so golfers can't book it, for the operator to confirm. Open times on that day are removed; times that already have bookings stay, blocked, and those bookings are NOT cancelled (cancelling for weather is the Weather button on the Tee Sheet). This does NOT change anything — it shows a confirm card.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'The day, YYYY-MM-DD (course-local), today or later.' },
        reason: { type: 'string', description: 'Short reason, e.g. "Aeration" or "Member tournament".' },
      },
      required: ['date'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_unblock_day',
    description:
      "Draft reopening a blocked day, for the operator to confirm. Call get_schedules first to see blocked days. This does NOT change anything — it shows a confirm card.",
    input_schema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'The blocked day, YYYY-MM-DD.' } },
      required: ['date'],
      additionalProperties: false,
    },
  },  {
    name: 'propose_move_group',
    description:
      "Draft moving ONE booked group to another tee time, for the operator to confirm. Identify the group by its current day, tee time and golfer name (from get_tee_sheet). The price they booked stays the same; the golfer is emailed the new time. This does NOT change anything — it shows a confirm card.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'The group’s current day, YYYY-MM-DD.' },
        time: { type: 'string', description: 'The group’s current tee time, 24-hour HH:MM.' },
        golfer: { type: 'string', description: 'The golfer name on the booking (as get_tee_sheet shows it).' },
        toDate: { type: 'string', description: 'The new day, YYYY-MM-DD. Omit for the same day.' },
        toTime: { type: 'string', description: 'The new tee time, 24-hour HH:MM.' },
      },
      required: ['date', 'time', 'golfer', 'toTime'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_block_times',
    description:
      "Draft blocking (or reopening) the tee times on one day from one time to another, for the operator to confirm. Blocking stops new bookings on those times; groups already booked on them stay booked — nobody is cancelled. This does NOT change anything — it shows a confirm card.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'The day, YYYY-MM-DD, today or later.' },
        from: { type: 'string', description: 'First tee time to change, 24-hour HH:MM.' },
        to: { type: 'string', description: 'Last tee time to change, 24-hour HH:MM. Omit for just the one time.' },
        block: { type: 'boolean', description: 'true to block, false to reopen blocked times.' },
      },
      required: ['date', 'from', 'block'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_add_booking',
    description:
      "Draft adding a phone booking or a walk-in onto an open tee time, for the operator to confirm. They pay at the counter. This does NOT change anything — it shows a confirm card.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'The day, YYYY-MM-DD, today or later.' },
        time: { type: 'string', description: 'The tee time, 24-hour HH:MM.' },
        golfer: { type: 'string', description: 'The golfer’s name.' },
        players: { type: 'integer', description: 'Players in the group, 1 to 4.' },
        source: { type: 'string', enum: ['phone', 'walk_in'], description: 'How they booked.' },
        phone: { type: 'string', description: 'Their mobile number, if given.' },
        email: { type: 'string', description: 'Their email, if given.' },
      },
      required: ['date', 'time', 'golfer', 'players', 'source'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_send_pay_link',
    description:
      "Draft sending a booked group their link to check in and pay on their own phone (Apple Pay, Google Pay or card), by text or email, for the operator to confirm. This does NOT send anything — it shows a confirm card.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'The group’s day, YYYY-MM-DD.' },
        time: { type: 'string', description: 'The group’s tee time, 24-hour HH:MM.' },
        golfer: { type: 'string', description: 'The golfer name on the booking.' },
        via: { type: 'string', enum: ['sms', 'email'], description: 'Text or email.' },
      },
      required: ['date', 'time', 'golfer', 'via'],
      additionalProperties: false,
    },
  },
];

export type ProposalOutcome = ToolOutcome & { card?: ProposalCard };

const err = (msg: string): ProposalOutcome => ({ content: msg, isError: true });
const money = (v: unknown) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(2)}`);
const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const fmtDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const cardId = () => Math.random().toString(36).slice(2, 10);

function shown(card: ProposalCard): ProposalOutcome {
  return {
    content: `A confirm card is now showing the operator: "${card.title}" (${card.changes.map(c => `${c.label}: ${c.from} → ${c.to}`).join('; ')}). Nothing has changed yet — it only happens if they click Confirm. Tell them that in one short sentence; do not say it is done.`,
    isError: false,
    card,
  };
}

async function scheduleChange(input: Record<string, unknown>, ctx: ToolContext): Promise<ProposalOutcome> {
  if (!ctx.can('schedule.edit')) return err("This login can't change the schedule — the course owner decides that under Settings → Staff & permissions.");
  if (typeof input.scheduleId !== 'string') return err('Call get_schedules first and pass the schedule id.');
  const schedules = await listSchedules(ctx.courseId);   // scoped to the session's course
  const s = (schedules as Record<string, unknown>[]).find(x => x.id === input.scheduleId);
  if (!s) return err("That schedule isn't one of this course's. Call get_schedules for the right id.");

  const body: Record<string, unknown> = { id: s.id };
  const changes: ProposalCard['changes'] = [];
  const startTime = String(s.startTime), endTime = String(s.endTime);

  if (input.firstTee !== undefined) {
    if (typeof input.firstTee !== 'string' || !HHMM.test(input.firstTee)) return err('First tee must be HH:MM, 24-hour.');
    if (input.firstTee !== startTime) { body.startTime = input.firstTee; changes.push({ label: 'First tee', from: fmtTime(startTime), to: fmtTime(input.firstTee) }); }
  }
  if (input.lastTee !== undefined) {
    if (typeof input.lastTee !== 'string' || !HHMM.test(input.lastTee)) return err('Last tee must be HH:MM, 24-hour.');
    if (input.lastTee !== endTime) { body.endTime = input.lastTee; changes.push({ label: 'Last tee', from: fmtTime(endTime), to: fmtTime(input.lastTee) }); }
  }
  if (String(body.startTime ?? startTime) >= String(body.endTime ?? endTime)) return err('The first tee has to be before the last tee.');
  if (input.intervalMinutes !== undefined) {
    const n = Number(input.intervalMinutes);
    if (!Number.isInteger(n) || n < 5 || n > 20) return err('The interval must be a whole number of minutes from 5 to 20.');
    if (n !== Number(s.intervalMinutes)) { body.intervalMinutes = n; changes.push({ label: 'Interval', from: `every ${s.intervalMinutes} min`, to: `every ${n} min` }); }
  }
  if (input.days !== undefined) {
    if (!Array.isArray(input.days) || input.days.length === 0 || !input.days.every(d => DOW.includes(String(d)))) return err('Days must be a non-empty list like ["Sat","Sun"].');
    const next = [...new Set(input.days.map(d => DOW.indexOf(String(d))))].sort((a, b) => a - b);
    const cur = ((s.daysOfWeek as number[]) ?? []).slice().sort((a, b) => a - b);
    if (next.join() !== cur.join()) { body.daysOfWeek = next; changes.push({ label: 'Days', from: cur.map(d => DOW[d]).join(', ') || '—', to: next.map(d => DOW[d]).join(', ') }); }
  }
  const fee = (key: 'greenFeeWeekday' | 'greenFeeWeekend' | 'cartFee', label: string, max: number) => {
    if (input[key] === undefined) return null;
    const n = Number(input[key]);
    if (!Number.isFinite(n) || n < 0 || n > max) return `${label} must be between $0 and $${max}.`;
    const rounded = Math.round(n * 100) / 100;
    if (rounded !== Number(s[key])) { body[key] = rounded; changes.push({ label, from: money(s[key]), to: money(rounded) }); }
    return null;
  };
  for (const e of [fee('greenFeeWeekday', 'Weekday green fee', 1000), fee('greenFeeWeekend', 'Weekend green fee', 1000), fee('cartFee', 'Cart fee', 200)]) if (e) return err(e);
  if (input.running !== undefined) {
    if (typeof input.running !== 'boolean') return err('running must be true or false.');
    if (input.running !== Boolean(s.active)) { body.active = input.running; changes.push({ label: 'Schedule', from: s.active ? 'Running' : 'Paused', to: input.running ? 'Running' : 'Paused' }); }
  }
  if (changes.length === 0) return err('Nothing would change — those are already the current values.');

  const days = ((s.daysOfWeek as number[]) ?? []).map(d => DOW[d]).join(', ');
  return shown({
    id: cardId(),
    title: `Change the ${days || 'schedule'} schedule${s.productLabel ? ` (${s.productLabel})` : ''}`,
    changes,
    note: 'Upcoming open tee times are rebuilt to match. Times that already have bookings keep their golfers and the price they booked at.',
    call: { method: 'PATCH', path: '/api/operator/schedule', body },
  });
}

async function blockDay(input: Record<string, unknown>, ctx: ToolContext): Promise<ProposalOutcome> {
  if (!ctx.can('schedule.edit')) return err("This login can't block days — the course owner decides that under Settings → Staff & permissions.");
  const date = typeof input.date === 'string' ? input.date : '';
  if (!DATE.test(date)) return err('The date must be YYYY-MM-DD.');
  if (date < todayIn(ctx.timezone)) return err("That day has already gone by.");
  const reason = typeof input.reason === 'string' ? input.reason.replace(/[\r\n]+/g, ' ').trim().slice(0, 120) : '';
  const [existing, booked] = await Promise.all([
    prisma.blackout.findFirst({ where: { courseId: ctx.courseId, date }, select: { id: true } }),
    prisma.booking.count({ where: { courseId: ctx.courseId, status: 'confirmed', teeTime: { date } } }),
  ]);
  if (existing) return err(`${fmtDate(date)} is already blocked.`);
  return shown({
    id: cardId(),
    title: `Block ${fmtDate(date)}`,
    changes: [{ label: fmtDate(date), from: 'Open for booking', to: reason ? `Blocked — ${reason}` : 'Blocked' }],
    note: booked > 0
      ? `Open times that day are removed. ${booked} booking${booked === 1 ? '' : 's'} already on that day ${booked === 1 ? 'stays' : 'stay'} — nobody is cancelled (cancelling for weather is the Weather button on the Tee Sheet).`
      : 'Open times that day are removed. There are no bookings on that day.',
    call: { method: 'POST', path: '/api/operator/blackouts', body: { date, reason } },
  });
}

async function unblockDay(input: Record<string, unknown>, ctx: ToolContext): Promise<ProposalOutcome> {
  if (!ctx.can('schedule.edit')) return err("This login can't reopen days — the course owner decides that under Settings → Staff & permissions.");
  const date = typeof input.date === 'string' ? input.date : '';
  if (!DATE.test(date)) return err('The date must be YYYY-MM-DD.');
  const blackout = await prisma.blackout.findFirst({ where: { courseId: ctx.courseId, date }, select: { id: true, reason: true } });
  if (!blackout) return err(`${fmtDate(date)} isn't blocked.`);
  return shown({
    id: cardId(),
    title: `Reopen ${fmtDate(date)}`,
    changes: [{ label: fmtDate(date), from: blackout.reason ? `Blocked — ${blackout.reason}` : 'Blocked', to: 'Open for booking' }],
    note: 'The day stops being blocked. Its tee times come back from your schedule on the next rebuild (tonight, or Apply to tee sheet on the Schedule page).',
    call: { method: 'DELETE', path: '/api/operator/blackouts', body: { id: blackout.id } },
  });
}

// ── ACT-2: the tee sheet ────────────────────────────────────────────────────
const nameOk = (v: unknown) => typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 120;

/** The one confirmed group at date + time whose name matches, or an error. */
async function findGroup(ctx: ToolContext, date: unknown, time: unknown, golfer: unknown) {
  if (typeof date !== 'string' || !DATE.test(date)) return { error: 'The day must be YYYY-MM-DD.' };
  if (typeof time !== 'string' || !HHMM.test(time)) return { error: 'The tee time must be HH:MM, 24-hour.' };
  if (!nameOk(golfer)) return { error: 'Give the golfer’s name as the tee sheet shows it.' };
  const slot = await prisma.teeTime.findFirst({ where: { courseId: ctx.courseId, date, time }, select: { id: true } });
  if (!slot) return { error: `There’s no ${fmtTime(time)} tee time on ${fmtDate(date)}. Call get_tee_sheet for that day.` };
  const groups = await prisma.booking.findMany({
    where: { courseId: ctx.courseId, teeTimeId: slot.id, status: 'confirmed' },
    select: { id: true, golferName: true, golferEmail: true, golferPhone: true, players: true, stripePaymentMethodId: true, checkInToken: true, accessFeeTotal: true },
  });
  const want = String(golfer).trim().toLowerCase();
  // An exact name always wins ("Alan Smith" isn't ambiguous just because "Al" is also booked).
  const exact = groups.filter(g => g.golferName.toLowerCase() === want);
  if (exact.length === 1) return { group: exact[0] };
  const hits = groups.filter(g => g.golferName.toLowerCase().includes(want) || want.includes(g.golferName.toLowerCase()));
  if (hits.length === 0) return { error: `No booked group called “${String(golfer).trim()}” at ${fmtTime(time)} on ${fmtDate(date)}.${groups.length ? ` That time has: ${groups.map(g => g.golferName).join(', ')}.` : ''}` };
  if (hits.length > 1) return { error: `More than one group matches at ${fmtTime(time)}: ${hits.map(g => g.golferName).join(', ')}. Ask which one.` };
  return { group: hits[0] };
}

async function moveGroup(input: Record<string, unknown>, ctx: ToolContext): Promise<ProposalOutcome> {
  if (!ctx.can('sheet.move')) return err("This login can't move groups — the course owner decides that under Settings → Staff & permissions.");
  const found = await findGroup(ctx, input.date, input.time, input.golfer);
  if ('error' in found) return err(found.error as string);
  const toDate = input.toDate === undefined ? String(input.date) : input.toDate;
  if (typeof toDate !== 'string' || !DATE.test(toDate)) return err('The new day must be YYYY-MM-DD.');
  if (typeof input.toTime !== 'string' || !HHMM.test(input.toTime)) return err('The new tee time must be HH:MM, 24-hour.');
  const target = await prisma.teeTime.findFirst({ where: { courseId: ctx.courseId, date: toDate, time: input.toTime }, select: { id: true } });
  if (!target) return err(`There’s no ${fmtTime(input.toTime)} tee time on ${fmtDate(toDate)}.`);
  // The real move's own checks and price, run as a dry run: nothing changes.
  const r = await moveBooking({ bookingId: found.group.id, newTeeTimeId: target.id, courseId: ctx.courseId, pricing: 'keep', actor: { type: 'staff' }, dryRun: true });
  if (!r.ok) return err(r.message);
  const g = found.group;
  const emailable = !!g.golferEmail && !isPlaceholderEmail(g.golferEmail);
  const notes = [
    ctx.can('money.payments') ? `The price stays ${money(r.totals.totalAmount / 100)}.` : 'The price stays what they booked.',
    emailable ? 'They’re emailed the new time.' : 'There’s no email on file, so let them know.',
  ];
  if (r.holdDueCents > 0) notes.push(`The new time is already inside the free-cancellation window, so their ${money(r.holdDueCents / 100)} hold is charged within the hour (refunded at check-in).`);
  return shown({
    id: cardId(),
    title: `Move ${g.golferName} (${g.players})`,
    changes: [{ label: 'Tee time', from: `${fmtDate(String(input.date))} · ${fmtTime(String(input.time))}`, to: `${fmtDate(toDate)} · ${fmtTime(input.toTime)}` }],
    note: notes.join(' '),
    call: { method: 'PATCH', path: '/api/operator/bookings', body: { id: g.id, action: 'move', newTeeTimeId: target.id } },
  });
}

async function blockTimes(input: Record<string, unknown>, ctx: ToolContext): Promise<ProposalOutcome> {
  if (!ctx.can('sheet.block')) return err("This login can't block tee times — the course owner decides that under Settings → Staff & permissions.");
  const date = typeof input.date === 'string' ? input.date : '';
  if (!DATE.test(date)) return err('The day must be YYYY-MM-DD.');
  if (date < todayIn(ctx.timezone)) return err('That day has already gone by.');
  if (typeof input.from !== 'string' || !HHMM.test(input.from)) return err('The first time must be HH:MM, 24-hour.');
  const to = input.to === undefined ? input.from : input.to;
  if (typeof to !== 'string' || !HHMM.test(to)) return err('The last time must be HH:MM, 24-hour.');
  if (to < input.from) return err('The last time is before the first.');
  if (typeof input.block !== 'boolean') return err('block must be true or false.');
  const block = input.block;
  const slots = await prisma.teeTime.findMany({
    where: { courseId: ctx.courseId, date, time: { gte: input.from, lte: to } },
    orderBy: { time: 'asc' },
    select: { id: true, time: true, status: true, playersBooked: true },
  });
  const change = slots.filter(t => block ? t.status !== 'blocked' : t.status === 'blocked');
  if (slots.length === 0) return err(`There are no tee times from ${fmtTime(input.from)} to ${fmtTime(to)} on ${fmtDate(date)}.`);
  if (change.length === 0) return err(`Those times are already ${block ? 'blocked' : 'open'}.`);
  if (change.length > 60) return err('That’s more than 60 tee times — block the whole day instead.');
  const booked = change.filter(t => t.playersBooked > 0).length;
  const span = change.length === 1 ? fmtTime(change[0].time) : `${fmtTime(change[0].time)} – ${fmtTime(change[change.length - 1].time)}`;
  const calls = change.map(t => ({ method: 'PATCH' as const, path: '/api/operator/tee-times' as const, body: { id: t.id, status: block ? 'blocked' : 'available' } }));
  return shown({
    id: cardId(),
    title: `${block ? 'Block' : 'Reopen'} ${change.length} tee time${change.length === 1 ? '' : 's'} on ${fmtDate(date)}`,
    changes: [{ label: span, from: block ? 'Open' : 'Blocked', to: block ? 'Blocked' : 'Open' }],
    note: block
      ? (booked ? `${booked} of these already ${booked === 1 ? 'has a booked group' : 'have booked groups'} — they stay booked; nobody is cancelled. New bookings stop.` : 'Nobody is booked on these times. New bookings stop.')
      : 'Golfers can book these times again.',
    call: calls[0],
    calls,
  });
}

async function addBooking(input: Record<string, unknown>, ctx: ToolContext): Promise<ProposalOutcome> {
  if (!ctx.can('sheet.walkin')) return err("This login can't add bookings — the course owner decides that under Settings → Staff & permissions.");
  const date = typeof input.date === 'string' ? input.date : '';
  if (!DATE.test(date)) return err('The day must be YYYY-MM-DD.');
  if (date < todayIn(ctx.timezone)) return err('That day has already gone by.');
  if (typeof input.time !== 'string' || !HHMM.test(input.time)) return err('The tee time must be HH:MM, 24-hour.');
  if (!nameOk(input.golfer)) return err('Give the golfer’s name.');
  const players = Number(input.players);
  if (!Number.isInteger(players) || players < 1 || players > 4) return err('Players must be 1 to 4.');
  const source = input.source === 'phone' ? 'phone' : input.source === 'walk_in' ? 'walk_in' : null;
  if (!source) return err('source must be phone or walk_in.');
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase().slice(0, 200) : '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('That email doesn’t look right.');
  const phone = typeof input.phone === 'string' ? input.phone.trim().slice(0, 40) : '';
  const slot = await prisma.teeTime.findFirst({
    where: { courseId: ctx.courseId, date, time: input.time },
    select: { id: true, status: true, playersAvailable: true, playersBooked: true, greenFeeCents: true },
  });
  if (!slot) return err(`There’s no ${fmtTime(input.time)} tee time on ${fmtDate(date)}.`);
  if (slot.status === 'blocked') return err(`${fmtTime(input.time)} is blocked.`);
  const open = slot.playersAvailable - slot.playersBooked;
  if (open < players) return err(`${fmtTime(input.time)} has room for ${open}, not ${players}.`);
  const name = String(input.golfer).trim();
  return shown({
    id: cardId(),
    title: `Add ${name} (${players}) at ${fmtTime(input.time)}`,
    changes: [{ label: `${fmtDate(date)} · ${fmtTime(input.time)}`, from: `${open} open`, to: `${name} · ${players} (${source === 'phone' ? 'phone' : 'walk-in'})` }],
    note: `They pay at the counter${ctx.can('money.payments') ? ` — green fee ${money(slot.greenFeeCents * players / 100)}` : ''}. No booking fee on a counter booking.`,
    call: { method: 'POST', path: '/api/operator/bookings', body: { teeTimeId: slot.id, golferName: name, players, source, ...(phone ? { golferPhone: phone } : {}), ...(email ? { golferEmail: email } : {}) } },
  });
}

async function sendPayLink(input: Record<string, unknown>, ctx: ToolContext): Promise<ProposalOutcome> {
  if (!ctx.can('sheet.checkin')) return err("This login can't send pay links — the course owner decides that under Settings → Staff & permissions.");
  const via = input.via === 'sms' ? 'sms' : input.via === 'email' ? 'email' : null;
  if (!via) return err('via must be sms or email.');
  const found = await findGroup(ctx, input.date, input.time, input.golfer);
  if ('error' in found) return err(found.error as string);
  const g = found.group;
  if (g.stripePaymentMethodId) return err(`${g.golferName} already has a card on file — they’re charged when they check in, so there’s no pay link to send.`);
  if (via === 'sms' && (g.golferPhone || '').replace(/\D/g, '').length < 10) return err(`There’s no mobile number on ${g.golferName}’s booking — try email, or take payment at the counter.`);
  if (via === 'email' && (!g.golferEmail || isPlaceholderEmail(g.golferEmail))) return err(`There’s no email on ${g.golferName}’s booking — try a text, or take payment at the counter.`);
  if (via === 'email' && !g.checkInToken) return err(`${g.golferName}’s booking has no pay link — send it by text instead, or check them in at the counter.`);
  return shown({
    id: cardId(),
    title: `${via === 'sms' ? 'Text' : 'Email'} ${g.golferName} their pay link`,
    changes: [{ label: `${fmtDate(String(input.date))} · ${fmtTime(String(input.time))}`, from: 'Not paid', to: `Pay link ${via === 'sms' ? 'texted' : 'emailed'}` }],
    note: `They check in and pay on their own phone — Apple Pay, Google Pay or card.${g.accessFeeTotal > 0 ? ' The booking fee is collected with the round.' : ''}`,
    call: { method: 'PATCH', path: '/api/operator/bookings', body: { id: g.id, action: 'send_pay_link', via } },
  });
}

/** Runs one propose_* call. Bad input comes back as an error, never a card. */
export async function runProposeTool(name: string, input: unknown, ctx: ToolContext): Promise<ProposalOutcome> {
  const args = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  switch (name) {
    case 'propose_schedule_change': return scheduleChange(args, ctx);
    case 'propose_block_day': return blockDay(args, ctx);
    case 'propose_unblock_day': return unblockDay(args, ctx);
    case 'propose_move_group': return moveGroup(args, ctx);
    case 'propose_block_times': return blockTimes(args, ctx);
    case 'propose_add_booking': return addBooking(args, ctx);
    case 'propose_send_pay_link': return sendPayLink(args, ctx);
    default: return err(`There is no tool called ${name}.`);
  }
}

export const isProposeTool = (name: string) => PROPOSE_TOOLS.some(t => t.name === name);
