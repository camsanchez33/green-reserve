// Tee time alerts on the booking page (Cam 2026-11-18, lanes/golfer.md item 7) on #486's POST /api/alerts.
// Source guards, like the other golfer page tests. Run: npx tsx scripts/golfer-alerts-sheet-test.ts
import { readFileSync } from 'fs';
import { alertSmsConsentText } from '../src/lib/sms-consent-copy';

let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const sheet = readFileSync('src/components/golfer/AlertSheet.tsx', 'utf8');
const course = readFileSync('src/app/courses/[slug]/CourseBookingClient.tsx', 'utf8');
const lib = readFileSync('src/lib/tee-time-alerts.ts', 'utf8');

// Where it opens from: the end of each day, a full time, and the empty state; none when the course turned alerts off.
check('a "Tell me when a time opens" row at the end of each day', course.includes('{/* Item 7: an alert row at the end of each day. */}') && course.includes('{alertsOn && !previewMode && (\n          <div className={g.altrow}>'));
check('"Tell me if it opens" on a full time opens the sheet pre-filled with that time', course.includes('if (alertsOn) openAlert(t);') && course.includes('slot: { id: String(t.id), time: t.time, label: formatTime(t.time), part: alertPartOf(t.time) }'));
check('the empty state\'s button opens it with the day, the time of day and the players', course.includes(": { day: selectedDate, parts: tods, players });") && course.includes("{alertsOn && <button type=\"button\" className={g.chip} onClick={() => openAlert()}>Tell me when a time opens</button>}"));
check('focus goes back to whatever opened it', course.includes('alertOpener.current = typeof document') && course.includes('alertOpener.current?.focus();'));
check('the dates it offers are this golfer\'s bookable, open days (up to 14)', course.includes('if (ds > lastBookableStr) break;') && course.includes('if (!closedOn.has(ds)) out.push(ds);') && lib.includes('export const MAX_ALERT_DATES = 14;') && sheet.includes('const MAX_DATES = 14;'));

// The sheet.
check('a dialog: a right panel on a laptop, sliding up on a phone; Escape closes, Tab stays inside', sheet.includes('role="dialog" aria-modal="true" aria-labelledby="al-h"') && sheet.includes("if (e.key === 'Escape')") && sheet.includes("if (e.key !== 'Tab' || !boxRef.current) return;"));
check('the parts are the API\'s keys, on the same edges as the cards', sheet.includes("{ key: 'afternoon', api: 'late'") && lib.includes("return time < '11:00' ? 'morning' : time < '14:00' ? 'midday' : 'late';"));
check('logged in: no email asked, the masked log-in email shown, "Turn on alert"', sheet.includes('We&rsquo;ll email <b>{mask(memberEmail)}</b> when a time opens.') && sheet.includes("memberEmail ? 'Turn on alert' : 'Email me a link to confirm'") && sheet.includes('...(memberEmail ? {} : { email: email.trim() })'));
check('guests type an email and confirm by an emailed link', sheet.includes('We sent a link to <b>{done.to}</b>. Tap it to turn this alert on. Nothing is sent until you do.'));
check('the text box is its own, unticked, with alertSmsConsentText() word for word', sheet.includes("const [textOk, setTextOk] = useState(false);") && sheet.includes('<span>{alertSmsConsentText(course.name)}</span>') && alertSmsConsentText('Maple Run').includes('separate from booking texts'));
check('the phone is sent only with the ticked box', sheet.includes("...(textOk ? { phone: phone.trim(), textConsent: true } : {}),"));
check('under the button: the stop link line and the Privacy Policy', sheet.includes('Every alert email has a link to stop alerts. <a href="/privacy"'));
check('first come, first served; nothing is held', sheet.includes('First to book gets it. The alert ends by itself after its last date.'));
check('an alert reads as on only when the server says active (fail safe)', sheet.includes("active: d.status === 'active',"));
check('server errors land on their field, the rest are said (no silent failure)', sheet.includes("d.field === 'textConsent' ? 'phone'") && sheet.includes("setErr({ form: 'Network error: the alert was not set."));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
