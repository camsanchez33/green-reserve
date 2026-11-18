'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { golferLookVars } from '@/components/golfer/look';
import { CourseFooter } from '@/components/golfer/CourseFrame';
import { StatusDot } from '@/components/ui/StatusDot';
import g from '@/components/golfer/golfer.module.css';
import type { LoginCourse } from '../login/LoginClient';
import { membershipLine, residentLine, upcomingWhen, manageHref, type YourSession } from './your-course-helpers';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'in'; s: YourSession } | { state: 'out' };

export default function YourCourseClient({ course, linkFailed }: { course: LoginCourse; linkFailed: boolean }) {
  const router = useRouter();
  const slug = course.slug;
  const home = `/courses/${slug}`;
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [logoutError, setLogoutError] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);
  // A private club's tee times aren't booked online (api/bookings refuses them): no "tee times" to go back to.
  const booksOnline = course.type !== 'private' && course.type !== 'member';

  const fetchSession = useCallback(async () => {
    setLoad({ state: 'loading' });
    try {
      const r = await fetch(`/api/member/${encodeURIComponent(slug)}/session`, { cache: 'no-store' });
      if (r.status === 401) { setLoad({ state: 'out' }); return; }
      if (!r.ok) { setLoad({ state: 'error' }); return; }
      setLoad({ state: 'in', s: (await r.json()) as YourSession });
    } catch {
      setLoad({ state: 'error' });
    }
  }, [slug]);

  useEffect(() => { fetchSession(); }, [fetchSession]);
  // Arriving here, focus starts at the page's heading (as on Log in).
  useEffect(() => { if (load.state === 'in') headRef.current?.focus(); }, [load.state]);

  // One log-in (Build 2026-11-18): logged out, this page sends the golfer to the course's code log-in, which comes
  // back here. A failed emailed link says so there, in one line that names no reason.
  useEffect(() => {
    if (load.state !== 'out') return;
    const q = new URLSearchParams({ back: `${home}/member` });
    if (linkFailed) q.set('link', 'failed');
    router.replace(`${home}/login?${q}`);
  }, [load.state, home, linkFailed, router]);

  async function logOut() {
    const r = await fetch(`/api/member/${encodeURIComponent(slug)}/logout`, { method: 'POST' }).catch(() => null);
    if (!r || !r.ok) { setLogoutError(true); return; }
    router.replace(home);
    router.refresh();
  }

  const s = load.state === 'in' ? load.s : null;
  const groupWords = (s?.groups ?? []).map(gr => gr.name).join(' and ');
  const member = s ? membershipLine(s) : null;
  const resident = s ? residentLine(s) : null;

  return (
    <div className={g.root} style={golferLookVars(course)}>
      <div className={g.site}>
        <header className={g.top}>
          <h1><Link href={home}>{course.name}</Link></h1>
          {s && (
            <nav className={g.topLinks} aria-label="Your account at this course">
              <span>Logged in · {s.name}{groupWords ? ` · ${groupWords}` : ''}</span>
              <button type="button" className={g.lnk} onClick={logOut}>Log out</button>
              {logoutError && <span role="alert">Couldn&rsquo;t log out. Try again.</span>}
            </nav>
          )}
        </header>
        {/* The site layout's main element is the page's one main landmark; this is its content. */}
        <div className={g.wrap}>
          <div className={g.bk} style={{ maxWidth: 640 }}>
            <Link href={home} className={`${g.lnk} ${g.back}`}>‹ {booksOnline ? 'Back to tee times' : `Back to ${course.name}`}</Link>
            {load.state === 'error' ? (
              <div className={g.empty} role="alert">
                <h2>Couldn&rsquo;t load your {course.name} page</h2>
                <p>Check your connection and try again.</p>
                <div className={g.opts}><button type="button" className={`${g.chip} ${g.fill}`} onClick={fetchSession}>Try again</button></div>
              </div>
            ) : !s ? (
              <p className={g.pol} role="status">{load.state === 'out' ? 'Opening Log in…' : 'Loading…'}</p>
            ) : (<>
              <h2 ref={headRef} tabIndex={-1}>Your {course.name}</h2>

              <section aria-labelledby="ym">
                <h3 id="ym" className={g.yh3}>Your membership</h3>
                <div className={g.card}>
                  {member && (
                    <p className={g.ymem}>
                      <StatusDot status={member.dot} />
                      <span><b>{member.group}</b>{member.when ? <> &middot; {member.when}</> : null}</span>
                    </p>
                  )}
                  {member?.problem && <p className={g.formerr}>{member.problem}</p>}
                  {resident && (
                    <p className={g.ymem}>
                      <StatusDot status={resident.dot} />
                      <span><b>Resident</b>{resident.when ? <> &middot; {resident.when}</> : null}</span>
                    </p>
                  )}
                  {s.benefits ? <p className={`${g.pol} ${g.ylast}`}>{s.benefits}</p> : null}
                </div>
              </section>

              {Array.isArray(s.upcoming) && (
                <section aria-labelledby="yu" className={g.ysec}>
                  <h3 id="yu" className={g.yh3}>Upcoming bookings</h3>
                  {s.upcoming.length === 0 ? (
                    <p className={g.pol}>No upcoming bookings.{booksOnline && <> <Link href={home}>Book a tee time</Link></>}</p>
                  ) : (
                    <ul className={g.ylist}>
                      {s.upcoming.map(b => {
                        const w = upcomingWhen(b.date, b.time);
                        const href = manageHref(b.manageUrl);
                        const row = (<>
                          <span className={g.ywhen}><b>{w.time}</b><span>{w.day}</span></span>
                          <span className={g.ywhat}>
                            <b>{b.players} {b.players === 1 ? 'player' : 'players'} &middot; {b.holes} holes</b>
                            <span>{b.membersOnlyDay ? <>Members-only day{b.dueLine ? <> &middot; </> : null}</> : null}{b.dueLine}</span>
                          </span>
                        </>);
                        return (
                          <li key={b.bookingId}>
                            {/* A link that isn't this site's manage page is shown as a plain row, never a dead link (manageHref). */}
                            {href ? (
                              <a className={`${g.yrow} ${g.ylink}`} href={href}>{row}<span className={g.lnk} aria-hidden="true">Manage ›</span></a>
                            ) : (
                              <div className={g.yrow}>{row}</div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}
            </>)}
          </div>
        </div>
      </div>
      <CourseFooter course={course} accent={course.brand_color || '#173B2A'} />
    </div>
  );
}

