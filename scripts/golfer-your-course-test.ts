// Your <Course> (Cam 2026-11-18, lanes/golfer.md item 6): only the membership (group, StatusDot, renews or expires,
// one line of benefits) and the upcoming bookings, each opening its manage page. No statements, no dues.
// Run: npx tsx scripts/golfer-your-course-test.ts
import { readFileSync } from 'fs';
import { RENEWAL_FAILED, RENEWAL_PENDING, datedStatus, membershipLine, residentLine, upcomingWhen, manageHref, longDay, isDay } from '../src/app/courses/[slug]/member/your-course-helpers';
import { golferLookVars, DARK_STATUS } from '../src/components/golfer/look';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

const today = '2026-11-18';
check('a date reads like the mockup', longDay('2027-03-31') === 'Mar 31, 2027' && longDay('2027-03-31T00:00:00.000Z') === 'Mar 31, 2027');
check('green while it runs', JSON.stringify(datedStatus('2027-03-31T00:00:00.000Z', today)) === JSON.stringify({ dot: 'ok', when: 'expires Mar 31, 2027' }));
check('amber in its last 30 days', datedStatus('2026-12-18', today).dot === 'warn' && datedStatus('2026-12-19', today).dot === 'ok' && datedStatus(today, today).dot === 'warn');
check('red once the date has passed, and says it ended', JSON.stringify(datedStatus('2026-11-17', today)) === JSON.stringify({ dot: 'bad', when: 'ended Nov 17, 2026' }));
check('a renewing membership is green and says renews, even in its last month', JSON.stringify(datedStatus('2026-12-01', today, true)) === JSON.stringify({ dot: 'ok', when: 'renews Dec 1, 2026' }));
check('an impossible date is no date', !isDay('2026-13-45') && !isDay('2026-02-30') && isDay('2028-02-29') && isDay('2027-03-31T00:00:00.000Z') && datedStatus('2026-13-45', today).when === null);
check('an unreadable renewsOn falls back to expiresAt (an ended membership never reads green)', JSON.stringify(membershipLine({ name: 'D', membershipType: 'full', status: 'active', expiresAt: '2026-10-01', renewsOn: 'soon', groups: [{ kind: 'member', name: 'Member', color: null }] }, today)) === JSON.stringify({ group: 'Member', dot: 'bad', when: 'ended Oct 1, 2026' }));
check('no date (or a bad one): green, nothing said', JSON.stringify(datedStatus(null, today)) === JSON.stringify({ dot: 'ok', when: null }) && datedStatus('soon', today).when === null);

const base = { name: 'Dana', membershipType: 'full', status: 'active', expiresAt: '2027-03-31T00:00:00.000Z' };
const m = membershipLine({ ...base, groups: [{ kind: 'member', name: 'Member', color: null }] }, today);
check('the membership line: the group name from the session, with its date', m?.group === 'Member' && m?.when === 'expires Mar 31, 2027' && m?.dot === 'ok', m);
check('2b\'s renewsOn wins over expiresAt', membershipLine({ ...base, renewsOn: '2027-04-30', groups: [{ kind: 'member', name: 'Member', color: null }] }, today)?.when === 'renews Apr 30, 2027');
const M = [{ kind: 'member' as const, name: 'Member', color: null }];
check('the renewal failed only when the server says so (renewalFailed), in red, with what to do', JSON.stringify(membershipLine({ ...base, expiresAt: '2026-11-01', autoRenew: true, renewalFailed: true, groups: M }, today)) === JSON.stringify({ group: 'Member', dot: 'bad', when: null, problem: RENEWAL_FAILED }) && RENEWAL_FAILED === 'Your renewal didn’t go through. Call the pro shop.');
check('set to renew and past the date, no failure recorded: amber "being processed", never "didn\'t go through" or "ended" (Build 2026-11-18)', JSON.stringify(membershipLine({ ...base, expiresAt: '2026-11-17', autoRenew: true, groups: M }, today)) === JSON.stringify({ group: 'Member', dot: 'warn', when: null, note: RENEWAL_PENDING }) && membershipLine({ ...base, renewsOn: '2026-11-01', groups: M }, today)?.note === RENEWAL_PENDING && RENEWAL_PENDING === 'Your renewal is being processed.');
check('not set to renew, past the date: no pending note', !membershipLine({ ...base, autoRenew: false, expiresAt: '2026-11-01', groups: M }, today)?.note);
check('an explicit autoRenew false wins over a renewsOn date', membershipLine({ ...base, autoRenew: false, renewsOn: '2027-03-31', expiresAt: '2027-03-31', groups: M }, today)?.when === 'expires Mar 31, 2027');
check('not set to renew and past the date: ended, in red', membershipLine({ ...base, expiresAt: '2026-11-01', autoRenew: false, groups: [{ kind: 'member', name: 'Member', color: null }] }, today)?.when === 'ended Nov 1, 2026' && !membershipLine({ ...base, expiresAt: '2026-11-01', groups: [{ kind: 'member', name: 'Member', color: null }] }, today)?.problem);
check('autoRenew alone makes a running membership read renews', membershipLine({ ...base, autoRenew: true, groups: [{ kind: 'member', name: 'Member', color: null }] }, today)?.when === 'renews Mar 31, 2027');
check('a resident who is not a member has no membership line, and a resident line', membershipLine({ ...base, membershipType: 'Resident', expiresAt: null, groups: [{ kind: 'resident', name: 'Resident', expiresOn: '2026-12-31' }] }, today) === null
  && residentLine({ ...base, groups: [{ kind: 'resident', name: 'Resident', expiresOn: '2026-12-31' }] }, today)?.when === 'expires Dec 31, 2026');
check('an upcoming row reads like the mockup', JSON.stringify(upcomingWhen('2026-11-21', '07:40')) === JSON.stringify({ time: '7:40 AM', day: 'Sat Nov 21' }) && upcomingWhen('2026-11-27', '12:05').time === '12:05 PM' && upcomingWhen('2026-11-27', '00:10').time === '12:10 AM');
check('a manage link is only this site\'s /manage/ page', manageHref('/manage/abc?token=x') === '/manage/abc?token=x' && manageHref('https://greenreserve.app/manage/abc?t=1') === '/manage/abc?t=1');
check('…never another site, a script URL, or another page', [ 'https://evil.example/manage/a', '//evil.example/manage/a', 'javascript:alert(1)', '/book?x=1', '/manage', '/ manage/a', '/\\evil.example/manage/a', 42, null ].every(u => manageHref(u) === null));

const client = readFileSync('src/app/courses/[slug]/member/YourCourseClient.tsx', 'utf8');
const page = readFileSync('src/app/courses/[slug]/member/page.tsx', 'utf8');
check('the pending renewal note is shown under the line', client.includes('{member?.note && <p className={g.ymemnote}>{member.note}</p>}'));
check('the failed renewal is shown under the line', client.includes('{member?.problem && <p className={g.formerr}>{member.problem}</p>}'));
const code = client.replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
check('no statements, no dues, no payments, no booking (item 6)', !/statement|dues|payment|initiation|annual fee/i.test(code) && !code.includes('/book?') && !code.includes('/payments'));
check('an unknown course is a real 404, in the course look', page.includes('if (!course) notFound();') && client.includes('style={golferLookVars(course)}') && client.includes('<CourseFooter course={course}'));
check('the two sections, under "Your <Course>"', client.includes('>Your {course.name}</h2>') && client.includes('>Your membership</h3>') && client.includes('>Upcoming bookings</h3>'));
check('a StatusDot on each group, the benefits line only when the server writes one', (client.match(/<StatusDot status=/g) ?? []).length === 2 && client.includes('{s.benefits ? <p'));
check('each upcoming booking opens its manage page (the link checked first); a refused link is a plain row, not a dead link', client.includes('const href = manageHref(b.manageUrl);') && client.includes('<a className={`${g.yrow} ${g.ylink}`} href={href}>{row}<span className={g.lnk} aria-hidden="true">Manage ›</span></a>') && client.includes('<div className={g.yrow}>{row}</div>') && !client.includes('href={href ?? '));
check('the upcoming list shows only once the payload carries it; empty says so', client.includes('{Array.isArray(s.upcoming) && (') && client.includes('No upcoming bookings.'));
check('the site footer stays off the course\'s own pages (Log in, Your <Course>), which carry the course footer', /\(\\\/info\|\\\/login\|\\\/member\)/.test(readFileSync('src/components/Footer.tsx', 'utf8')));
check('on Dark the status dots use the dark colours (red the look\'s own); Light leaves the site\'s', (golferLookVars({ booking_look: { look: 'dark', accent: 'green' } }) as Record<string, string>)['--color-bad'] === '#EE9480' && (golferLookVars({ booking_look: { look: 'dark', accent: 'green' } }) as Record<string, string>)['--color-ok'] === DARK_STATUS['--color-ok'] && !('--color-ok' in golferLookVars({ booking_look: { look: 'light', accent: 'green' } })));
check('a private club: no "tee times" to go back to and no "Book a tee time"', client.includes("const booksOnline = course.type !== 'private' && course.type !== 'member';") && client.includes("{booksOnline ? 'Back to tee times' : `Back to ${course.name}`}") && client.includes('{booksOnline && <> <Link href={home}>Book a tee time</Link></>}'));
check('focus starts at the heading', client.includes('<h2 ref={headRef} tabIndex={-1}>Your {course.name}</h2>') && client.includes("if (load.state === 'in') headRef.current?.focus();"));
const coursePage = readFileSync('src/app/courses/[slug]/CourseBookingClient.tsx', 'utf8');
check('the private-club panel no longer promises availability or booking online', !coursePage.includes('view availability and book') && coursePage.includes("This is a private club. Members book through the pro shop{course.phone ? ` at ${course.phone}` : ''}."));
check('the header: who is logged in, and Log out (its failure said)', client.includes('Logged in · {s.name}') && client.includes('>Log out</button>') && client.includes('Couldn&rsquo;t log out. Try again.'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
