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
// running/paused), block a day, unblock a day. Never money movement, refunds,
// the cancellation policy, Stripe or staff — there is no tool for those, and
// the system prompt tells Birdie to say so.
import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../prisma';
import { listSchedules } from '../schedule-service';
import { todayIn } from '../course-time';
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

/** Runs one propose_* call. Bad input comes back as an error, never a card. */
export async function runProposeTool(name: string, input: unknown, ctx: ToolContext): Promise<ProposalOutcome> {
  const args = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  switch (name) {
    case 'propose_schedule_change': return scheduleChange(args, ctx);
    case 'propose_block_day': return blockDay(args, ctx);
    case 'propose_unblock_day': return unblockDay(args, ctx);
    default: return err(`There is no tool called ${name}.`);
  }
}

export const isProposeTool = (name: string) => PROPOSE_TOOLS.some(t => t.name === name);
