// ADMIN-REDO Business analytics: the courses-joining funnel and the fill average (src/lib/business-analytics.ts).
// Pure: `npx tsx scripts/business-analytics-test.ts`.
import { milestones, joiningFunnel, averageFill, fillPct, type InquiryForFunnel } from '../src/lib/business-analytics';

let failed = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!cond) failed++;
};
const d = (day: number) => new Date(Date.UTC(2026, 9, day, 15)); // Oct <day> 2026
const base = (o: Partial<InquiryForFunnel>): InquiryForFunnel => ({
  createdAt: d(1), status: 'in_review', wentLiveAt: null, touches: [], events: [], calls: [], builtAt: null, signedAt: null, ...o,
});

// An outbound course all the way to live.
const outLive = base({
  status: 'live', createdAt: d(1),
  touches: [{ at: d(3), direction: 'out' }, { at: d(5), direction: 'out' }, { at: d(6), direction: 'in' }],
  events: [{ fromStatus: 'lead', toStatus: 'lead', createdAt: d(1) }, { fromStatus: 'lead', toStatus: 'in_review', createdAt: d(7) }],
  calls: [{ outcome: 'talked', scheduledAt: d(9), completedAt: d(9) }],
  builtAt: d(12), signedAt: d(14), wentLiveAt: d(20),
});
// An outbound course that never replied.
const outSilent = base({ status: 'lead', createdAt: d(2), touches: [{ at: d(4), direction: 'out' }], events: [{ fromStatus: 'lead', toStatus: 'lead', createdAt: d(2) }, { fromStatus: 'lead', toStatus: 'lead', createdAt: d(5) }] });
// A lead we added but haven't contacted: not in any cohort.
const leadUntouched = base({ status: 'lead', createdAt: d(2), events: [{ fromStatus: 'lead', toStatus: 'lead', createdAt: d(2) }] });
// An inbound inquiry that went live without a logged call.
const inLive = base({ status: 'live', createdAt: d(10), builtAt: d(15), signedAt: d(16), wentLiveAt: d(25) });
// An inbound inquiry still talking.
const inTalking = base({ status: 'in_review', createdAt: d(11), calls: [{ outcome: 'no_answer', scheduledAt: d(12), completedAt: null }] });

const m = milestones(outLive);
ok('outbound: entry is our first out touch, responded is their first reply', !m.inbound && m.entry?.getTime() === d(3).getTime() && m.reached?.getTime() === d(3).getTime() && m.responded?.getTime() === d(6).getTime());
ok('…a held call, built, signed, live from their own records', m.calls?.getTime() === d(9).getTime() && m.built?.getTime() === d(12).getTime() && m.signed?.getTime() === d(14).getTime() && m.live?.getTime() === d(20).getTime());
const mi = milestones(inLive);
ok('inbound: starts at Responded on the day it came in; never Reached', mi.inbound && mi.reached === null && mi.responded?.getTime() === d(10).getTime() && mi.entry?.getTime() === d(10).getTime());
ok('a lead we never contacted has no entry (in no cohort)', milestones(leadUntouched).entry === null);
ok('a call that wasn\'t held (no answer) is not "calls"', milestones(inTalking).calls === null);
ok('moving off lead counts as responded when no reply was logged',
  milestones(base({ status: 'in_review', touches: [{ at: d(3), direction: 'out' }], events: [{ fromStatus: 'lead', toStatus: 'in_review', createdAt: d(8) }] })).responded?.getTime() === d(8).getTime());
// Final review 2026-11-12: lead→lead events (Lead added, notes, snooze, source) and a lead we closed are not replies.
ok('a lead added, emailed, never replied: not responded (the "Lead added" lead→lead event is not a reply)',
  milestones(base({ status: 'lead', createdAt: d(2), touches: [{ at: d(4), direction: 'out' }], events: [{ fromStatus: 'lead', toStatus: 'lead', createdAt: d(2) }, { fromStatus: 'lead', toStatus: 'lead', createdAt: d(6) }] })).responded === null);
ok('a lead we closed (lead→rejected) is not responded either',
  milestones(base({ status: 'rejected', createdAt: d(2), touches: [{ at: d(4), direction: 'out' }], events: [{ fromStatus: 'lead', toStatus: 'lead', createdAt: d(2) }, { fromStatus: 'lead', toStatus: 'rejected', createdAt: d(20) }] })).responded === null);
{
  const mm = milestones(base({ status: 'in_review', createdAt: d(10), touches: [{ at: d(12), direction: 'out' }] }));
  ok('an inbound inquiry stays inbound after we log our call back (entry and Responded stay the day it came in)', mm.inbound && mm.reached === null && mm.entry?.getTime() === d(10).getTime() && mm.responded?.getTime() === d(10).getTime(), mm);
}
{
  const mm = milestones(base({ status: 'live', createdAt: d(2), events: [{ fromStatus: 'lead', toStatus: 'lead', createdAt: d(2) }, { fromStatus: 'lead', toStatus: 'in_review', createdAt: d(5) }], builtAt: d(8), signedAt: d(9), wentLiveAt: d(12) }));
  ok('a lead moved to Talking with no touch logged enters at that move and responds then, through to live; no reach date', !mm.inbound && mm.entry?.getTime() === d(5).getTime() && mm.reached === null && mm.responded?.getTime() === d(5).getTime() && mm.live?.getTime() === d(12).getTime(), mm);
  const ff = joiningFunnel([mm, milestones(base({ status: 'in_review', createdAt: d(2), touches: [{ at: d(3), direction: 'out' }], events: [{ fromStatus: 'lead', toStatus: 'in_review', createdAt: d(7) }] }))], d(1), d(31));
  const r = ff.steps.find(s => s.key === 'reached')!;
  ok('…it still counts as Reached, but adds no 0 to "days at Reached" (only the logged 4-day one)', r.count === 2 && r.avgDaysAtStep === 4, r);
}
{
}

const all = [outLive, outSilent, leadUntouched, inLive, inTalking].map(milestones);
const f = joiningFunnel(all, d(1), d(31));
const c = Object.fromEntries(f.steps.map(s => [s.key, s]));
ok('the cohort is everyone first contacted in the period (4; the untouched lead is out)', f.entered === 4, f);
ok('Reached = the outbound courses (2)', c.reached.count === 2, c.reached);
ok('Responded = 1 outbound reply + 2 inbound = 3; its % is of outbound (1 of 2 = 50%)', c.responded.count === 3 && c.responded.fromPrevPct === 50, c.responded);
ok('Calls = got at least that far (outLive held one; inLive went live without one) = 2', c.calls.count === 2, c.calls);
ok('Built 2, Signed 2, Live 2', c.built.count === 2 && c.signed.count === 2 && c.live.count === 2, f.steps);
ok('the funnel never grows after Responded', f.steps.slice(2).every((s, i) => s.count <= f.steps[i + 1].count));
ok('days at Reached: out Oct 3 → reply Oct 6 = 3 days', c.reached.avgDaysAtStep === 3, c.reached);
ok('days at Built: average of 2 (outLive) and 1 (inLive) = 1.5', c.built.avgDaysAtStep === 1.5, c.built);
ok('Live has no "days at"', c.live.avgDaysAtStep === null);
ok('first contact to live: 2 of 4 (50%), avg (17 + 15) / 2 = 16 days', f.reachedToLive.pct === 50 && f.reachedToLive.avgDays === 16, f.reachedToLive);
ok('a period nobody entered: empty, no %', (() => { const e = joiningFunnel(all, d(26), d(30)); return e.entered === 0 && e.steps.every(s => s.count === 0 && s.fromPrevPct === null) && e.reachedToLive.pct === null; })());
ok('a course first contacted before the period is not in it', joiningFunnel(all, d(4), d(31)).entered === 3);

ok('average fill is the mean of each course\'s %, not of the pooled seats', averageFill([{ players: 10, spots: 100 }, { players: 90, spots: 100 }, { players: 0, spots: 0 }]) === 50);
ok('…with no spots anywhere it is null', averageFill([{ players: 0, spots: 0 }]) === null && averageFill([]) === null);
ok('one course\'s fill rounds to a whole %', fillPct({ players: 1, spots: 3 }) === 33 && fillPct(undefined) === null);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
