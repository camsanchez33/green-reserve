import type { Metadata } from 'next';
// SC-2 §2: token-gated page, never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function CallLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
