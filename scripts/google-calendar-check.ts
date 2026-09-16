// SC-1 §4 — prove the service account can read Cam's calendar and write to it.
// Needs GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_CALENDAR_ID in the environment
// (vercel env pull, or export them for one shell). Prints nothing secret.
// Run: npx dotenv -e .env.local -- npx tsx scripts/google-calendar-check.ts
import { calendarConfigured, busyBlocks, createCallEvent, deleteCallEvent } from '../src/lib/google-calendar';

async function main() {
  if (!calendarConfigured()) {
    console.log('SKIP  GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_CALENDAR_ID not set — nothing to check yet.');
    process.exit(2);
  }
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 86_400_000);
  const busy = await busyBlocks(now, week);
  console.log(`PASS  freebusy: ${busy.length} busy block(s) in the next 7 days`);
  for (const b of busy.slice(0, 5)) console.log(`      ${b.start.toISOString()} → ${b.end.toISOString()}`);

  const start = new Date(now.getTime() + 2 * 86_400_000);
  start.setUTCMinutes(0, 0, 0);
  const id = await createCallEvent(
    { scheduledAt: start, durationMin: 30, direction: 'we_call', phone: '(000) 000-0000', agendaLabels: ['SC-1 round-trip check'] },
    { id: 'sc1-check', courseName: 'SC-1 check (delete me)', contactName: 'Round-trip test', phone: '(000) 000-0000', email: null },
  );
  if (!id) { console.log('FAIL  createCallEvent returned null — see the error above'); process.exit(1); }
  console.log(`PASS  createCallEvent: event ${id}`);
  let gone = await deleteCallEvent(id);
  if (!gone) gone = await deleteCallEvent(id);
  console.log(gone ? 'PASS  deleteCallEvent' : `FAIL  deleteCallEvent — delete event ${id} ("SC-1 check (delete me)") from the calendar by hand, it is occupying a bookable slot`);
  process.exit(gone ? 0 : 1);
}
main().catch(err => { console.error('FAIL ', err instanceof Error ? err.message : err); process.exit(1); });
