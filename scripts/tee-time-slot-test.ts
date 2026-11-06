// AUDIT-1 (security audit 2026-11-05, S1): one TeeTime row per slot. Two generations racing
// could insert the same time twice and double that tee's capacity.
// Run: npx tsx scripts/tee-time-slot-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const mig = readFileSync('prisma/migrations/20261105000000_tee_time_one_row_per_slot/migration.sql', 'utf8');
ok('the database refuses a second row for a slot (no round counts as one slot too)', mig.includes('CREATE UNIQUE INDEX "TeeTime_slot_key" ON "TeeTime"("courseId", "date", "time", COALESCE("productId", \'\'))'));
ok('…after folding duplicates already there: bookings and alerts move to the kept row', mig.includes('UPDATE "Booking" b SET "teeTimeId" = d.keeper') && mig.includes('UPDATE "TeeTimeAlert" a SET "teeTimeId" = d.keeper') && mig.includes('sum(t."playersBooked")'));
const eng = readFileSync('src/lib/tee-sheet-engine.ts', 'utf8');
ok('generation skips a slot another run made meanwhile', eng.includes('createMany({ data: toCreate, skipDuplicates: true })'));
ok('…and never deletes a slot booked since it read the day', eng.includes("where: { id: { in: toDelete }, playersBooked: 0, status: { not: 'blocked' }, staffOnly: false, bookings: { none: {} } }"));
const route = readFileSync('src/app/api/operator/tee-times/route.ts', 'utf8');
ok('adding a time by hand refuses one that already exists', route.includes("There's already a ${time} tee time that day."));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
