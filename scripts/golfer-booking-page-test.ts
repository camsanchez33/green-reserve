// Golfer booking page, Option A (Cam 2026-11-18, lanes/golfer.md items 1 and 4) and the course look
// (lanes/build.md "Booking page look"). The look tokens are tested directly; the page behaviours are source
// guards, like the other golfer page tests. Run: npx tsx scripts/golfer-booking-page-test.ts
import { readFileSync } from 'fs';
import { golferLookVars, presetOf, lookText, lookMode, lookAccentHex } from '../src/components/golfer/look';
import { BOOKING_ACCENT_COLOURS } from '../src/lib/booking-look';
import { describePolicy, policyFrom, afterCutoffLine } from '../src/lib/cancel-policy';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};
const v = (x: object, k: string) => (x as Record<string, string>)[k];

// The look (preset colours are lib/booking-look's: one source)
const G = BOOKING_ACCENT_COLOURS.green, K = BOOKING_ACCENT_COLOURS.black;
check('a preset hex is found whatever its case (fallback only)', presetOf(G.light.acc.toLowerCase()) === 'green' && presetOf(BOOKING_ACCENT_COLOURS.yellow.light.acc) === 'yellow');
check('a colour that is no preset is none', presetOf('#173B2A') === null && presetOf('') === null && presetOf(undefined) === null);
const reddish = (hex: string) => { const [r, gr, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return r > gr * 1.6 && r > b * 1.6; };
check('no red preset (red means a problem)', !Object.values(BOOKING_ACCENT_COLOURS).some(p => [p.light, p.dark].some(c => [c.acc, c.hover].some(reddish))));
const lightGreen = golferLookVars({ booking_look: { look: 'light', accent: 'green' }, brand_color: '#FF0000' });
check('booking_look wins over brand_color: Light + Green is the preset, white on it', v(lightGreen, '--g-acc') === G.light.acc && v(lightGreen, '--g-on-acc') === G.light.onAcc && v(lightGreen, '--g-card') === '#FFFFFF');
const darkGreen = golferLookVars({ booking_look: { look: 'dark', accent: 'green' } });
check('Dark + Green: the preset\'s dark values and the dark neutrals', v(darkGreen, '--g-acc') === G.dark.acc && v(darkGreen, '--g-on-acc') === G.dark.onAcc && v(darkGreen, '--g-card') === '#222422' && lookMode({ booking_look: { look: 'dark', accent: 'green' } }) === 'dark');
check('the header band keeps the preset colour in Dark (Black lifts to a grey)', v(darkGreen, '--g-band') === G.light.acc && v(golferLookVars({ booking_look: { look: 'dark', accent: 'black' } }), '--g-band') === '#2C2F33' && v(golferLookVars({ booking_look: { look: 'light', accent: 'black' } }), '--g-band') === K.light.acc);
const junk = golferLookVars({ booking_look: { look: 'sepia' as never, accent: 'red' as never }, brand_color: 'javascript:alert(1)' });
check('a bad booking_look and a bad hex fall back to Light and the default green, never into CSS', v(junk, '--g-acc') === '#173B2A' && v(junk, '--g-bg') === '#EEEFEA');
check('no booking_look: a preset brand_color reads as that preset, on Light', v(golferLookVars({ brand_color: G.light.acc }), '--g-acc') === G.light.acc && lookMode({ brand_color: G.light.acc }) === 'light');
check('no booking_look: another colour renders as it is, on Light', v(golferLookVars({ brand_color: '#336699' }), '--g-acc') === '#336699');
check('a course that has not picked a look (accent null) keeps its own colour as it is, on Light', v(golferLookVars({ booking_look: { look: 'light', accent: null as never }, brand_color: '#7A1F2B' }), '--g-acc') === '#7A1F2B');
check('the confirmation uses the same accent as the page', lookAccentHex({ booking_look: { look: 'dark', accent: 'yellow' }, brand_color: '#7A1F2B' }) === BOOKING_ACCENT_COLOURS.yellow.light.acc && lookAccentHex({ brand_color: '#7A1F2B' }) === '#7A1F2B');
check('the card field text follows the look', lookText('dark').ink === '#EDEEEB' && lookText('light').ink === '#141814' && lookText(null).ink === '#141814');

// The course page
const course = readFileSync('src/app/courses/[slug]/CourseBookingClient.tsx', 'utf8');
check('time of day is tiles, choose any, at least one (and it says so)', course.includes("aria-labelledby=\"tod-label\"") && course.includes("setLiveNote('Keep at least one time of day.')"));
check('no "Tee off between" or "Price up to" filter (removed in the mockup threads)', !course.includes('type="range"') && !course.includes('maxPrice') && !course.includes('setFromHour'));
check('picking a time opens its own Book page', course.includes('onClick={isFull ? () => openAlert(t.id) : () => bookTime(t)}') && course.includes('else router.push(`/book?${qp}`);'));
check('a time picked on a group page (?tt=) goes straight to its Book page, replacing the URL so Back works', course.includes('setGroupPick(pick);') && course.includes('bookTime(groupPick, true);') && course.includes('if (replace) router.replace(`/book?${qp}`);'));
check('the cart filter shows only when walking or riding depends on the time', course.includes('{cartVaries && (') && course.includes('open.some(t => t.cart_required) && open.some(t => !t.cart_required)'));
check('the course footer (Privacy, Terms, support, policy) stays on the page', course.includes('<CourseFooter course={course}'));
check('course details stay reachable from the info box', (course.match(/href=\{`\/courses\/\$\{slug\}\/info`\}/g) ?? []).length >= 2);
check('the header says Log in, or who is logged in with Your <Course> and Log out', course.includes('>Log in</Link>') && course.includes('Logged in · {memberSession.name}') && course.includes('Your {course.name}</Link>') && course.includes('>Log out</button>'));
check('a failed log-out is said, not swallowed', course.includes("if (!r || !r.ok) { setLogoutError(true); return; }"));
check('dialogs keep focus inside and close on Escape', course.includes("if (e.key === 'Tab')") && course.includes("if (e.key !== 'Escape') return;"));
check('the alert says what it covers (one time of day, or the day)', !course.includes('fits your filters'));

// The Book page
const book = readFileSync('src/app/book/BookClient.tsx', 'utf8');
check('no guest-or-log-in choice: the form opens straight away (item 4)', !book.includes('Continue as guest') && book.includes('<h3>Your details</h3>'));
check('logged in, Name and Email come from the course log-in and are read-only', book.includes('From your {courseName} log-in.') && book.includes('readOnly={fromLogin}') && book.includes("member.name !== 'Member'"));
check('fields left invalid turn red with a message, and Book goes to the first', book.includes('aria-invalid={bad.email ? true : undefined}') && book.includes("document.getElementById(`bk-${first}`)?.focus()"));
check('the email rule is the server\'s (two-letter ending, no % or \\)', book.includes('[^\\s@]{2,}$/.test(t) && !LIKE_UNSAFE_EMAIL.test(t)'));
check('Enter in the promo box applies the code and never books', book.includes("if (e.key === 'Enter') { e.preventDefault(); if (promoInput.trim() && !promoBusy) checkPromo(teeTime.id); }"));
check('"Have a promo code?" hides when the course says it has no live code', book.includes('course.has_live_promo !== false'));
check('one Fees line, its detail the LQ-2 name', book.includes('<p>{serviceFeeLabel(players)}</p>'));
check('past the cutoff at a hold course: no "$0 now", no free-cancel line, the hold said instead (R-GOLF-009)',
  book.includes('const pastHold = pastCutoff && holdsAtCutoff(') && book.includes("terms.lines.filter(l => !l.startsWith('Free cancellation until') &&")
  && book.includes("const bookWords = holdNow ? 'Book'") && book.includes('Booked now, {holdTodayLine(lateFeeWords)}.'));
check('the wallet sheet says the hold past the cutoff, not "nothing charged today"', book.includes('${holdNow ? `card held, ${holdNow}`'));
check('past the cutoff neither the free-cancel line nor its "After that" line shows', book.includes('l !== afterCutoffLine(policy.lateFeeTiming, lateFeeWords)'));
check('the trimmed name and email are sent', book.includes('await book({ name: name.trim(), email: email.trim(), phone }'));
// The Book page drops the free-cancel line by its opening words: if describePolicy() rewords it, this fails first.
{
  const lines = describePolicy(policyFrom({ cancellationHours: 24, lateCancellationFeeCents: 1000, lateFeeTiming: 'hold_at_cutoff' })).lines;
  check('describePolicy still opens a late-fee policy with "Free cancellation until…" and then the after-cutoff line', lines[0].startsWith('Free cancellation until') && lines[1] === afterCutoffLine('hold_at_cutoff', '$10'), lines.slice(0, 2));
}
check('the card field and wallet button follow the look', book.includes('<CardElement options={cardStyleFor(look)} />') && book.includes("theme: look === 'dark' ? 'light' : 'dark'"));
check('the agree box sits just above Book', book.indexOf('className={g.agree}') < book.indexOf('className={g.bookbar}') && book.indexOf('{policy}') < book.indexOf('className={g.agree}'));

// Item 5 (RANGE-1): the course's buckets, −/+ from 0, their own price line, sent as rangeBuckets; a 409 'range' reloads them.
check('range balls: one row per bucket with −/+ (0 to 20), only when the course sells them', book.includes('{(course.range_buckets ?? []).length > 0 && (') && book.includes('disabled={n >= 20}') && book.includes('aria-label={`One more ${r.name}`}'));
check('range balls: their own price line, and the request carries rangeBuckets (never the old size)', book.includes('<span>Range balls</span><span>${rangeBallsTotal.toFixed(2)}</span>') && book.includes('        rangeBuckets,\n') && !book.includes('rangeBallsSize'));
check('range balls: a 409 code range reloads the bucket list', book.includes("if (res.status === 409 && data.code === 'range') onRangeStale?.();") && book.includes('onRangeStale={reloadBuckets}'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
