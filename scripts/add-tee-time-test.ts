// ADDTIME-1 (Cam 2026-11-06, the "Add time" button: "what is it really doing"): Add tee time starts from the
// day's real prices (copied from the nearest time that day) and either opens online or is kept for staff.
// Pins: a time kept for staff is never listed or bookable online — every golfer-facing read filters it and
// the online claim and the golfer's own swap refuse it; the counter still books it; the engine leaves it
// alone; the copy is this course's own and this day's; staff never price a time. Pure.
// Run: npx tsx scripts/add-tee-time-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

const schema = read('prisma/schema.prisma');
const mig = read('prisma/migrations/20261106000000_tee_time_staff_only/migration.sql');
ok('the column is additive with a default', /staffOnly\s+Boolean\s+@default\(false\)/.test(schema) && /ADD COLUMN "staffOnly" BOOLEAN NOT NULL DEFAULT false/.test(mig) && !/DROP|RENAME|UPDATE/i.test(mig.replace(/--.*$/gm, '')));

for (const f of ['src/lib/public-tee-times.ts', 'src/app/api/member/[courseSlug]/tee-times/route.ts', 'src/app/api/manage/[bookingId]/available-times/route.ts', 'src/app/api/preview/[courseId]/tee-times/route.ts']) {
  ok(`golfers never see it: ${f}`, read(f).includes('staffOnly: false'));
}
const claim = read('src/lib/claim-tee-time.ts');
ok('the online claim refuses it', claim.includes('online?: boolean') && claim.includes("if (opts.online && teeTime.staffOnly) throw new TeeTimeClaimError('BLOCKED')") && claim.includes('staffOnly: true'));
const bookings = read('src/app/api/bookings/route.ts');
ok('the golfer booking route claims as online', bookings.includes("{ type: 'golfer', id: golferSession?.golferId ?? null }, { online: true })"));
ok('the counter and admin claims do not', !read('src/lib/counter-pay.ts').includes('online: true') && !read('src/app/api/admin/tee-sheet/route.ts').includes('online: true'));
const move = read('src/lib/move-booking.ts');
ok("a golfer's own swap refuses it", move.includes("if (golferMove && slot.staffOnly) throw new MoveError('BLOCKED')"));
const engine = read('src/lib/tee-sheet-engine.ts');
ok('the engine never deletes it and treats it like a block', engine.includes('&& !t.staffOnly &&') && engine.includes("status: { not: 'blocked' }, staffOnly: false, seatsClosed: 0, bookings"));

const route = read('src/app/api/operator/tee-times/route.ts');
const post = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function PATCH'));
const patch = route.slice(route.indexOf('export async function PATCH'), route.indexOf('export async function DELETE'));
ok('the copy is this course and this day only', post.includes('where: { id: copyId, courseId: session.courseId, date }'));
ok('staff never price it: staff take the copy or the schedule', post.includes('if (src && (session.isStaff || !ownFees))') && post.includes('const ownFees = !session.isStaff &&'));
ok('the clash check looks at the copied round', post.includes('where: { courseId: session.courseId, date, time, productId }'));
ok('open online / keep for staff is this course only, behind sheet.block', patch.includes("requirePermission(session, 'sheet.block')") && patch.includes('setStaffOnly(session.courseId, String(id), staffOnly)') && read('src/lib/tee-time-close.ts').includes('where: { id: teeTimeId, courseId,')); // TT-CLOSE: through lib/tee-time-close, still course-scoped

const page = read('src/app/dashboard/page.tsx');
ok('adding a time is "+ Time" in the sheet\'s own bar (Cam 2026-11-08), "Add tee time" when the day is empty', page.includes('>+ Time</button>') && page.includes('rounded-md text-[12.5px] font-medium transition-colors">Add tee time</button>'));
ok('the form copies the nearest time and asks who can book it', page.includes('Priced like {fmtTime(like.time)}') && page.includes("[[true, 'Anyone'], [false, 'Counter only']]") && page.includes('copyFrom: like.id'));
ok('a new time opens its card', page.includes('setPanelId(id)'));
// SEATS-1 (Cam 2026-11-08) replaced the card's Anyone · Counter only · No one choice with the Open seats stepper
// (scripts/seats-closed-test.ts); a time closed or hidden the old way keeps a one-tap way back.
ok('a time closed or hidden the old way can be reopened from the card', page.includes('Closed · reopen this time') && page.includes('Hidden online · show it') && page.includes("setSeatAccess(panelSlot, 'anyone')"));
ok('the row says Staff only', read('src/components/dashboard/TeeSheetRows.tsx').includes("s.staffOnly ? 'Staff only' : ''"));


ok('Delete time is not offered while a group is on the time', page.includes("nobodyBooked && access.can('sheet.edit_times') && !past && !panelSlot.event && (")); // TT-CLOSE
{ const del = route.slice(route.indexOf('export async function DELETE'));
  ok('the route refuses a time with any booking, cancelled ones included, before deleting', del.indexOf('deleteRefusal(session.courseId, String(id))') > 0 && del.indexOf('where: { teeTimeId: id, courseId: session.courseId } }) > 0') < del.indexOf('teeTime.deleteMany')); }

ok('a cancel on it never sends golfers a waitlist alert', read('src/lib/cancel-booking.ts').includes('notifySlotAlerts && !booking.teeTime.staffOnly'));
ok('the booking route refuses it up front, before any card or code', bookings.includes('if (!teeTimeFull || teeTimeFull.staffOnly) return'));
ok("the preview's lowest price leaves it out", read('src/app/api/preview/[courseId]/route.ts').includes("status: { not: 'blocked' }, staffOnly: false },\n    orderBy: { greenFeeCents: 'asc' }"));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
