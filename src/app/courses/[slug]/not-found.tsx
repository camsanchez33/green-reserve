import Link from 'next/link';
import Image from 'next/image';
import { SUPPORT_EMAIL } from '@/lib/contact';

// An unknown /courses/<slug> (page.tsx calls notFound()): a real 404 with the same words the page used to show.
// No course resolved, so this is a GreenReserve page (AMENDED BIRDIE RULE).
export default function CourseNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="text-center max-w-sm">
        <Image src="/brand/golfer.svg" unoptimized alt="" width={56} height={69} className="mx-auto mb-4" />
        <h1 className="text-[22px] font-serif font-semibold text-ink mb-2">We couldn&apos;t find that course</h1>
        <p className="text-ink-soft text-sm">Please use the booking link on your course&apos;s website, or contact <a href={`mailto:${SUPPORT_EMAIL}`} className="text-pine hover:underline">{SUPPORT_EMAIL}</a>.</p>
        <Link href="/" className="mt-6 inline-block text-sm text-pine hover:underline font-medium">&larr; Back to home</Link>
      </div>
    </div>
  );
}
