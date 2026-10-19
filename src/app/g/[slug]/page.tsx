// GRP-1 (Cam 2026-10-19, after golfbergencounty.com/tee-times): a course group's
// one golfer page — every live course in the group with its open times for a
// day. Server-rendered, no client JS: the day links are plain links, and a time
// opens that course's own booking page with the time picked (?tt=), where the
// golfer chooses players and books as usual. Each course's own rules apply
// (loadPublicTeeTimes: booking window, past times hidden).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { loadPublicTeeTimes } from '@/lib/public-tee-times';
import { todayIn, addDaysStr } from '@/lib/course-time';
import { formatTeeDay, formatTeeTime } from '@/lib/format';
import { Card } from '@/components/ui/Card';

const SHOWN = 12;
const DAYS = 7;
const price = (d: number) => `$${Number.isInteger(d) ? d : d.toFixed(2)}`;

async function loadGroup(slug: string) {
  return prisma.courseGroup.findUnique({
    where: { slug },
    select: {
      name: true, slug: true, description: true,
      courses: {
        // Members-only clubs have no public times to list.
        where: { active: true, liveStatus: 'live', archivedAt: null, type: { notIn: ['private', 'member'] } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true, city: true, state: true, timezone: true },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const g = await prisma.courseGroup.findUnique({ where: { slug }, select: { name: true, description: true, courses: { select: { name: true } } } });
  if (!g) return { title: 'Book Tee Times' };
  const title = `${g.name} — Book Tee Times`;
  const description = g.description || (g.courses.length ? `Book tee times at ${g.courses.map(c => c.name).join(', ')}.` : `Book tee times with ${g.name}.`);
  return { title, description, alternates: { canonical: `/g/${slug}` } };
}

export default async function GroupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const group = await loadGroup(slug);
  if (!group) notFound();

  // A group's courses share a region; the first course's clock decides "today".
  const today = todayIn(group.courses[0]?.timezone);
  const sp = await searchParams;
  const asked = typeof sp.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const date = asked < today ? today : asked;
  const days = Array.from({ length: DAYS }, (_, i) => addDaysStr(today, i));
  if (!days.includes(date)) days.push(date);

  const results = await Promise.all(group.courses.map(async c => ({ course: c, times: await loadPublicTeeTimes(c.slug, date) })));
  const anyOpen = results.some(r => r.times.ok && r.times.teeTimes.some(t => t.players_available > 0));

  return (
    <main className="bg-paper min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="font-serif font-semibold text-ink text-[32px] sm:text-[40px] leading-tight">{group.name}</h1>
        <p className="text-[15px] text-ink-soft mt-2">
          {group.description || `${group.courses.length} course${group.courses.length === 1 ? '' : 's'}, one place to book.`}
        </p>

        <nav aria-label="Pick a day" className="mt-6 flex flex-wrap gap-2">
          {days.map(d => (
            <Link key={d} href={`/g/${group.slug}?date=${d}`} aria-current={d === date ? 'date' : undefined}
              className={`px-3 py-2 rounded-md text-[13.5px] font-medium border ${d === date ? 'bg-pine border-pine text-white' : 'bg-white border-line text-ink hover:border-pine/40'}`}>
              {d === today ? 'Today' : formatTeeDay(d)}
            </Link>
          ))}
        </nav>

        {group.courses.length === 0 && (
          <p className="mt-8 text-[14px] text-ink-soft">These courses aren&apos;t taking online bookings yet. Check back soon.</p>
        )}
        {group.courses.length > 0 && !anyOpen && (
          <p className="mt-6 text-[14px] text-ink-soft">No open times at any course on this day. Try another day.</p>
        )}

        <div className="mt-6 space-y-4">
          {results.map(({ course, times }) => {
            const open = times.ok ? times.teeTimes.filter(t => t.players_available > 0) : [];
            const from = open.length ? Math.min(...open.map(t => t.green_fee)) : null;
            const coursePage = `/courses/${course.slug}?date=${date}`;
            const opensIn = !times.ok && times.body.error === 'outside_window' ? Number(times.body.windowDays) : null;
            return (
              <Card key={course.id} className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="font-serif font-semibold text-ink text-[22px] leading-tight">
                      <Link href={coursePage} className="hover:underline">{course.name}</Link>
                    </h2>
                    <p className="text-[13px] text-ink-muted mt-0.5">{[course.city, course.state].filter(Boolean).join(', ')}</p>
                  </div>
                  {from != null && <p className="text-[13.5px] text-ink-soft">From <span className="font-semibold text-ink tabular-nums">{price(from)}</span> per player</p>}
                </div>
                {opensIn != null ? (
                  <p className="mt-3 text-[13.5px] text-ink-soft">Online booking opens {opensIn} day{opensIn === 1 ? '' : 's'} ahead, so this day isn&apos;t open yet.</p>
                ) : !times.ok ? (
                  <p className="mt-3 text-[13.5px] text-ink-soft">Times for this course couldn&apos;t be shown. <Link href={coursePage} className="text-pine font-medium hover:underline">Open its booking page</Link>.</p>
                ) : open.length === 0 ? (
                  <p className="mt-3 text-[13.5px] text-ink-soft">No open times this day.</p>
                ) : (
                  <>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {open.slice(0, SHOWN).map(t => (
                        <li key={t.id}>
                          <Link href={`${coursePage}&tt=${encodeURIComponent(String(t.id))}`}
                            className="inline-flex flex-col items-center min-w-[96px] px-3 py-2 rounded-md bg-white border border-line hover:border-pine/40 text-ink">
                            <span className="text-[14px] font-semibold tabular-nums">{formatTeeTime(t.time)}</span>
                            <span className="text-[12px] text-ink-muted tabular-nums">{price(t.green_fee)} · {t.players_available} spot{t.players_available === 1 ? '' : 's'}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {open.length > SHOWN && (
                      <p className="mt-2 text-[13px]"><Link href={coursePage} className="text-pine font-medium hover:underline">{open.length - SHOWN} more times at {course.name}</Link></p>
                    )}
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}
