// Event day (Cam 2026-10-31: "check-in, day-of view, printable sheets"): on the event's date staff check
// players in as they arrive, see who still owes, and print a cart sign per group.
// No database needed. Run: npx tsx scripts/event-day-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const check = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

const schema = read('prisma/schema.prisma');
check('CourseEventPlayer.checkedInAt is nullable', /model CourseEventPlayer \{[\s\S]*?checkedInAt\s+DateTime\?/.test(schema));
const mig = read('prisma/migrations/20261031030000_event_player_checkin/migration.sql');
check('the migration only adds the nullable column', mig.includes('ALTER TABLE "CourseEventPlayer" ADD COLUMN "checkedInAt" TIMESTAMP(3);') && !/DROP|RENAME|UPDATE |NOT NULL/i.test(mig));

const route = read('src/app/api/operator/events/[id]/route.ts');
const ci = route.slice(route.indexOf("case 'checkin':"), route.indexOf("case 'player_set':"));
check('check-in is scoped to this event and to players still in', ci.includes('where: { id: { in: ids }, eventId: id, status: \'in\' }'));
check('check-in takes a list, capped, and can be undone', ci.includes('.slice(0, 250)') && ci.includes('body.on === false ? null : new Date()'));
check('check-in that matched nobody says so', ci.includes('if (!r.count) return bad('));

const detail = read('src/components/dashboard/events/EventDetail.tsx');
check('the day view shows only on the event\'s date, for a planned event', detail.includes('{live && e.date === today && onList.length > 0 && ('));
check('it checks in through the event route', detail.includes("act(key, { action: 'checkin', playerIds: ids, on })"));
check('"Take payment" opens that player\'s payment in the list', detail.includes('setPaidHere({ id: p.id, amount: price, method: \'cash\' })') && detail.includes('id={`player-${p.id}`}'));
check('printing cart signs hides the pairings sheet', detail.includes("printWhat === 'signs' ? '' : 'print:block'") && detail.includes('<CartSigns'));
const day = read('src/components/dashboard/events/EventDay.tsx');
check('one cart sign per group per page', day.includes('break-after-page') && day.includes('groups.map(([g, ps]) =>'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
