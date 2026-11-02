// Counter friction (Cam 2026-11-02 picked it; findings from the Oct 28 tee sheet audit, re-checked Nov 1):
// each pin fails on the code before the fix.
// Pure. Run: npx tsx scripts/teesheet-3-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const check = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');
const sheet = read('src/app/dashboard/page.tsx');
const shop = read('src/app/dashboard/shop/page.tsx');
const side = read('src/components/OperatorSidebar.tsx');
const search = read('src/components/dashboard/OperatorSearch.tsx');

// Tee 14
check('no browser prompt for the headcount — the card\'s "Here" picker, set to the whole group', !sheet.includes('window.prompt') && sheet.includes('const n = here[b.id] ?? b.players;') && sheet.includes('{n} of {b.players}</option>'));
check('…the picker never shows a count above the group (after a party-size change)', sheet.includes('value={Math.min(here[b.id] ?? b.players, b.players)}'));
// Tee 26 / 25
check('"Mark no-show" waits 10 minutes past the time', sheet.includes('mins(nowHM) - mins(tt.time) >= 10') && sheet.includes("noShowReady && access.can('sheet.no_show')"));
check('the late group\'s local hide is "Running late", not a second "Still coming"', sheet.includes('className={link}>Running late</button>') && (sheet.match(/>Still coming</g) ?? []).length === 0);
// Tee 11 / 21
check('walk-ins start without a cart unless the time can\'t be walked', sheet.includes('const [cartPick, setCart] = useState(false);') && sheet.includes('const cartForced = slot.walkingAllowed === false;'));
check('a walk-in who already played starts as paying cash now — only for logins that can take cash', sheet.includes('const [checkInNow, setCheckInNow] = useState(late);') && sheet.includes("const canCash = access.can('sheet.counter_payment');") && (sheet.match(/checkInNow && canCash/g) ?? []).length === 3 && sheet.includes("{source === 'walk_in' && canCash && ("));
// Tee 32
check('an overdue event checklist shows on today\'s sheet only', sheet.includes('{selectedDate === today() && eventsDue.map(ev => ('));
// Shop 10
check('a scanned code that matches nothing says so (scanner and search box)', shop.includes('No item has the code ${code.trim()}.') && shop.includes('if (!scanRef.current(buf)) noMatchRef.current(buf);') && shop.includes('if (!tree.some(i => matches(i, q))) noMatch(q);'));
// Members 22
check('golfer search on a phone: in the More sheet, opening upward, closing the sheet on a pick', side.includes('<OperatorSearch dropUp onPicked={() => setMoreOpen(false)} />') && search.includes('onPicked?.();') && search.includes('bottom-full mb-1'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
