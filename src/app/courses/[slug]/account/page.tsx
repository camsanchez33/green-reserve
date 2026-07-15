import type { Metadata } from 'next';
import AccountPortalClient from './AccountPortalClient';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountPortalPage({ params }: { params: Promise<{ slug: string }> }) {
  return <AccountPortalClient params={params} />;
}
