import type { Metadata } from 'next';
import { previewFor } from '@/lib/seo';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';

// HOMEPAGE_SPEC §11 (Cam 2026-10-19): three paths — a course thinking about
// GreenReserve, a course already on it, a golfer with a booking (sent to their
// course: GreenReserve doesn't run the tee sheet). One phone number and the one
// inbox (thegreenreserve@outlook.com; hello@ is send-only, CLAUDE.md).
const PHONE = '(845) 499-3515';
const TEL = '+18454993515';
const EMAIL = 'thegreenreserve@outlook.com';
const DESCRIPTION = 'Talk to GreenReserve: book a demo for your course, get help with your tee sheet, or find out who to call about a booking.';

export const metadata: Metadata = {
  title: 'Contact',
  description: DESCRIPTION,
  // Link previews carry this page's own title, not the homepage's.
  ...previewFor('Contact | GreenReserve', DESCRIPTION),
};

const link = 'text-pine font-medium hover:underline underline-offset-2';

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <h1 className="text-[34px] sm:text-[44px] leading-tight font-serif font-semibold text-ink">Contact us</h1>
        <p className="text-[16px] text-ink-soft leading-relaxed mt-3 max-w-xl">
          A real person answers the phone and reads every email. Pick the one that sounds like you.
        </p>

        <div className="mt-10 space-y-4">
          <Card className="p-6">
            <h2 className="font-serif font-semibold text-ink text-[22px]">Thinking about GreenReserve for your course</h2>
            <p className="text-[14.5px] text-ink-soft leading-relaxed mt-2">
              Book a demo and we&apos;ll walk you through the tee sheet with your own course&apos;s times and prices. Not ready for a call? Send us a note and we&apos;ll write back.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link href="/demo" className="inline-flex items-center px-5 py-2.5 rounded-md bg-pine hover:bg-pine-hover text-white text-[14px] font-medium transition-colors">Book a demo</Link>
              <Link href="/for-courses#ask" className={link + ' text-[14px]'}>Send us a note</Link>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="font-serif font-semibold text-ink text-[22px]">Your course is already on GreenReserve</h2>
            <p className="text-[14.5px] text-ink-soft leading-relaxed mt-2">
              Call or text us, or email. If you&apos;re signed in, you can also message us from <span className="text-ink">Messages</span> in your dashboard.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-[14.5px]">
              <div>
                <dt className="text-[13px] text-ink-muted">Phone</dt>
                <dd className="mt-0.5"><a href={`tel:${TEL}`} className={link + ' tabular-nums'}>{PHONE}</a></dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-muted">Email</dt>
                <dd className="mt-0.5 break-words"><a href={`mailto:${EMAIL}`} className={link}>{EMAIL}</a></dd>
              </div>
            </dl>
            <p className="text-[13.5px] text-ink-soft mt-4">
              <Link href="/dashboard/login" className={link}>Sign in to your dashboard</Link>
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="font-serif font-semibold text-ink text-[22px]">You booked a tee time</h2>
            <p className="text-[14.5px] text-ink-soft leading-relaxed mt-2">
              Your course runs its own tee sheet, so the course is who can help with your round. Open <span className="text-ink">Manage my booking</span> from your confirmation email: there you can change players, move your time or cancel, and find the course&apos;s phone number for anything else, such as weather or a refund.
            </p>
            <p className="text-[14.5px] text-ink-soft leading-relaxed mt-3">
              Can&apos;t find your confirmation, or something went wrong with the booking itself? Email <a href={`mailto:${EMAIL}`} className={link + ' break-words'}>{EMAIL}</a> with the course name and the date of your round.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
