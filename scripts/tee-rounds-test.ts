// ROUNDS-1 (Cam 2026-11-06, "easy to know which tee times are 9 holes, which are twilight"): what each tee
// time sells, in words; the tee's usual round is named once, every other time carries its own label.
// Pure + source pins. Run: npx tsx scripts/tee-rounds-test.ts
import { readFileSync } from 'fs';
import { roundName, roundOf, periodOf, usualRound, usualRoundOnly, rowTag, runsOf } from '../src/lib/tee-rounds';

let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + JSON.stringify(i)}`); if (!c) failed++; };

const std = { time: '07:00', holes: 18, tierName: 'standard' };
const back9 = { time: '07:00', holes: 9, tierName: 'Morning', product: { label: 'Back nine' } };
const twi = { time: '15:30', holes: 9, tierName: 'Twilight', product: null };
ok('a plain 18 is "18 holes"; the default period says nothing', roundName(std) === '18 holes' && periodOf(std) === '');
ok('a named round uses its name, with its period', roundName(back9) === 'Morning · Back nine' && roundOf(back9) === 'Back nine');
ok('a twilight 9 with no named round reads "Twilight · 9 holes"', roundName(twi) === 'Twilight · 9 holes');
const day = [std, { ...std, time: '07:10' }, { ...std, time: '07:20' }, twi, { ...twi, time: '15:40' }];
const usual = usualRound(day);
ok('the usual round is the one most times sell', usual === '18 holes', usual);
ok('the usual round carries no label; twilight does', rowTag(std, usual) === '' && rowTag(twi, usual) === 'Twilight · 9 holes');
ok('a tee\'s header names its round without the period', usualRoundOnly([back9, { ...back9, time: '07:10' }]) === 'Back nine');

// Review 2026-11-06: "All day" is no period; a time added by hand on a Morning day is the usual round.
const allDay = { time: '06:00', holes: 18, tierName: 'All day' };
const byHand = { time: '09:05', holes: 18, tierName: 'standard' };
ok('"All day" says nothing, like standard', roundName(allDay) === '18 holes');
const morning = [{ time: '06:00', holes: 18, tierName: 'Morning' }, { time: '06:10', holes: 18, tierName: 'Morning' }, byHand];
ok('a time added by hand on a Morning day carries no label', rowTag(byHand, usualRound(morning)) === '', usualRound(morning));
const lane = [{ time: '06:00', holes: 18, tierName: 'Morning' }, { time: '06:10', holes: 18, tierName: 'Morning' }, { time: '15:30', holes: 9, tierName: 'Twilight' }];
const runs = runsOf(lane, usualRound(lane));
ok('a run starts where its first time is, even when the list shown starts later', runs.get(lane[1])?.from === '06:00' && runs.get(lane[2])?.from === '15:30');
// Review 2026-11-06: a time added by hand at 2:05 PM on an Afternoon stretch stays Afternoon — one header, from noon.
const day2 = [{ time: '06:00', holes: 18, tierName: 'Morning' }, { time: '06:10', holes: 18, tierName: 'Morning' }, { time: '06:20', holes: 18, tierName: 'Morning' },
  { time: '12:00', holes: 18, tierName: 'Afternoon' }, { time: '14:00', holes: 18, tierName: 'Afternoon' }, { time: '14:05', holes: 18, tierName: 'standard' }, { time: '14:10', holes: 18, tierName: 'Afternoon' }];
const r2 = runsOf(day2, usualRound(day2));
ok('a hand-added 2:05 PM time stays in the Afternoon run, which began at noon', [day2[4], day2[5], day2[6]].every(x => r2.get(x)?.run === 'Afternoon · 18 holes' && r2.get(x)?.from === '12:00'), [...r2.values()]);

const rows = readFileSync('src/components/dashboard/TeeSheetRows.tsx', 'utf8');
ok('each tee\'s header says its round ("1st tee · 18 holes")', rows.includes('{l}<span className="font-normal text-ink-muted"> · {usualRoundOnly('));
ok('a time selling another round shows it under the price, and says it to screen readers', rows.includes("{tag && !blocked && <span className={'text-[10.5px]") && rows.includes("${tag ? `, ${tag}` : ''}"));
ok('one tee: a header where a new run starts ("Twilight · 9 holes from 3:30 PM")', rows.includes('const newRun = tagsOn && run !== lastRun') && rows.includes('runsOf(allSlots.filter(') && rows.includes('>from {formatTeeTime(runFrom)}</span>'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
