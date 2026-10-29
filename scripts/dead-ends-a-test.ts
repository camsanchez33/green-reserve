// Revamp 3 daily dead ends, PR A (Cam 2026-10-29). Source checks for the UI parts;
// the search order, close-out days and cancellations are pinned in their own DB tests.
// Run: npx tsx scripts/dead-ends-a-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const src = (f: string) => readFileSync(f, 'utf8');

// 16. Declined cards.
const list = src('src/components/dashboard/DeclinedCardList.tsx');
ok('16: a declined card opens the tee sheet on its own day with the golfer found', list.includes('href={`/dashboard?date=${d.date}&q=${encodeURIComponent(d.name)}`}'));
ok('16: Home and Money share the rows, pay links included', src('src/app/dashboard/home/page.tsx').includes('<DeclinedCardList') && src('src/app/dashboard/money/page.tsx').includes('<DeclinedCardList') && list.includes("action: 'send_pay_link'"));
ok('16: sorted by the round, not when it was booked; Money lists more', src('src/lib/operator-home.ts').includes("orderBy: [{ teeTime: { date: 'desc' } }, { teeTime: { time: 'desc' } }]") && src('src/app/api/operator/money/overview/route.ts').includes('declinedCards(session.courseId, true, 50)'));

// 17. The tee sheet re-reads itself.
const sheet = src('src/app/dashboard/page.tsx');
ok('17: the sheet re-reads every 30s while in front, never mid-action', sheet.includes('setInterval(tick, 30_000)') && sheet.includes("document.visibilityState === 'visible' && !busyRef.current") && sheet.includes('loadTimes(selectedDate, true)'));
ok('17: a background read never wipes the sheet on a failure', sheet.includes('if (!r.ok) { if (quiet) return;'));

// 21. Members: dues and editing.
const members = src('src/app/dashboard/members/page.tsx');
const route = src('src/app/api/operator/members/route.ts');
ok('21: Paid at the shop and Email dues link on members who owe', members.includes("action: 'mark_paid'") && members.includes("action: 'send_pay_link'") && members.includes('Paid at the shop'));
ok('21: a member can be edited after adding — an invite\'s contact, never a linked account\'s', members.includes('Edit details') && route.includes('if (membership.golferId) return NextResponse.json({ error: \'This member signs in with their own account'));
ok('21: a bad "runs until" date is refused, not a 500', route.includes("Pick the date it runs until, or leave it blank."));

ok('21: the dues link never reports a send that did not happen (no Stripe, no email, nothing owed)', route.includes("if (sent !== 'sent') return NextResponse.json({ error: NOT_SENT[sent] }, { status: 409 });") && route.includes("return 'no_stripe';"));

// 24. Close-out.
const close = src('src/components/dashboard/RegisterClose.tsx');
ok('24: a blind count — figures show only once the day is counted', close.includes('const revealed = !!summary && (dayCloses.length > 0 || saved?.day === summary.day)') && close.includes('{revealed && ('));
ok('24: starting cash carries over from the last close-out', close.includes('setFloat(f => f || (last.openingFloatCents / 100).toFixed(2))'));

// 26. Every page reachable on a phone.
const nav = src('src/components/OperatorSidebar.tsx');
ok('26: the phone bar has More for every page not on it', nav.includes('const moreItems = navItems.filter(n => !mobileKeys.includes(n.key) && !n.soon && visible(n.key))') && nav.includes('id="op-more"'));

// 13. Cancellations reads cancelled bookings only.
ok('13: a search result opens Cancellations filtered even when already on it', src('src/app/dashboard/money/page.tsx').includes("<CancellationsPanel key={searchParams.get('q') ?? ''}"));
ok('13: Cancellations reads only cancelled bookings, and can be searched', src('src/app/dashboard/money/page.tsx').includes("/api/operator/bookings?status=cancelled") && src('src/components/dashboard/money/CancellationsPanel.tsx').includes('placeholder="Find a golfer"'));

if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
