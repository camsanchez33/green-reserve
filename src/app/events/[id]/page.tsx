// W2-9d (Cam 2026-10-22): an event's public sign-up page. The course opens it
// per event (Events → the event → Sign-up page); closed, cancelled or unknown
// events show nothing about the event. Server-rendered; the form is the one
// small client island (SignupForm — no libraries; Stripe only loads on the
// pay page it hands over to).
import type { Metadata } from 'next';
import { CourseHeaderBar } from '@/components/CourseHeaderBar';
import { Card } from '@/components/ui/Card';
import { signupPage } from '@/lib/event-signup';
import { formatTeeDay, formatTeeTime } from '@/lib/format';
import SignupForm from './SignupForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Event sign-up', robots: { index: false, follow: false } };

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const KIND: Record<string, string> = { outing: 'Outing', tournament: 'Tournament', league: 'League', other: 'Event' };

export default async function EventSignupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await signupPage(id);
  if (!page) {
    return (
      <main className="min-h-screen bg-paper flex items-center justify-center px-4">
        <Card className="p-6 max-w-sm text-center">
          <h1 className="font-serif text-[24px] font-semibold text-ink">Sign-ups are closed</h1>
          <p className="text-sm text-ink-soft mt-2">This event isn’t taking sign-ups online. Ask the course about it.</p>
        </Card>
      </main>
    );
  }
  const start = page.format === 'shotgun' ? `${page.holes}-hole shotgun start at ${formatTeeTime(page.startTime)}` : `Tee times from ${formatTeeTime(page.startTime)}`;
  const full = page.spotsLeft === 0;
  return (
    <main className="min-h-screen bg-paper">
      <CourseHeaderBar courseName={page.course.name} accent={page.course.brandColor} logoUrl={page.course.logoUrl} photoUrl={page.course.photoUrl} />
      <div className="max-w-xl mx-auto px-4 py-8 space-y-5">
        <Card className="p-5">
          <h1 className="font-serif text-[30px] font-semibold text-ink leading-tight">{page.name}</h1>
          <p className="text-[14px] text-ink mt-2">{KIND[page.kind] ?? 'Event'} · {formatTeeDay(page.date)} · {start}</p>
          <ul className="divide-y divide-line-soft mt-4 text-[14px]">
            {page.pricePerPlayerCents > 0 && <li className="flex justify-between gap-3 py-2"><span className="text-ink-soft">Entry</span><span className="text-ink tabular-nums">{usd(page.pricePerPlayerCents)} per player</span></li>}
            {page.includes.length > 0 && <li className="flex justify-between gap-3 py-2"><span className="text-ink-soft">Included</span><span className="text-ink text-right">{page.includes.join(', ')}</span></li>}
            {page.spotsLeft != null && <li className="flex justify-between gap-3 py-2"><span className="text-ink-soft">Spots left</span><span className="text-ink tabular-nums">{full ? 'Full — join the waiting list' : page.spotsLeft}</span></li>}
          </ul>
          {page.terms && <p className="text-[13px] text-ink-soft mt-3 whitespace-pre-line"><span className="font-semibold text-ink">{page.course.name}’s terms:</span> {page.terms}</p>}
        </Card>
        {page.past
          ? <Card className="p-5"><p className="text-sm text-ink">This event has already happened.</p></Card>
          : <SignupForm eventId={page.id} accent={page.course.brandColor} maxGroup={page.maxGroup} questions={page.questions}
              payNow={page.payNow} priceCents={page.pricePerPlayerCents} feeCents={page.feePerPlayerCents} spotsLeft={page.spotsLeft} courseName={page.course.name} />}
      </div>
    </main>
  );
}
