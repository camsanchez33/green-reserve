// Golfers list (Cam approved the mockup 2026-11-17): one line per golfer, an account joined with the guest bookings
// made with its email, the record's own counting rules, sorted by last played. Pure; no database.
// Run: npx tsx scripts/admin-golfers-list-test.ts
import { golferLines, matchesFilter, matchesQuery } from '../src/app/api/admin/golfers/list';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

const T = '2026-11-17';
const at = new Date('2026-11-01T12:00:00Z');
const bk = (o: Partial<Parameters<typeof golferLines>[1][number]>) => ({
  golferAccountId: null, golferEmail: 'x@t.local', golferName: 'X', golferPhone: '', status: 'completed', paymentStatus: 'paid',
  checkedInAt: at, checkInFailReason: '', cancellationFeeChargedAt: null, createdAt: at, courseId: 'c1', courseName: 'Pine', teeDate: '2026-11-10', ...o,
});
const accounts = [
  { id: 'a1', email: 'Alex@T.local', firstName: 'Alex', lastName: 'Rivera', phone: '(201) 555-0101', createdAt: at },
  { id: 'a2', email: 'never@t.local', firstName: 'Never', lastName: 'Booked', phone: null, createdAt: new Date('2026-11-15T12:00:00Z') },
];
const lines = golferLines(accounts, [
  bk({ golferAccountId: 'a1', golferEmail: 'alex@t.local', courseName: 'Pine', teeDate: '2026-11-15' }),
  bk({ golferAccountId: 'a1', golferEmail: 'alex@t.local', courseName: 'Lake', teeDate: '2026-11-01' }),
  bk({ golferEmail: 'ALEX@t.local', courseName: 'Lake', teeDate: '2026-11-02' }), // a guest booking with the account's email
  bk({ golferEmail: 'guest@t.local', golferName: 'Casey Guest', status: 'confirmed', paymentStatus: 'card_on_file', checkedInAt: null, teeDate: '2026-11-12' }), // a no-show
  bk({ golferEmail: 'fail@t.local', golferName: 'Jamie Fail', status: 'confirmed', paymentStatus: 'card_on_file', checkedInAt: null, checkInFailReason: 'Card declined', teeDate: '2026-11-14' }),
  bk({ golferEmail: '', golferName: 'Nobody' }),
], T);

const alex = lines.find(l => l.id === 'a1');
ok('an account and its email\'s guest bookings are one golfer', lines.filter(l => l.email.toLowerCase() === 'alex@t.local').length === 1 && alex?.rounds === 3, alex);
ok('…home course is where they played most (Lake 2, Pine 1)', alex?.homeCourse === 'Lake', alex?.homeCourse);
ok('…last played is the newest round', alex?.lastPlayed === '2026-11-15');
ok('…and an account in good standing is green', alex?.tone === 'ok');
const casey = lines.find(l => l.guestEmail === 'guest@t.local');
ok('a past confirmed booking never checked in is a no-show (amber), guest kept', casey?.tone === 'warn' && casey.noShows === 1 && casey.id === null, casey);
const jamie = lines.find(l => l.guestEmail === 'fail@t.local');
ok('a decline that never checked in is a failed charge (red), not a no-show', jamie?.tone === 'bad' && jamie.failedCharges === 1 && jamie.noShows === 0, jamie);
ok('a booking with no account and no email is nobody to open', !lines.some(l => l.name === 'Nobody'));
const never = lines.find(l => l.id === 'a2');
ok('an account that never booked is listed, with no rounds', never?.rounds === 0 && never.lastPlayed === null && never.homeCourse === null, never);
ok('sorted by last played, never-played last', lines[0].id === 'a1' && lines[lines.length - 1].lastPlayed === null, lines.map(l => l.name));
ok('a guest is named from the booking', casey?.name === 'Casey Guest');

ok('filter: accounts', lines.filter(l => matchesFilter(l, 'account')).every(l => l.id !== null));
ok('filter: guests', lines.filter(l => matchesFilter(l, 'guest')).length === 2);
ok('filter: no-shows or late cancels', lines.filter(l => matchesFilter(l, 'noshow')).map(l => l.guestEmail).join() === 'guest@t.local');
ok('filter: failed charges', lines.filter(l => matchesFilter(l, 'failed')).map(l => l.guestEmail).join() === 'fail@t.local');
ok('search by name, email or 4+ phone digits', !!alex && matchesQuery(alex, 'rivera') && matchesQuery(alex, 'ALEX@') && matchesQuery(alex, '555-0101') && !matchesQuery(alex, '55') && !matchesQuery(alex, 'casey'));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
