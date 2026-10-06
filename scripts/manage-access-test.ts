// R-AUTH-003 / R-GOLF-003 (G13) — a signed-in golfer must still be able to use
// a booking's emailed token. Pure: checks canManageBooking() and that every
// golfer-side manage/cancel route goes through it instead of the old
// "session ? owner : token" either/or. Run: npx tsx scripts/manage-access-test.ts
import { readFileSync } from 'fs';
import { canManageBooking } from '../src/lib/manage-access';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

const guest = { golferAccountId: null, checkInToken: 'tok-guest' };
const owned = { golferAccountId: 'g1', checkInToken: 'tok-owned' };

check('signed out + right token → allowed', canManageBooking(guest, null, 'tok-guest'));
check('signed out + wrong token → refused', !canManageBooking(guest, null, 'nope'));
check('signed out + no token → refused', !canManageBooking(guest, null, ''));
check('signed in as someone else + right token → allowed (the G13 bug)', canManageBooking(guest, 'g2', 'tok-guest'));
check('signed in as someone else + no token → refused', !canManageBooking(owned, 'g2', ''));
check('signed in as someone else + wrong token → refused', !canManageBooking(owned, 'g2', 'tok-guest'));
check('signed in as the owner, no token → allowed', canManageBooking(owned, 'g1', undefined));
check('a booking with no token never matches an empty token', !canManageBooking({ golferAccountId: null, checkInToken: null }, null, ''));
check('a booking with an empty-string token never matches', !canManageBooking({ golferAccountId: null, checkInToken: '' }, null, ''));

const routes = [
  'src/app/api/manage/[bookingId]/route.ts',
  'src/app/api/manage/[bookingId]/available-times/route.ts',
  'src/app/api/manage/[bookingId]/change-players/route.ts',
  'src/app/api/manage/[bookingId]/swap-time/route.ts',
  'src/app/api/manage/[bookingId]/send-modified-email/route.ts',
  'src/app/api/bookings/cancel/route.ts',
];
for (const r of routes) {
  const src = readFileSync(r, 'utf8');
  check(`${r} uses canManageBooking`, src.includes('canManageBooking('));
  check(`${r} has no session-replaces-token ternary`, !/golferSession\s*\?\s*booking\.golferAccountId/.test(src));
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
