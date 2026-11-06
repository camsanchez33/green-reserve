// WX-2 (Cam 2026-11-06, the weather window: "clean, effective, organised — long explanations only when
// needed"): two tabs (Cancel for weather · Delay the start), no paragraphs, Rest of today · Whole day ·
// Custom, the plan updates live as the window changes (no Preview button), quick-pick notes, and one line
// of what happens by the button. Pins that the button only runs on the window the plan on screen was made
// for, and that Rest of today applies the start it was previewed with. Pure.
// Run: npx tsx scripts/weather-window-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const page = readFileSync('src/app/dashboard/page.tsx', 'utf8');
const modal = page.slice(page.indexOf('WX-1 Weather: cancel times'), page.indexOf('SD-5: Walk-in / phone booking'));

ok('no Preview button and no explaining paragraphs', !modal.includes("'Preview'") && !modal.includes('Preview first') && !modal.includes('Every group in the window') && !modal.includes('Groups before the new first tee time'));
ok('Rest of today (today only) · Whole day · Custom', modal.includes("['rest', 'Rest of today'], ['day', 'Whole day'], ['custom', 'Custom']") && modal.includes("selectedDate === today() ?"));
ok('rest of today runs from the course clock', page.includes("wxSpan === 'rest' ? { from: clockIn(courseTz), to: '24:00' }"));
ok('the cancel plan follows the window live', page.includes("if (!frostOpen || wxMode !== 'cancel' || wxResult || wxBusy) return;") && page.includes('setWxPlan(r.data.plan); setWxPlanKey(wxKey);'));
ok('the delay plan follows the new first time live', page.includes("setFrostPlan(r.data.plan); setFrostPlanKey(`${selectedDate}|${frostTime}`);"));
ok('Cancel runs only on the plan on screen, with the start it was previewed with', modal.includes('wxPlanKey !== wxKey') && modal.includes("const win = wxSpan === 'day' ? {} : { from: wxPlan.from, to: wxPlan.to };"));
ok('Delay applies only on the plan on screen', modal.includes("frostPlanKey !== `${selectedDate}|${frostTime}`"));
ok('quick-pick notes plus their own', page.includes("const WX_NOTES = ['Rain'") && modal.includes('onClick={() => setWxReason(n)}') && modal.includes('placeholder="Or write your own"'));
ok('one line of what happens, each mode', modal.includes('No fees · holds refunded · golfers emailed') && modal.includes('Nobody cancelled · prices kept · moved golfers emailed'));
ok('the impact line counts groups and players', modal.includes("wxPlan.groups.reduce((n, g) => n + g.players, 0)} players</b> cancelled"));
ok('a partway failure still says some may be cancelled', modal.includes('The cancellation stopped partway'));

ok('review: checking and applying are separate; the live plan stops while a cancel or move runs', page.includes("wxMode !== 'cancel' || wxResult || wxBusy) return;") && page.includes("frostResult || frostBusy ||") && page.includes('setWxChecking(true)') && page.includes('setFrostChecking(true)'));
ok('review: a dropped check never leaves "Checking…" stuck', page.includes('clearTimeout(t); setWxChecking(false); };') && page.includes('clearTimeout(t); setFrostChecking(false); };'));
ok('review: every control is locked while a cancel runs', modal.includes('role="radio" aria-checked={wxSpan === v} disabled={wxBusy}') && modal.includes('value={wxFrom} disabled={wxBusy}') && modal.includes('value={wxTo} disabled={wxBusy}') && modal.includes('disabled={wxBusy} onClick={() => setWxReason(n)}') && modal.includes('value={frostTime} disabled={frostBusy}'));
ok('review: no "Checking…" when there is nothing to check', modal.includes("'Pick a start time'") && modal.includes("'Pick a time'"));

{ const effects = page.slice(page.indexOf('const wxKey ='), page.indexOf('[frostOpen, wxMode, frostTime, selectedDate, frostResult, frostBusy]'));
  ok('review: an apply error survives the re-check after it (own state, never cleared by the live plan)', modal.includes('setWxApplyErr(r.status >= 500 || r.status === 0') && modal.includes('if (!r.ok) { setFrostApplyErr(r.error); return; }')
    && !effects.includes('ApplyErr') && modal.includes('{wxApplyErr && <p role="alert"') && modal.includes('{frostApplyErr && <p role="alert"')); }

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
