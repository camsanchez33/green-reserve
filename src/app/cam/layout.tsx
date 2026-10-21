import type { Metadata } from 'next';

// AW-1: /cam is linked from nowhere and kept out of search results.
export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false, nocache: true } };

export default function CamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
