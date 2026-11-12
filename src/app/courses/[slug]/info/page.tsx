import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { OG_BASE } from '@/lib/seo';
import { DEMO_COURSE_SLUGS } from '@/lib/demo-courses';
import { loadPublicCourse } from '@/lib/public-course';
import { walkingWords } from '@/lib/walking';
import { teeColour } from '@/lib/tee-colour';
import { Card } from '@/components/ui/Card';
import { CourseHeader, CourseFooter, TYPE_LABELS, type FrameCourse } from '@/components/golfer/CourseFrame';

// GOLFER-REDO (Cam 2026-11-11): the Course info tab. Server-rendered so Google reads it.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const course = await prisma.course.findUnique({
    where: { slug },
    select: { name: true, city: true, state: true, isTest: true, heroPhotoUrl: true, logoUrl: true },
  });
  if (!course) return { title: 'Course info' };
  const robots = DEMO_COURSE_SLUGS.includes(slug) || course.isTest ? { index: false, follow: false } : undefined;
  const title = `${course.name} — Course info`;
  const description = `About ${course.name} in ${course.city}, ${course.state}: the course, yardages by tee, photos and facilities.`;
  const image = course.heroPhotoUrl || course.logoUrl;
  return {
    title, description, robots,
    openGraph: { ...OG_BASE, title, description, url: `/courses/${slug}/info`, ...(image ? { images: [{ url: image, alt: course.name }] } : {}) },
  };
}

type Photo = { id: string; url: string };
type TeeSet = { name: string; yardage: number; rating: number; slope: number };
type Nine = { name: string; par: number };

export default async function CourseInfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await loadPublicCourse(slug);
  if (!course) notFound();
  const accent: string = course.brand_color || '#173B2A';
  const frame = { ...course, hero_image_url: course.hero_image_url } as FrameCourse;
  const photos: Photo[] = course.photos ?? [];
  const teeSets: TeeSet[] = course.tee_sets ?? [];
  const nines: Nine[] = course.nines ?? [];
  const facilities: string[] = course.facilities ?? [];
  const dress: string[] = course.dress_code ?? [];
  const typeLabel = TYPE_LABELS[course.type] ?? 'Public';
  const facts = [
    { label: 'Course type', value: typeLabel },
    { label: 'Holes', value: course.holes ? String(course.holes) : '' },
    { label: 'Par', value: course.par ? String(course.par) : '' },
    { label: 'Location', value: [course.city, course.state].filter(Boolean).join(', ') },
  ].filter(f => f.value);
  const giftCard = course.gift_card_url && /^https?:\/\//i.test(course.gift_card_url) ? course.gift_card_url : '';

  return (
    <div className="bg-paper min-h-screen">
      <CourseHeader course={frame} accent={accent} active="info" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {(course.description || facts.length > 0) && (
          <section>
            <h2 className="font-serif font-semibold text-ink text-[28px] leading-none mb-4">About the course</h2>
            {course.description && <p className="text-ink leading-relaxed max-w-3xl">{course.description}</p>}
            {giftCard && (
              <a href={giftCard} target="_blank" rel="noopener noreferrer"
                className="inline-flex mt-5 px-4 py-2.5 rounded-md text-sm font-medium border border-line bg-white text-ink hover:border-line-strong transition-colors">
                Gift cards
              </a>
            )}
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-line">
              {facts.map(f => (
                <div key={f.label}>
                  <dt className="text-[13px] font-semibold text-ink mb-0.5">{f.label}</dt>
                  <dd className="text-ink text-sm">{f.value}</dd>
                </div>
              ))}
            </dl>
            <div className="grid sm:grid-cols-2 gap-6 mt-6 pt-6 border-t border-line text-sm">
              <div>
                <h3 className="font-semibold text-ink mb-1">Walking</h3>
                <p className="text-ink-soft">{walkingWords(course.walking_policy)}{course.walking_note?.trim() ? ` ${course.walking_note.trim()}` : ''}</p>
              </div>
              {dress.length > 0 && (
                <div>
                  <h3 className="font-semibold text-ink mb-1">Dress code</h3>
                  <ul className="text-ink-soft list-disc pl-5 space-y-0.5">{dress.map((l, i) => <li key={i}>{l}</li>)}</ul>
                </div>
              )}
            </div>
          </section>
        )}

        {(teeSets.length > 0 || nines.length > 1) && (
          <section>
            <h2 className="font-serif font-semibold text-ink text-[28px] leading-none mb-4">The tees</h2>
            {nines.length > 1 && (
              <p className="text-sm text-ink-soft mb-3">{nines.length} nines: {nines.map(n => `${n.name} (par ${n.par})`).join(', ')}.</p>
            )}
            {teeSets.length > 0 && (
              <Card className="divide-y divide-line text-sm max-w-2xl">
                {teeSets.map(t => {
                  const c = teeColour(t.name);
                  return (
                    <div key={t.name} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="flex items-center gap-2 font-medium text-ink">
                        {c && <span className="w-3 h-3 rounded-full border border-line-strong shrink-0" style={{ backgroundColor: c }} aria-hidden="true" />}
                        {t.name}
                      </span>
                      <span className="text-ink-soft tabular-nums">
                        {[t.yardage > 0 ? `${t.yardage.toLocaleString('en-US')} yards` : '', t.rating > 0 && t.slope > 0 ? `${t.rating.toFixed(1)} / ${t.slope}` : ''].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  );
                })}
              </Card>
            )}
          </section>
        )}

        {photos.length > 0 && (
          <section>
            <h2 className="font-serif font-semibold text-ink text-[28px] leading-none mb-4">Photos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.url} alt={`${course.name} photo ${i + 1}`} loading="lazy"
                  className="w-full aspect-video object-cover rounded-lg bg-line-soft" />
              ))}
            </div>
          </section>
        )}

        {facilities.length > 0 && (
          <section>
            <h2 className="font-serif font-semibold text-ink text-[28px] leading-none mb-4">Facilities</h2>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-sm text-ink list-disc pl-5">
              {facilities.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </section>
        )}
      </main>
      <CourseFooter course={frame} accent={accent} />
    </div>
  );
}
