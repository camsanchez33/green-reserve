// Launch security review 2026-10-18: a golfer's party change rescales the late
// and no-show totals copied onto the booking (rescalePartyFees), and the
// golfer-facing routes keep the guards the review added. Pure — no database.
// Run: npx tsx scripts/party-fees-test.ts
import { readFileSync } from 'fs';
import { rescalePartyFees } from '../src/lib/cancel-policy';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

// $10/player late fee, "cancel late or don't show", no separate no-show fee: both totals per player.
const lateOnly = { lateFeeBasis: 'player', noShowFeeBasis: 'booking', noShowFeeCents: 0 };
const a = rescalePartyFees({ cancellationFeeTotal: 4000, noShowFeeTotal: 4000 }, lateOnly, 4, 1);
check('per-player late fee drops with the party', a.cancellationFeeTotal === 1000, String(a.cancellationFeeTotal));
check('a no-show total that is the late fee follows the late basis', a.noShowFeeTotal === 1000, String(a.noShowFeeTotal));
const b = rescalePartyFees({ cancellationFeeTotal: 1000, noShowFeeTotal: 1000 }, lateOnly, 1, 4);
check('…and grows with it', b.cancellationFeeTotal === 4000 && b.noShowFeeTotal === 4000);

// Per-booking late fee, separate $15/player no-show fee.
const sep = { lateFeeBasis: 'booking', noShowFeeBasis: 'player', noShowFeeCents: 1500 };
const c = rescalePartyFees({ cancellationFeeTotal: 2500, noShowFeeTotal: 3000 }, sep, 2, 3);
check('a per-booking late fee stays', c.cancellationFeeTotal === 2500);
check('a separate per-player no-show fee follows its own basis', c.noShowFeeTotal === 4500, String(c.noShowFeeTotal));

// Per-booking everything: nothing moves; no fees: zero stays zero.
const flat = rescalePartyFees({ cancellationFeeTotal: 2500, noShowFeeTotal: 2500 }, { lateFeeBasis: 'booking', noShowFeeBasis: 'booking', noShowFeeCents: 2500 }, 4, 1);
check('per-booking fees never move', flat.cancellationFeeTotal === 2500 && flat.noShowFeeTotal === 2500);
const none = rescalePartyFees({ cancellationFeeTotal: 0, noShowFeeTotal: 0 }, lateOnly, 2, 4);
check('no fee stays no fee', none.cancellationFeeTotal === 0 && none.noShowFeeTotal === 0);

// Route guards (source-level, like manage-access-test).
const src = (p: string) => readFileSync(p, 'utf8');
const invite = src('src/app/api/golfer/auth/accept-invite/route.ts');
check('accept-invite never writes an unverified phone', !/phone\s*:/.test(invite.replace(/\/\/.*$/gm, '')));
const bookings = src('src/app/api/bookings/route.ts');
check('booking creation is rate-limited per IP and per email', bookings.includes('`booking:${clientIp(req)}`') && bookings.includes('booking-email:'));
check('a SetupIntent backs one booking', bookings.includes('booking-seti:'));
check('a course that is not live takes no bookings', /liveStatus !== 'live'/.test(bookings) && /archivedAt/.test(bookings));
const players = src('src/lib/change-party.ts');
check('change-players never hard-codes the booking fee', !/perPlayerAccess\s*=\s*150/.test(players));
check('change-players rescales the fee totals', players.includes('rescalePartyFees('));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
