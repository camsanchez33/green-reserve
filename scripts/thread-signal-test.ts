// MP-7a — assertions on lib/thread-signal, the one derivation behind the
// Overview's "unanswered" rows and the Messages inbox order.
//   npx tsx scripts/thread-signal-test.ts
import { threadSignal, compareThreads, UNANSWERED_AFTER_DAYS } from '../src/lib/thread-signal';

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

console.log(failed === 0 ? '\nALL PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
