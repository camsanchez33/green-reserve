// TEES-1 (Cam 2026-11-04, "side by side"): a course that sells back-nine starts (or any round that
// starts on another nine) sees its tees next to each other on the tee sheet, times lined up across.
//  1. the tee-times route labels every time with the tee it starts from — its round's first nine:
//     1st / 10th tee with a front and a back nine, the nine's own name with more; no round = first nine;
//  2. the seat rows put two or more tees side by side (one line per time, a column per tee, the 1st tee
//     first), keep the one-tee sheet exactly as it was, and show one tee at a time on a phone;
//  3. every tee's cells still open the time's card and take a dragged group (the same handlers).
// Run: npx tsx scripts/tees-side-by-side-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };

const route = readFileSync('src/app/api/operator/tee-times/route.ts', 'utf8');
ok('the route reads each round\'s nines', route.includes("product: { select: { label: true, nineIds: true } },"));
ok('…and the course\'s nines in order', route.includes("prisma.nine.findMany({ where: { courseId: session.courseId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]"));
ok('a front and a back nine are the 1st and 10th tee; more nines use their names; no round = first nine',
  route.includes("Math.max(0, nines.findIndex(n => n.id === t.product?.nineIds?.[0]))") && route.includes('const i = teeIndex(t);')
  && route.includes("return nines.length === 2 ? (i === 0 ? '1st tee' : '10th tee') : nines[i].name;"));
ok('every time carries its tee, with or without bookings', route.includes('const t = { ...t0, tee: teeOf(t0), teeRank: teeIndex(t0) };') && route.includes('if (!bookings) return t;'));

const rows = readFileSync('src/components/dashboard/TeeSheetRows.tsx', 'utf8');
ok('the sheet finds the day\'s tees in the course\'s nine order (1st tee first)', rows.includes("const lanes = [...rankOf.keys()].sort((a, b) => (rankOf.get(a) ?? 0) - (rankOf.get(b) ?? 0) || a.localeCompare(b));")
  && route.includes('const t = { ...t0, tee: teeOf(t0), teeRank: teeIndex(t0) };'));
ok('two or more tees: one line per time, a column per tee', rows.includes('if (lanes.length > 1) {') && rows.includes('const times = [...new Set(list.map(s => s.time))].sort();')
  && rows.includes("const ss = at.filter(x => (x.tee ?? '') === l);") && rows.includes('ss.map(s => slotCells(s, false))') && !rows.includes('at.find('));
ok('one tee: the sheet is exactly the old seat rows', rows.includes('{slotCells(s, true)}'));
ok('a tee name heads each column from md up', rows.includes("hidden md:grid gap-x-3 pb-1 text-[13px] font-semibold text-ink") && rows.includes('{lanes.map(l => <span key={l} className="px-1 truncate">{l}</span>)}'));
ok('a phone shows one tee at a time, with a switch', rows.includes('<div role="group" className="md:hidden') && rows.includes("(l === shownLane ? 'block' : 'hidden md:block')")
  && rows.includes("grid-cols-[3.75rem_minmax(0,1fr)] md:grid-cols-[3.75rem_repeat(var(--lanes),minmax(0,1fr))]"));
ok('each tee\'s cells open the card and take a dragged group', (rows.match(/onSelect\(s\.id\)/g) ?? []).length >= 4 && rows.includes('if (dragging && target) onMove(dragging.group, dragging.fromId, s.id);'));
ok('side by side, the price is the keyboard button and names the tee', rows.includes("${withTime ? '' : `, ${s.tee ?? ''}`}"));

const page = readFileSync('src/app/dashboard/page.tsx', 'utf8');
ok('the time\'s card names its tee when the day has more than one', page.includes("{panelSlot.tee && (teeTimes ?? []).some(t => t.tee !== panelSlot.tee) ? `${panelSlot.tee} · ` : ''}"));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
