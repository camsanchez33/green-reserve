// DASH-D (Cam 2026-11-01, the command bar): "/" or Ctrl/⌘ K jumps to "Find a golfer or member"
// from any dashboard page — the rail's copy only, never while typing in a field. And Home's
// conditions card says when golfers no longer see them (older than the booking page's 18 hours).
// Pure. Run: npx tsx scripts/search-shortcut-test.ts
import { readFileSync } from 'fs';
import { conditionsOffBookingPage, golferConditionLines, cleanConditions } from '../src/lib/course-conditions';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const s = readFileSync('src/components/dashboard/OperatorSearch.tsx', 'utf8');
ok('the rail copy listens; the phone sheet copy does not', s.includes('if (dropUp) return;') && s.includes("window.addEventListener('keydown', onKey)") && s.includes("window.removeEventListener('keydown', onKey)"));
ok('"/" and Ctrl K only when not typing in a field; ⌘K anywhere', s.includes("/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)") && s.includes("(k === 'k' && e.metaKey) || (k === 'k' && e.ctrlKey && !typing)") && s.includes("(e.key === '/' && !typing && !burst"));
ok('never out of an open dialog', s.includes(`if (t?.closest('[role="dialog"]') || document.querySelector('[aria-modal="true"]')) return;`));
ok('a "/" inside a scanner burst is left to the register', s.includes('burst = now - lastKeyAt < 100'));
ok('focuses and selects the search, skipping a hidden copy', s.includes('input.current.offsetParent === null') && s.includes('input.current.focus(); input.current.select();'));
ok('the field announces its shortcut and shows a "/" hint', s.includes("aria-keyshortcuts={dropUp ? undefined : '/ Control+K Meta+K'}") && s.includes('>/</kbd>'));
const h = readFileSync('src/components/dashboard/home/HomeBoard.tsx', 'utf8');
ok('Home says when the conditions are off the booking page', h.includes('{conditionsOffBookingPage(c.detail, c.detailAt) && (') && h.includes('Off your booking page'));
// Review 2026-11-02: the warning used the alert's newer time. It must agree with the booking page exactly.
const now = new Date('2026-11-02T14:00:00Z'), ago = (h: number) => new Date(now.getTime() - h * 3600000);
for (const [detail, at] of [[{ carts: 'path' }, ago(2)], [{ carts: 'path' }, ago(30)], [{}, ago(30)], [{ range: 'mats' }, null], [{ junk: 'x' }, ago(30)]] as const) {
  ok(`warning ⇔ golfers see nothing (${JSON.stringify(detail)}, ${at ? 'set' : 'never'})`, conditionsOffBookingPage(detail, at, now) === (Object.keys(cleanConditions(detail)).length > 0 && golferConditionLines(detail, at, now).length === 0) && (JSON.stringify(detail) === '{"carts":"path"}' && at && now.getTime() - at.getTime() > 18 * 3600000 ? conditionsOffBookingPage(detail, at, now) : true));
}
ok('Home gets the four choices\' own time, not the alert\'s', readFileSync('src/lib/home-board.ts', 'utf8').includes('detailAt: c?.conditionsDetailAt ? c.conditionsDetailAt.toISOString() : null'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
