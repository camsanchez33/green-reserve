import type { Metadata } from 'next';

// SD-7: the setup sheet is reached by a tokenised link emailed to one course.
// It was indexable; a crawler that ever saw the URL could surface a live
// write path into the pipeline. Never index, never follow.
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default function DetailsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
