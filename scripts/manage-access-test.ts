// R-AUTH-003 / R-GOLF-003 (G13) — a booking is managed from the golfer side only with its emailed token
// (Cam 2026-11-18: no golfer accounts, so no signed-in-owner path). Pure: checks canManageBooking() and that
// every golfer-side manage/cancel route goes through it and reads no golfer session.
// Run: npx tsx scripts/manage-access-test.ts
import { readFileSync } from 'fs';
import { canManageBooking } from '../src/lib/manage-access';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

const guest = { checkInToken: 'tok-guest' };

check('right token → allowed', canManageBooking(guest, 'tok-guest'));
check('wrong token → refused', !canManageBooking(guest, 'nope'));
check('no token → refused', !canManageBooking(guest, ''));
check('undefined token → refused', !canManageBooking(guest, undefined));
check('a booking with no token never matches an empty token', !canManageBooking({ checkInToken: null }, ''));
check('a booking with an empty-string token never matches', !canManageBooking({ checkInToken: '' }, ''));

const routes = [
  'src/app/api/manage/[bookingId]/route.ts',
  'src/app/api/manage/[bookingId]/available-times/route.ts',
  // Dead end 19: the party-size rules (and its golfer check) live in lib/change-party.
  'src/lib/change-party.ts',
  'src/app/api/manage/[bookingId]/swap-time/route.ts',
  'src/app/api/manage/[bookingId]/send-modified-email/route.ts',
  'src/app/api/bookings/cancel/route.ts',
];
for (const r of routes) {
  const src = readFileSync(r, 'utf8');
  check(`${r} uses canManageBooking`, src.includes('canManageBooking('));
  check(`${r} reads no golfer session`, !/getGolferSession|golferSession/.test(src));
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
