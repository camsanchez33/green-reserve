// MP-7a — assertions on lib/thread-signal, the one derivation behind the
// Overview's "unanswered" rows and the Messages inbox order.
//   npx tsx scripts/thread-signal-test.ts
import { threadSignal, compareThreads, longestWaiting, UNANSWERED_AFTER_DAYS } from '../src/lib/thread-signal';

let failed = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) console.log('  ok   ', name);
  else { failed++; console.log('  FAIL ', name, got !== undefined ? '— got: ' + JSON.stringify(got) : ''); }
}
const now = new Date('2026-09-04T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

console.log('threadSignal');
{
  const s = threadSignal([], now);
  check('empty thread is not waiting', !s.waitingOnUs && s.ageDays === 0 && !s.overdue && s.lastHumanAt === null, s);
}
{
  const s = threadSignal([{ senderType: 'operator', createdAt: daysAgo(3) }], now);
  check('operator message 3d old → waiting + overdue, age 3', s.waitingOnUs && s.overdue && s.ageDays === 3, s);
}
{
  const s = threadSignal([{ senderType: 'operator', createdAt: daysAgo(1) }], now);
  check(`operator message 1d old → waiting, not overdue (threshold ${UNANSWERED_AFTER_DAYS})`, s.waitingOnUs && !s.overdue && s.ageDays === 1, s);
}
{
  const s = threadSignal([{ senderType: 'admin', createdAt: daysAgo(0.5) }, { senderType: 'operator', createdAt: daysAgo(5) }], now);
  check('admin replied → not waiting', !s.waitingOnUs && !s.overdue, s);
}
{
  // THE case this file exists for: a broadcast on top of an unanswered question.
  const s = threadSignal([
    { senderType: 'admin', createdAt: daysAgo(0.2), isBroadcast: true },
    { senderType: 'operator', createdAt: daysAgo(4) },
  ], now);
  check('announcement does NOT count as a reply', s.waitingOnUs && s.overdue && s.ageDays === 4, s);
}
{
  const s = threadSignal([{ senderType: 'admin', createdAt: daysAgo(1), isBroadcast: true }], now);
  check('broadcast-only thread is not waiting', !s.waitingOnUs && s.lastHumanAt === null, s);
}
{
  const s = threadSignal([{ senderType: 'operator', createdAt: daysAgo(2).toISOString() }], now);
  check('accepts ISO strings; exactly 2d is overdue', s.overdue && s.ageDays === 2, s);
}
{
  const s = threadSignal([{ senderType: 'operator', createdAt: new Date(now.getTime() + 60000) }], now);
  check('clock skew never yields a negative age', s.ageDays === 0, s);
}

{
  // SUPPORT (Cam 2026-11-12): 2 business days, weekends skipped. Friday 10am Eastern → due Tuesday 10am (a week with no federal holiday; Labor Day weeks shift, see the holiday tests).
  const fri = new Date('2026-09-11T14:00:00Z');
  const mon = new Date('2026-09-14T16:00:00Z'), tue = new Date('2026-09-15T14:30:00Z');
  const s1 = threadSignal([{ senderType: 'operator', createdAt: fri }], mon);
  check('a Friday message is 3 days old on Monday but not overdue (the weekend doesn\'t count)', s1.waitingOnUs && !s1.overdue && s1.ageDays === 3 && s1.dueAt?.toISOString() === '2026-09-15T14:00:00.000Z', s1);
  check('…and overdue on Tuesday after 10am', threadSignal([{ senderType: 'operator', createdAt: fri }], tue).overdue);
  const s2 = threadSignal([{ senderType: 'operator', createdAt: daysAgo(0.1) }, { senderType: 'operator', createdAt: daysAgo(3) }], now);
  check('the promise runs from the FIRST unanswered message, not the latest', s2.overdue, s2);
  check('answered → no due time', threadSignal([{ senderType: 'admin', createdAt: daysAgo(1) }], now).dueAt === null);
}

console.log('compareThreads');
{
  const mk = (id: string, msgs: Parameters<typeof threadSignal>[0], updatedAt: Date) => ({ id, signal: threadSignal(msgs, now), updatedAt });
  const answeredRecent = mk('answered-recent', [{ senderType: 'admin', createdAt: daysAgo(0.1) }], daysAgo(0.1));
  const waiting1 = mk('waiting-1d', [{ senderType: 'operator', createdAt: daysAgo(1) }], daysAgo(1));
  const waiting9 = mk('waiting-9d', [{ senderType: 'operator', createdAt: daysAgo(9) }], daysAgo(9));
  const answeredOld = mk('answered-old', [{ senderType: 'admin', createdAt: daysAgo(30) }], daysAgo(30));
  const broadcastOnTop = mk('bcast-on-top', [{ senderType: 'admin', createdAt: daysAgo(0.01), isBroadcast: true }, { senderType: 'operator', createdAt: daysAgo(6) }], daysAgo(0.01));
  const order = [answeredRecent, waiting1, answeredOld, broadcastOnTop, waiting9].sort(compareThreads).map(t => t.id);
  check('waiting first, longest wait on top, then by activity',
    JSON.stringify(order) === JSON.stringify(['waiting-9d', 'bcast-on-top', 'waiting-1d', 'answered-recent', 'answered-old']), order);
}

// The action queue's pick among a course's overdue chats, on fixed dates (not the day the test runs).
{
  const now = new Date('2026-11-17T14:00:00Z'); // a Tuesday
  const op = (iso: string) => ({ senderType: 'operator', createdAt: new Date(iso) });
  const sat = { id: 'sat', signal: threadSignal([op('2026-11-07T14:00:00Z')], now) };
  const sun = { id: 'sun', signal: threadSignal([op('2026-11-08T14:00:00Z')], now) };
  check('a Saturday and a Sunday message are due at the same time (the tie)', sat.signal.dueAt?.getTime() === sun.signal.dueAt?.getTime(), [sat.signal.dueAt, sun.signal.dueAt]);
  check('on that tie, the chat waiting since Saturday wins, in either order', longestWaiting([sun, sat])?.id === 'sat' && longestWaiting([sat, sun])?.id === 'sat');
  // Saturday, then a follow-up Monday: still waiting since Saturday, so it beats a single Sunday message.
  const followed = { id: 'followed', signal: threadSignal([op('2026-11-09T20:00:00Z'), op('2026-11-07T14:00:00Z')], now) };
  check('a follow-up never makes a chat look newer', followed.signal.waitingSince?.toISOString() === '2026-11-07T14:00:00.000Z' && longestWaiting([sun, followed])?.id === 'followed');
  const answered = { id: 'answered', signal: threadSignal([{ senderType: 'admin', createdAt: new Date('2026-11-06T14:00:00Z') }], now) };
  const fresh = { id: 'fresh', signal: threadSignal([op('2026-11-17T13:00:00Z')], now) };
  check('nothing overdue → null; a chat not yet overdue is never picked', longestWaiting([answered, fresh]) === null && longestWaiting([fresh, sun, answered])?.id === 'sun');
  // Two overdue chats with different due times: Wed Nov 11 (due later) against Sunday (due Nov 12).
  const wed = { id: 'wed', signal: threadSignal([op('2026-11-11T14:00:00Z')], now) };
  check('of two overdue chats, the earlier due time wins', wed.signal.overdue && (wed.signal.dueAt?.getTime() ?? 0) > (sun.signal.dueAt?.getTime() ?? 0) && longestWaiting([wed, sun])?.id === 'sun' && longestWaiting([sun, wed])?.id === 'sun', [wed.signal, sun.signal]);
}

console.log(failed === 0 ? '\nALL PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
