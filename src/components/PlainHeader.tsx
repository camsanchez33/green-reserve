import Link from 'next/link';
import Image from 'next/image';

// FLOW-1 (Cam 2026-10-01): the homepage's header for the self-contained public
// pages that skip the shared Nav (/for-courses, the setup sheet, /call). Logo
// pinned top-left exactly as on `/`, on the plain ground; no pine band.
export default function PlainHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="px-6 md:px-10 py-5 flex items-center justify-between gap-4">
      <Link href="/" className="flex items-center shrink-0" aria-label="GreenReserve home">
        <Image src="/brand/logo.svg" unoptimized alt="GreenReserve" width={240} height={45} priority className="w-[170px] min-[960px]:w-[240px] h-auto" />
      </Link>
      {right}
    </header>
  );
}
