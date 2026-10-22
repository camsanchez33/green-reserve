// AW-5 (Cam 2026-10-21: "hourly; a morning digest email plus an immediate
// alert for anything urgent"). Run from the hourly cron.
//
// Urgent alerts are RULES, not the model: each problem below has a stable key,
// is emailed to the admin inbox once when it first appears, and is marked
// resolved when a later run no longer sees it (AdminAlert). The model only
// writes the two-sentence summary at the top of the morning digest, and that
// summary is dropped if it carries a number the facts don't (monthly-review's
// validateNumbers) — the digest itself is built from the same numbers as Today.
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma';
import { REAL_COURSE, ON_REAL_COURSE } from './real-courses';
import { dayKey, platformHour } from './admin-day';
import { FAILED_CHARGE_WHERE, openDisputes } from './money-problems';
import { cronHealth, lastStripeWebhook } from './cron-log';
import { todayMoney, todayOnboarding } from './admin-today';
import { buildActionQueue } from './admin-action-queue';
import { draftProblems } from './monthly-review';
import { sendAdminUrgentAlert, sendAdminDigest } from './email';
import vercelConfig from '../../vercel.json';

const CRONS = ((vercelConfig as { crons?: { path: string; schedule: string }[] }).crons ?? []);
/** The digest goes out on the first hourly run at or after this hour, US Eastern. */
export const DIGEST_HOUR_ET = 7;
const WEBHOOK_QUIET_DAYS = 7;
const SUMMARY_MODEL = 'claude-opus-5-5';
const DIGEST_CLAIM_STALE_MS = 20 * 60_000;

/** BRAIN-2a: `courseId` when the problem is about one course — the Problems page and the course timeline file it there. */
export type Finding = { key: string; title: string; detail: string; href: string; courseId?: string | null };

/** Everything urgent right now. Site errors go to Sentry (BRAIN-0), not here. */
export async function urgentFindings(now = new Date()): Promise<Finding[]> {
  const [failed, disputes, jobs, webhook, noStripe, onboarding] = await Promise.all([
    prisma.booking.findMany({ where: { ...FAILED_CHARGE_WHERE, ...ON_REAL_COURSE }, select: { courseId: true, totalAmount: true, course: { select: { name: true } } } }),
    openDisputes(),
    cronHealth(CRONS, now),
    lastStripeWebhook(),
    prisma.course.findMany({ where: { active: true, stripeAccountActive: false, archivedAt: null, ...REAL_COURSE }, select: { id: true, name: true } }),
    todayOnboarding(now),
  ]);
  const out: Finding[] = [];

  const byCourse = new Map<string, { name: string; n: number; cents: number }>();
  for (const b of failed) {
    const g = byCourse.get(b.courseId) ?? { name: b.course.name, n: 0, cents: 0 };
    g.n++; g.cents += b.totalAmount; byCourse.set(b.courseId, g);
  }
  for (const [courseId, g] of byCourse) {
    out.push({ key: `failed:${courseId}`, title: `Card declined at check-in — ${g.name}`, detail: `${g.n} round${g.n === 1 ? '' : 's'}, $${(g.cents / 100).toFixed(2)} not collected.`, href: '/admin/revenue?tab=uncollected', courseId });
  }
  for (const d of disputes) {
    out.push({ key: `dispute:${d.id}`, title: `Chargeback opened — ${d.booking?.course.name ?? 'a course'}`, detail: `$${(d.amountCents / 100).toFixed(2)} from ${d.booking?.golferName ?? 'a golfer'}. Answer it in Stripe before the deadline.`, href: '/admin/revenue?tab=disputes', courseId: d.booking?.course.id ?? null });
  }
  for (const j of jobs.filter(j => j.status === 'bad')) {
    out.push({ key: `cron:${j.job}`, title: `Scheduled job failing — ${j.job}`, detail: j.note, href: '/admin/system' });
  }
  if (webhook?.outcome === 'error') {
    out.push({ key: 'webhook:stripe:error', title: 'Stripe events are failing', detail: webhook.error || 'The last Stripe event failed to process.', href: '/admin/system' });
  } else if (webhook && now.getTime() - new Date(webhook.at).getTime() > WEBHOOK_QUIET_DAYS * 86_400_000) {
    out.push({ key: 'webhook:stripe:quiet', title: 'No Stripe events for a week', detail: 'Check the webhook is still registered in Stripe.', href: '/admin/system' });
  }
  for (const c of noStripe) {
    out.push({ key: `nostripe:${c.id}`, title: `Live but can't take payments — ${c.name}`, detail: 'Stripe setup isn’t finished.', href: `/admin/courses?courseId=${c.id}&tab=setup`, courseId: c.id });
  }
  for (const st of onboarding.stages) {
    for (const s of st.stuck) {
      // The stage is in the key, so moving on and getting stuck again alerts again.
      out.push({ key: `stuck:${s.id}:${st.key}`, title: `Stuck in onboarding — ${s.name}`, detail: `${s.days} days at "${st.label}"${s.waitingOn === 'us' ? ', waiting on us' : s.waitingOn === 'them' ? ', waiting on the course' : ''}.`, href: `/admin/inquiries/${s.id}` });
    }
  }
  return out;
}

/** Record what's urgent; email the new ones; resolve what cleared. */
export async function runUrgentChecks(now = new Date(), send: typeof sendAdminUrgentAlert = sendAdminUrgentAlert): Promise<{ open: number; alerted: number; resolved: number }> {
  const found = await urgentFindings(now);
  const keys = found.map(f => f.key);
  const existing = await prisma.adminAlert.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(existing.map(e => [e.key, e]));
  const fresh: Finding[] = [];
  for (const f of found) {
    const row = byKey.get(f.key);
    if (!row) {
      // upsert: an overlapping run that created it a moment ago must not throw here.
      const r = await prisma.adminAlert.upsert({ where: { key: f.key }, create: { key: f.key, kind: 'urgent', title: f.title, detail: f.detail, href: f.href, courseId: f.courseId ?? null, firstSeenAt: now, lastSeenAt: now }, update: { lastSeenAt: now } });
      // BRAIN-2a: the problem's history starts here (once, even if two runs overlap).
      if (r.firstSeenAt.getTime() === now.getTime()) await prisma.adminAlertEvent.create({ data: { alertId: r.id, kind: 'opened', actorName: 'hourly check', text: f.detail, createdAt: now } });
      if (!r.alertedAt) fresh.push(f);
    } else {
      const reopened = row.resolvedAt !== null;
      await prisma.adminAlert.update({ where: { id: row.id }, data: {
        title: f.title, detail: f.detail, href: f.href, courseId: f.courseId ?? row.courseId, lastSeenAt: now,
        // A problem that came back starts unowned and unsnoozed: it is a new occurrence.
        ...(reopened ? { resolvedAt: null, firstSeenAt: now, alertedAt: null, ownerId: null, ownerName: '', snoozedUntil: null, snoozeReason: '' } : {}),
      } });
      if (reopened) await prisma.adminAlertEvent.create({ data: { alertId: row.id, kind: 'reopened', actorName: 'hourly check', text: f.detail, createdAt: now } });
      // Not emailed yet (a new one, a reopened one, or last hour's email failed).
      if (reopened || !row.alertedAt) fresh.push(f);
    }
  }
  // Cleared: the check no longer sees it. Each gets a history line.
  const clearing = await prisma.adminAlert.findMany({ where: { kind: 'urgent', resolvedAt: null, key: { notIn: keys } }, select: { id: true } });
  const resolved = await prisma.adminAlert.updateMany({ where: { id: { in: clearing.map(c => c.id) }, resolvedAt: null }, data: { resolvedAt: now } });
  if (clearing.length) await prisma.adminAlertEvent.createMany({ data: clearing.map(c => ({ alertId: c.id, kind: 'cleared', actorName: 'hourly check', createdAt: now })) });
  let alerted = 0;
  if (fresh.length) {
    try {
      await send({ findings: fresh });
      await prisma.adminAlert.updateMany({ where: { key: { in: fresh.map(f => f.key) } }, data: { alertedAt: now } });
      alerted = fresh.length;
    } catch (err) {
      // Left un-alerted, so the next hourly run tries again.
      console.error(JSON.stringify({ ev: 'admin.alert.fail', count: fresh.length, error: err instanceof Error ? err.message : String(err) }));
    }
  }
  return { open: found.length, alerted, resolved: resolved.count };
}

export type DigestFacts = {
  date: string;
  urgentOpen: { title: string; detail: string; since: string }[];
  needsYou: { total: number; money: number; stalled: number };
  money: { daysIn: number; volume: number; volumeLastMonth: number; fees: number; feesLastMonth: number; net: number | null; netLastMonth: number | null };
  onboarding: { stage: string; count: number; stuck: number }[];
};

export async function digestFacts(now = new Date()): Promise<DigestFacts> {
  const [open, needs, money, onboarding] = await Promise.all([
    prisma.adminAlert.findMany({ where: { kind: 'urgent', resolvedAt: null }, orderBy: { firstSeenAt: 'asc' } }),
    buildActionQueue(now),
    todayMoney(now, true),
    todayOnboarding(now),
  ]);
  return {
    date: dayKey(now),
    urgentOpen: open.map(a => ({ title: a.title, detail: a.detail, since: dayKey(a.firstSeenAt) })),
    needsYou: { total: needs.rows.length, money: needs.redCount, stalled: needs.amberCount },
    money: {
      daysIn: money.daysIn,
      volume: money.current.volume, volumeLastMonth: money.prior.volume,
      fees: money.current.fees, feesLastMonth: money.prior.fees,
      net: money.net?.current ?? null, netLastMonth: money.net?.prior ?? null,
    },
    onboarding: onboarding.stages.map(s => ({ stage: s.label, count: s.count, stuck: s.stuck.length })),
  };
}

export type Summarizer = (facts: DigestFacts) => Promise<string>;

const SUMMARY_SYSTEM = `You write the first two sentences of GreenReserve's morning email to its own founder. GreenReserve is a golf tee-sheet platform.

You get one JSON object of facts the software computed. Say what matters most this morning: anything urgent first, then how the month compares with last month. Use only numbers that appear in the facts, written the same way; never compute a new one (no percentages, no differences). Plain words, no preamble, no sign-off, no lists. Two sentences.`;

async function claudeSummary(facts: DigestFacts): Promise<string> {
  // Bounded: this runs inside the hourly cron that charges holds.
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  const msg = await client.messages.create({
    model: SUMMARY_MODEL, max_tokens: 4000, system: SUMMARY_SYSTEM,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: JSON.stringify(facts) }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  if (msg.stop_reason !== 'end_turn') { console.error(JSON.stringify({ ev: 'admin.digest.summary_stop', stop: msg.stop_reason })); return ''; }
  return msg.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('').trim();
}

/** The model's summary, or '' when there's no key, it fails, or it carries a number the facts don't. */
export async function digestSummary(facts: DigestFacts, write: Summarizer | null = process.env.ANTHROPIC_API_KEY ? claudeSummary : null): Promise<string> {
  if (!write) return '';
  try {
    const text = (await write(facts)).slice(0, 600);
    const bad = draftProblems(text, facts);
    if (bad.length) { console.error(JSON.stringify({ ev: 'admin.digest.summary_rejected', numbers: bad })); return ''; }
    return text;
  } catch (err) {
    console.error(JSON.stringify({ ev: 'admin.digest.summary_fail', error: err instanceof Error ? err.message : String(err) }));
    return '';
  }
}

/** Both, for the hourly cron. Neither can stop the other or the cron's money steps. */
export async function runAdminChecks(now = new Date()) {
  let urgent: Awaited<ReturnType<typeof runUrgentChecks>> | { error: string };
  try { urgent = await runUrgentChecks(now); } catch (err) { console.error('Admin urgent checks failed:', err); urgent = { error: 'failed' }; }
  const digest = await runMorningDigest(now).catch(err => { console.error('Admin digest failed:', err); return 'failed' as const; });
  return { urgent, digest };
}

/** Once a day, on the first run at or after DIGEST_HOUR_ET. The row is claimed before sending so two runs can't both send. */
export async function runMorningDigest(now = new Date(), write?: Summarizer | null, send: typeof sendAdminDigest = sendAdminDigest): Promise<'sent' | 'not_yet' | 'already' | 'failed'> {
  if (platformHour(now) < DIGEST_HOUR_ET) return 'not_yet';
  const key = `digest:${dayKey(now)}`;
  // A claim left by a run that was killed mid-send (no alertedAt, 20+ minutes
  // old) is taken over, so a hung run can't cost the day's digest.
  const takenOver = await prisma.adminAlert.updateMany({ where: { key, kind: 'digest', alertedAt: null, lastSeenAt: { lt: new Date(now.getTime() - DIGEST_CLAIM_STALE_MS) } }, data: { lastSeenAt: now } });
  if (takenOver.count !== 1) {
    try {
      await prisma.adminAlert.create({ data: { key, kind: 'digest', title: `Morning digest ${dayKey(now)}`, firstSeenAt: now, lastSeenAt: now } });
    } catch {
      return 'already';
    }
  }
  let sent = false;
  try {
    const facts = await digestFacts(now);
    const summary = await digestSummary(facts, write);
    await send({ facts, summary });
    sent = true;
    await prisma.adminAlert.update({ where: { key }, data: { alertedAt: now } });
    return 'sent';
  } catch (err) {
    if (sent) {
      // It went out; only the bookkeeping failed. Never release, or it would send twice.
      console.error(JSON.stringify({ ev: 'admin.digest.mark_fail', error: err instanceof Error ? err.message : String(err) }));
      return 'sent';
    }
    // Release the claim so the next hourly run tries again.
    await prisma.adminAlert.delete({ where: { key } }).catch(() => {});
    console.error(JSON.stringify({ ev: 'admin.digest.fail', error: err instanceof Error ? err.message : String(err) }));
    return 'failed';
  }
}
