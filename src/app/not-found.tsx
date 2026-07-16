import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="text-center max-w-sm">
        <Image
          src="/brand/birdie-sitting.png"
          alt=""
          width={120}
          height={169}
          loading="lazy"
          className="mx-auto mb-6"
        />
        <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink mb-2">
          Birdie couldn&apos;t find that one
        </h1>
        <p className="text-ink-muted text-sm mb-6">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <Link href="/" className="text-sm text-pine hover:underline font-medium">
          &larr; Back to home
        </Link>
      </div>
    </div>
  );
}
