'use client';
// AGREEMENT_SPEC AG-2 — the standalone signing page for courses that are
// past onboarding: legacy operators who predate signature capture, and
// (AG-3) anyone asked to re-accept a bumped version. Same step as onboarding.
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import SignAgreements from '@/components/dashboard/SignAgreements';

export default function SignPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-paper p-4">
      <div className="max-w-xl mx-auto pt-10">
        <div className="text-center mb-8">
          <Image src="/brand/logo-lockup-900.png" alt="GreenReserve" width={190} height={36} priority className="w-[190px] max-w-full h-auto mx-auto" />
        </div>
        <div className="bg-white border border-line rounded-lg p-6">
          <h2 className="text-[24px] font-serif font-medium leading-none text-ink mb-1">Sign the agreements</h2>
          <p className="text-sm text-ink-soft mb-6">The terms every course on GreenReserve operates under. Read each one to the end, then sign once.</p>
          <SignAgreements onSigned={() => router.push('/dashboard')} continueLabel="Sign and return to the dashboard" />
        </div>
      </div>
    </div>
  );
}
