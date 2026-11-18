// Log in (Cam 2026-11-18, lanes/golfer.md item 2) on #490's code API. The two helpers are tested directly; the page
// behaviours are source guards. Run: npx tsx scripts/golfer-login-page-test.ts
import { readFileSync } from 'fs';
import { loginLine, safeBack, loginOffered } from '../src/app/courses/[slug]/login/login-helpers';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

// The line under "Log in to <Course>", built from the course's groups.
check('one group', loginLine('Maple Run', ['members']) === 'For Maple Run members.', loginLine('Maple Run', ['members']));
check('two groups', loginLine('Maple Run', ['members', 'residents']) === 'For Maple Run members and residents.');
check('three or more: a comma list ending in "and"', loginLine('Maple Run', ['members', 'residents', 'season pass holders']) === 'For Maple Run members, residents, and season pass holders.');
check('no groups sent yet: members', loginLine('Maple Run', undefined) === 'For Maple Run members.' && loginLine('Maple Run', []) === 'For Maple Run members.');

// Where Log in goes back to: only this course's pages or /book on this site.
check('the tee times with their filters', safeBack('/courses/maple?date=2026-11-19&players=3', 'maple') === '/courses/maple?date=2026-11-19&players=3');
check('the Book page', safeBack('/book?tee_time_id=x&course_slug=maple', 'maple') === '/book?tee_time_id=x&course_slug=maple');
check('a course page under the slug', safeBack('/courses/maple/member', 'maple') === '/courses/maple/member');
for (const bad of ['//evil.example/x', 'https://evil.example', '/\\evil.example', '/courses/other', '/courses/maplewood', '/admin', '/courses/maple/../../admin', '/courses/maple/./x/../../../admin', '/courses/maple/%2e%2e/admin', '/courses/maple/.\t./.\t./admin', '/courses/maple/.\n./.\n./courses/other?x=1', '/courses/maple/.\r./admin', '/courses/maple/..#x', '/courses/maple#x', '/courses/maple/ ../admin', '/book', '/book/../admin', '', 'javascript:alert(1)']) {
  check(`refused, back to the course: ${JSON.stringify(bad)}`, safeBack(bad, 'maple') === '/courses/maple');
}

const page = readFileSync('src/app/courses/[slug]/login/LoginClient.tsx', 'utf8');
check('the code is sent with mode code (the approved screen), never the emailed link', page.includes("JSON.stringify({ email: v, mode: 'code' })"));
check('one wording whether or not the email is on the list', page.includes('is on {course.name}&rsquo;s list, we sent a 6-digit code. It works for 10 minutes.') && page.includes('Not set up? Ask the pro shop.'));
check('the first-log-in box appears only after a right code (409 terms_required), unticked, and Log in waits for it',
  page.includes("if (r.status === 409 && d.code === 'terms_required') { setNeedTerms(true); setAgreed(false); return; }")
  && page.includes('disabled={!!busy || (needTerms && !agreed)}') && page.includes('Tick the box to agree before you log in.'));
check('the box says what is agreed to, word for word', page.includes('and that {course.name} and GreenReserve keep my booking history.'));
check('the tick is sent only once it was asked for', page.includes('...(needTerms ? { agreeTerms: agreed } : {})'));
check('a wrong code shows the server\'s one answer on the field', page.includes("if (d.code === 'bad_code') { setCodeErr(d.error"));
check('failures are said, never swallowed', page.includes("Network error: you are not logged in yet.") && page.includes("Network error: the code was not sent."));
check('a course with log-in switched off, or with no group, says so and asks nothing', page.includes("const loginOff = !loginOffered(course);"));
check('Log in is offered only with the switch on AND a group', loginOffered({ member_login_on: true, login_groups: ['members'] }) && loginOffered({ member_login_on: true, login_groups: ['residents'] })
  && !loginOffered({ member_login_on: true, login_groups: [] }) && !loginOffered({ member_login_on: false, login_groups: ['members'] }) && !loginOffered({}));

const course = readFileSync('src/app/courses/[slug]/CourseBookingClient.tsx', 'utf8');
check('the header Log in goes to the log-in page and back to these tee times', course.includes('const loginHref = `/courses/${slug}/login?back=${encodeURIComponent(') && course.includes('<Link className={g.lnk} href={loginHref}>Log in</Link>'));
check('no Log in when the course switched it off or has no group (course page and Book page)', course.includes('const loginOn = loginOffered(course);') && course.includes(') : loginOn ? (') && readFileSync('src/app/book/BookClient.tsx', 'utf8').includes('{!member && loginOffered(course) && ('));
check('logged in, the header names the groups', course.includes('Logged in · {memberSession.name}{groupWords ?'));
const book = readFileSync('src/app/book/BookClient.tsx', 'utf8');
check('the Book page has the one Log in, coming back to this booking', book.includes('/login?back=${encodeURIComponent(`/book?${params.toString()}`)}'));
const member = readFileSync('src/app/courses/[slug]/member/page.tsx', 'utf8');
check('no "sign in" left on the member page (item 2: Log in)', !/sign[ -]in|Sign out/i.test(member.replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/function SignInPanel|<SignInPanel/g, '')));

// What the browser would do with each accepted value: it must stay on this course's pages or /book.
for (const raw of ['/courses/maple?date=2026-11-19', '/book?tee_time_id=x', '/courses/maple/member', '/courses/maple/./member', '/courses/maple/x/../member']) {
  const out = safeBack(raw, 'maple');
  const landed = new URL(out, 'https://greenreserve.app/courses/maple/login').pathname;
  check(`accepted values resolve on this course or /book: ${JSON.stringify(raw)} → ${out}`, landed === '/courses/maple' || landed.startsWith('/courses/maple/') || landed === '/book');
}

check('the Log in button never reads "Logging in…" while a new code is being sent', page.includes("{busy === 'verify' ? 'Logging in…' : 'Log in'}") && page.includes("setBusy('send');"));
check('the terms box is described by its hint', page.includes("aria-describedby={agreed ? 'li-terms-err' : 'li-terms-hint li-terms-err'}"));
const bookSrc = readFileSync('src/app/book/BookClient.tsx', 'utf8');
check('the Book page header, logged in: name and groups, Your <Course>, Log out (failure said)', bookSrc.includes("{member.groups.length ? ` · ${member.groups.join(' and ')}` : ''}") && bookSrc.includes('>Log out</button>') && bookSrc.includes("if (!r || !r.ok) { setLogoutErr(true); return; }"));
check('the private-club Log in follows the same rule and goes to the code page', course.includes(') : loginOffered(course) ? (') && course.includes('{memberSession ? (\n                <Link\n                  href={`/courses/${slug}/member`}') && course.includes('href={`/courses/${slug}/login?back=${encodeURIComponent(`/courses/${slug}/member`)}`}') && course.includes('Your {course.name}\n                </Link>\n              ) : loginOffered(course) ? ('));
check('no empty account landmark for a guest when Log in is not offered', course.includes('{!previewMode && (memberSession || loginOn) && ('));

check('a failed resend puts focus back on the code field', readFileSync('src/app/courses/[slug]/login/LoginClient.tsx', 'utf8').split("(step === 'code' ? codeRef : emailRef).current?.focus()").length === 3);

for (const f of ['src/app/courses/[slug]/CourseBookingClient.tsx', 'src/app/book/BookClient.tsx', 'src/app/courses/[slug]/login/LoginClient.tsx']) {
  check(`one main landmark: ${f} adds no <main> inside the layout's`, !readFileSync(f, 'utf8').includes('<main'));
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
